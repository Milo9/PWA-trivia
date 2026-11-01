function storageNotice(message) {
  const status = document.getElementById("storage-status");
  status.textContent = message;
  status.classList.remove("hidden");
}

function readStored(key, fallback = null) {
  try {
    const raw = readRawStored(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (e) {
    storageNotice("Some saved data couldn't be read. Your original data has been kept on this device.");
    return fallback;
  }
}

function writeStored(key, value) {
  try {
    const raw = JSON.stringify(value);
    localStorage.setItem(key, raw);
    if (activeStorageTransaction && sharedKey(activeStorageTransaction.name, key)) activeStorageTransaction.data[key] = raw;
    return true;
  } catch (e) {
    storageNotice("Couldn't save on this device. Keep this tab open; recent progress may be lost if you close it. Free some storage and try again.");
    return false;
  }
}

// IndexedDB is authoritative during shared mutations. Its read/write transaction
// also serializes tabs whose localStorage mirrors haven't received storage events
// yet. Web Locks avoid needless contention where supported; neither path relies
// on localStorage event timing for correctness. All action callbacks are synchronous.
let storageLockDb;
let activeStorageTransaction = null;

function sharedKey(name, key) {
  if (name === "feedback") return ["offline-trivia:feedback-queue", "offline-trivia:feedback-reported", "offline-trivia:feedback-failed"].includes(key);
  if (name === "stats") return key === "offline-trivia:stats";
  if (name === "prefs") return key === "offline-trivia:prefs";
  if (name === "seen") return key.startsWith("offline-trivia:seen:");
  if (name.startsWith("round:")) return key === `offline-trivia:${name}`;
  return false;
}

function readRawStored(key) {
  if (activeStorageTransaction && sharedKey(activeStorageTransaction.name, key)) return activeStorageTransaction.data[key] ?? null;
  return localStorage.getItem(key);
}

function removeStored(key) {
  localStorage.removeItem(key);
  if (activeStorageTransaction && sharedKey(activeStorageTransaction.name, key)) delete activeStorageTransaction.data[key];
}

function storageDatabase() {
  if (!storageLockDb) storageLockDb = new Promise((resolve, reject) => {
    const request = indexedDB.open("offline-trivia-locks", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("locks");
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); storageLockDb = null; };
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Storage is busy"));
  });
  return storageLockDb;
}

async function restoreStorageMirrors() {
  try {
    const db = await storageDatabase();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("locks", "readwrite");
      const store = transaction.objectStore("locks");
      let names = [];
      store.getAllKeys().onsuccess = event => { names = event.target.result; };
      store.getAll().onsuccess = event => {
        try {
          event.target.result.forEach((record, index) => {
            if (!record || record.v !== 1 || !record.data || typeof record.data !== "object") return;
            const name = names[index];
            for (const key of Object.keys(localStorage).filter(key => sharedKey(name, key))) {
              if (!Object.hasOwn(record.data, key)) localStorage.removeItem(key);
            }
            for (const [key, raw] of Object.entries(record.data)) {
              if (sharedKey(name, key) && typeof raw === "string" && localStorage.getItem(key) !== raw) localStorage.setItem(key, raw);
            }
          });
        } catch (e) { transaction.abort(); reject(e); }
      };
      transaction.oncomplete = resolve;
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  } catch (e) {
    storageLockDb = null;
    storageNotice("Couldn't restore all saved data. Keep this tab open and allow browser storage before continuing.");
  }
}

async function withStorageLock(name, action) {
  try {
    const transact = async () => {
      const db = await storageDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("locks", "readwrite");
        const store = transaction.objectStore("locks");
        const request = store.get(name);
        let result;
        request.onsuccess = () => {
          try {
            const data = request.result && request.result.v === 1 ? request.result.data : Object.fromEntries(
              Object.keys(localStorage).filter(key => sharedKey(name, key)).map(key => [key, localStorage.getItem(key)])
            );
            activeStorageTransaction = { name, data };
            result = action();
            if (result && typeof result.then === "function") throw new Error("Storage actions must be synchronous");
            store.put({ v: 1, data }, name);
          } catch (e) { transaction.abort(); reject(e); }
          finally { activeStorageTransaction = null; }
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error("Storage operation failed"));
      });
    };
    if (navigator.locks) return await navigator.locks.request(`offline-trivia:${name}`, transact);
    return await transact();
  } catch (e) {
    storageLockDb = null;
    storageNotice("Couldn't safely update saved data. Keep this tab open and allow browser storage, then try again.");
    return null;
  }
}

document.getElementById("storage-reload-btn").onclick = () => window.location.reload();

// Pure rules (round building, resume reconciliation, stats) live in
// game-logic.js, loaded before this file; see test/game-logic.test.js.
const {
  SURVIVAL_LIVES,
  SURVIVAL_POOL_CAP,
  shuffle,
  filterByDifficulty,
  buildRound,
  reconcileResume,
  starRating,
  defaultStats,
  todayBucket,
  applyGameResult,
} = GameLogic;

// Pure outbox rules for thumbs-down question reports live in
// feedback-queue.js (loaded before this file); see test/feedback-queue.test.js.
const {
  MAX_COMMENT_LENGTH,
  BACKOFF_MAX_MS,
  makeId,
  createReport,
  enqueue,
  dueItems,
  nextDueAt,
  classify,
  applyOutcome,
  toWireBody,
} = FeedbackQueue;

// Firebase Realtime Database root URL, e.g.
// "https://my-trivia-default-rtdb.firebaseio.com" (no trailing slash).
// Empty = reports queue locally but never upload. See README "Question feedback".
const FEEDBACK_DB_URL = "https://offline-trivia-feedback-default-rtdb.firebaseio.com";

const COUNT_OPTIONS = [10, 20, 30, 40];
const DIFFICULTY_OPTIONS = [
  { id: "any", label: "Any" },
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
];
const MODE_OPTIONS = [
  { id: "standard", label: "Standard" },
  { id: "survival", label: "Survival" },
];
const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];
const CATEGORY_ICONS = {
  friends: "☕",
  "big-bang-theory": "🤓",
  history: "🏛️",
  geography: "🌍",
  "science-technology": "🧪",
  "animals-nature": "🦁",
  "space-astronomy": "🚀",
  "arts-literature": "🎨",
  "film-tv": "🎬",
  music: "🎵",
  sports: "🏆",
  "food-drink": "🍔",
  "mythology-religion": "⚡",
  "world-cultures": "🗺️",
  general: "🧠",
  "business-brands": "💼",
  catchphrases: "💬",
  "tv-catchphrases": "📺",
};
const DEFAULT_CATEGORY_ICON = "🎯";

function categoryIcon(id) {
  return CATEGORY_ICONS[id] || DEFAULT_CATEGORY_ICON;
}

// Fixed per-category accent so the same category always themes the quiz
// screen the same way, independent of the category picker's position-based
// nth-child cycling (data/categories.json order can and does change).
const CATEGORY_COLORS = {
  friends: "--card-1",
  "big-bang-theory": "--card-2",
  history: "--card-3",
  geography: "--card-4",
  "science-technology": "--card-5",
  "animals-nature": "--card-6",
  "space-astronomy": "--card-7",
  "arts-literature": "--card-8",
  "film-tv": "--card-1",
  music: "--card-2",
  sports: "--card-3",
  "food-drink": "--card-4",
  "mythology-religion": "--card-5",
  "world-cultures": "--card-6",
  general: "--card-7",
  "business-brands": "--card-8",
  "civics-law-economics": "--card-1",
  catchphrases: "--card-2",
  "tv-catchphrases": "--card-3",
};

function categoryAccentVar(id) {
  return `var(${CATEGORY_COLORS[id] || "--accent"})`;
}

const state = {
  categories: [],
  categoryById: {},
  selectedCategoryIds: new Set(),
  currentCategories: [],
  pendingCategories: [],
  settings: { count: 10, difficulty: "any", mode: "standard" },
  roundSettings: null, // settings snapshot of the active/last-shown round (Play Again replays these, not the picker's current choices)
  roundId: null,
  roundRevision: 0,
  roundPersisted: false,
  roundConflict: false,
  resultsRecorded: false,
  resultsInFlight: false,
  answerPending: null,
  loadedFiles: {}, // { [categoryId]: Promise<Question[]> } — question files are fetched lazily, see ensureLoaded()
  roundQuestions: [],
  currentIndex: 0,
  score: 0,
  streak: 0,
  bestStreak: 0,
  answers: [], // { id, question, options, correctAnswer, selected, wasCorrect, category } — id is absent on rounds saved before feedback reporting existed
  appBuild: 0, // build number from version.json, stamped onto feedback reports
  seenByCat: {}, // { [categoryId]: Set<questionId> } — this round's in-progress seen tracking
  lifelineUsed: false, // 50/50 lifeline, one per round
  mode: "standard", // "standard" | "survival" — mirrors settings.mode for the active round
  lives: 0, // survival mode only
};

const el = {
  categoryList: document.getElementById("category-list"),
  categoriesStatus: document.getElementById("categories-status"),
  appVersion: document.getElementById("app-version"),
  feedbackPending: document.getElementById("feedback-pending"),

  screenCategories: document.getElementById("screen-categories"),
  screenSettings: document.getElementById("screen-settings"),
  screenQuiz: document.getElementById("screen-quiz"),
  screenResults: document.getElementById("screen-results"),

  statsSummary: document.getElementById("stats-summary"),
  categoryCounts: document.getElementById("category-counts"),
  resetStatsBtn: document.getElementById("reset-stats-btn"),
  selectionBar: document.getElementById("selection-bar"),
  selectAllBtn: document.getElementById("select-all-btn"),
  playSelectedBtn: document.getElementById("play-selected-btn"),
  quickPlayBtn: document.getElementById("quick-play-btn"),
  soundToggleBtn: document.getElementById("sound-toggle-btn"),
  autoAdvanceToggleBtn: document.getElementById("auto-advance-toggle-btn"),
  themeToggleBtn: document.getElementById("theme-toggle-btn"),

  settingsCategoryName: document.getElementById("settings-category-name"),
  modeOptions: document.getElementById("mode-options"),
  countGroup: document.getElementById("count-group"),
  countOptions: document.getElementById("count-options"),
  difficultyOptions: document.getElementById("difficulty-options"),
  settingsAvailability: document.getElementById("settings-availability"),
  startRoundBtn: document.getElementById("start-round-btn"),
  settingsBackBtn: document.getElementById("settings-back-btn"),

  quitBtn: document.getElementById("quit-btn"),
  quizBody: document.getElementById("quiz-body"),
  progressTrack: document.getElementById("progress-track"),
  progressFill: document.getElementById("progress-fill"),
  scoreChip: document.getElementById("score-chip"),
  livesDisplay: document.getElementById("lives-display"),
  questionCounter: document.getElementById("question-counter"),
  questionCategory: document.getElementById("question-category"),
  questionDifficulty: document.getElementById("question-difficulty"),
  reportBtn: document.getElementById("report-btn"),
  questionText: document.getElementById("question-text"),
  optionsList: document.getElementById("options-list"),
  streakBadge: document.getElementById("streak-badge"),
  nextBtn: document.getElementById("next-btn"),
  lifelineBtn: document.getElementById("lifeline-btn"),
  milestoneFlash: document.getElementById("milestone-flash"),

  resultsScore: document.getElementById("results-score"),
  resultsStars: document.getElementById("results-stars"),
  resultsSubtitle: document.getElementById("results-subtitle"),
  resultsStats: document.getElementById("results-stats"),
  resultsCategoryBreakdown: document.getElementById("results-category-breakdown"),
  resultsReview: document.getElementById("results-review"),
  playAgainBtn: document.getElementById("play-again-btn"),
  chooseCategoryBtn: document.getElementById("choose-category-btn"),

  confettiCanvas: document.getElementById("confetti-canvas"),
  answerAnnouncer: document.getElementById("answer-announcer"),
  updateToast: document.getElementById("update-toast"),
  updateReloadBtn: document.getElementById("update-reload-btn"),
  updateDismissBtn: document.getElementById("update-dismiss-btn"),

  confirmSheetOverlay: document.getElementById("confirm-sheet-overlay"),
  confirmSheet: document.getElementById("confirm-sheet"),
  confirmSheetTitle: document.getElementById("confirm-sheet-title"),
  confirmSheetMessage: document.getElementById("confirm-sheet-message"),
  confirmSheetCancel: document.getElementById("confirm-sheet-cancel"),
  confirmSheetConfirm: document.getElementById("confirm-sheet-confirm"),

  feedbackSheetOverlay: document.getElementById("feedback-sheet-overlay"),
  feedbackSheet: document.getElementById("feedback-sheet"),
  feedbackSheetQuestion: document.getElementById("feedback-sheet-question"),
  feedbackComment: document.getElementById("feedback-comment"),
  feedbackCounter: document.getElementById("feedback-counter"),
  feedbackError: document.getElementById("feedback-error"),
  feedbackCancel: document.getElementById("feedback-cancel"),
  feedbackSubmit: document.getElementById("feedback-submit"),
};

let currentScreen = "categories";

// History model: the browser history holds at most two entries for this
// app — the categories screen (root, depth 0) and whichever other screen is
// showing (depth 1). Moving between non-root screens replaces the depth-1
// entry, so Back always means "go home" (with a quit confirm mid-round)
// instead of exiting the PWA or walking back through every question. Set
// while we're deliberately calling history.back() ourselves, so the popstate
// that follows doesn't get treated as a user Back press.
let ignoreNextPop = false;

function historyDepth() {
  return history.state && typeof history.state.depth === "number" ? history.state.depth : 0;
}

function syncHistory(name) {
  try {
    if (name === "categories") {
      if (historyDepth() > 0) {
        ignoreNextPop = true;
        history.back();
      }
    } else if (historyDepth() > 0) {
      history.replaceState({ depth: 1, screen: name }, "");
    } else {
      history.pushState({ depth: 1, screen: name }, "");
    }
  } catch (e) {
    // history API unavailable (e.g. sandboxed) — Back just won't be intercepted
  }
}

function showScreen(name, { fromHistory = false } = {}) {
  for (const s of [el.screenCategories, el.screenSettings, el.screenQuiz, el.screenResults]) {
    s.classList.add("hidden");
  }
  currentScreen = name;
  if (name === "categories") {
    el.screenCategories.classList.remove("hidden");
    if (state.categories.length) renderCategoryList();
    renderStatsSummary();
    renderCategoryCounts();
    renderQuickPlay();
    renderFeedbackPending();
  }
  if (name === "settings") el.screenSettings.classList.remove("hidden");
  if (name === "quiz") el.screenQuiz.classList.remove("hidden");
  if (name === "results") el.screenResults.classList.remove("hidden");
  if (!fromHistory) syncHistory(name);
  window.scrollTo(0, 0);
}

window.addEventListener("popstate", async () => {
  if (ignoreNextPop) {
    ignoreNextPop = false;
    return;
  }
  if (feedbackSheetOpen) {
    // Back while the report sheet is open just closes the sheet. Re-push the
    // depth-1 entry the Back press consumed so the app stays on this screen
    // (no history entry is ever pushed when the sheet opens).
    history.pushState({ depth: 1, screen: currentScreen }, "");
    cancelFeedbackSheet();
    return;
  }
  if (historyDepth() > 0) {
    // Forward navigation onto our depth-1 entry — nothing to restore, so
    // collapse it back to the root rather than showing a stale screen.
    ignoreNextPop = true;
    history.back();
    return;
  }
  if (currentScreen === "categories") return;
  if (currentScreen === "quiz" && !isRoundOver()) {
    // Re-push first so the app stays on the quiz entry while the sheet is
    // open; a second Back then re-asks rather than exiting.
    history.pushState({ depth: 1, screen: "quiz" }, "");
    const confirmed = await confirmQuit();
    if (!confirmed) return;
    abandonRound();
    showScreen("categories");
    return;
  }
  showScreen("categories", { fromHistory: true });
});

const PREFS_KEY = "offline-trivia:prefs";

function systemPrefersLightTheme() {
  return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches);
}

function defaultPrefs() {
  return { sound: true, autoAdvance: true, theme: systemPrefersLightTheme() ? "light" : "dark" };
}

function loadPrefs() {
  return StorageLogic.prefs(readStored(PREFS_KEY), defaultPrefs());
}

function savePrefs(prefs) {
  return writeStored(PREFS_KEY, { ...prefs, v: 1 });
}

const prefs = loadPrefs();

// Applied on load (in addition to index.html's inline pre-paint script,
// which only covers the case where a theme was already saved) and again
// whenever the theme toggle is pressed. Also syncs the browser-chrome tint
// (theme-color) so it doesn't stay dark-mode-colored in a light session.
function applyTheme() {
  document.documentElement.setAttribute("data-theme", prefs.theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", prefs.theme === "light" ? "#f6f3fb" : "#0a0714");
}

function renderPrefsRow() {
  el.soundToggleBtn.textContent = prefs.sound ? "🔊 Sound On" : "🔇 Sound Off";
  el.soundToggleBtn.classList.toggle("active", prefs.sound);
  el.autoAdvanceToggleBtn.textContent = prefs.autoAdvance ? "⏭ Auto-Advance On" : "⏭ Auto-Advance Off";
  el.autoAdvanceToggleBtn.classList.toggle("active", prefs.autoAdvance);
  el.themeToggleBtn.textContent = prefs.theme === "light" ? "☀️ Light Mode" : "🌙 Dark Mode";
  el.themeToggleBtn.classList.toggle("active", prefs.theme === "light");
}

el.soundToggleBtn.addEventListener("click", () => withStorageLock("prefs", () => {
  Object.assign(prefs, loadPrefs());
  prefs.sound = !prefs.sound;
  savePrefs(prefs);
  renderPrefsRow();
}));

el.autoAdvanceToggleBtn.addEventListener("click", () => withStorageLock("prefs", () => {
  Object.assign(prefs, loadPrefs());
  prefs.autoAdvance = !prefs.autoAdvance;
  savePrefs(prefs);
  renderPrefsRow();
}));

el.themeToggleBtn.addEventListener("click", () => withStorageLock("prefs", () => {
  Object.assign(prefs, loadPrefs());
  prefs.theme = prefs.theme === "light" ? "dark" : "light";
  savePrefs(prefs);
  applyTheme();
  renderPrefsRow();
}));

applyTheme();
renderPrefsRow();

const PICKER_STATE_KEY = "offline-trivia:picker-state";

// Persists the category picker's selection and the settings screen's
// choices across launches — separate from LAST_ROUND_KEY below, which only
// snapshots a round that was actually started (for Quick Play).
function savePickerState() {
  try {
    localStorage.setItem(
      PICKER_STATE_KEY,
      JSON.stringify({
        v: 1,
        selectedCategoryIds: Array.from(state.selectedCategoryIds),
        settings: state.settings,
      })
    );
  } catch (e) {
    storageNotice("Couldn't save your category selection. Allow browser storage and try again.");
  }
}

function loadPickerState() {
  const value = readStored(PICKER_STATE_KEY);
  if (!value || typeof value !== "object" || (value.v !== undefined && value.v !== 1)) return null;
  return {
    selectedCategoryIds: Array.isArray(value.selectedCategoryIds) ? value.selectedCategoryIds.filter(StorageLogic.categoryId) : [],
    settings: StorageLogic.settings(value.settings),
  };
}

const LAST_ROUND_KEY = "offline-trivia:last-round";

// Snapshot of the last round actually started (not just the picker's current
// selection), so Quick Play always replays what you last played even if
// you've since fiddled with the picker without pressing Play.
function saveLastRoundConfig(categories, settings) {
  try {
    localStorage.setItem(
      LAST_ROUND_KEY,
      JSON.stringify({
        v: 1,
        categoryIds: categories.map((c) => c.id),
        settings,
      })
    );
  } catch (e) {
    storageNotice("Couldn't save Quick Play settings. Allow browser storage and try again.");
  }
}

function loadLastRoundConfig() {
  const value = readStored(LAST_ROUND_KEY);
  if (!value || !Array.isArray(value.categoryIds) || (value.v !== undefined && value.v !== 1)) return null;
  return { categoryIds: [...new Set(value.categoryIds.filter(StorageLogic.categoryId))], settings: StorageLogic.settings(value.settings) };
}

function quickPlayLabel(categories, settings) {
  const names = categories.length <= 2 ? categories.map((c) => c.name).join(" + ") : `${categories.length} Categories`;
  const modeLabel = settings.mode === "survival" ? "Survival" : `${settings.count}Q`;
  const diffOpt = DIFFICULTY_OPTIONS.find((d) => d.id === settings.difficulty);
  return `▶ Quick Play: ${names} (${modeLabel} · ${diffOpt ? diffOpt.label : "Any"})`;
}

// How many questions a category has at a difficulty, without needing its
// question file loaded: uses the counts stamp-version.js writes into
// categories.json, falling back to the loaded questions when present.
function categoryCountAt(cat, difficulty) {
  if (cat.questions) return filterByDifficulty(cat.questions, difficulty).length;
  if (difficulty === "any") return cat.questionCount || 0;
  return (cat.difficultyCounts && cat.difficultyCounts[difficulty]) || 0;
}

// Renders (or hides) the Quick Play button based on whether the last-started
// round's categories still exist and still have questions at that
// difficulty. Requires state.categoryById to be populated.
function renderQuickPlay() {
  const cfg = loadLastRoundConfig();
  if (!cfg || !Array.isArray(cfg.categoryIds) || !cfg.settings) {
    el.quickPlayBtn.classList.add("hidden");
    return;
  }
  const categories = cfg.categoryIds.map((id) => state.categoryById[id]).filter(Boolean);
  if (!categories.length) {
    el.quickPlayBtn.classList.add("hidden");
    return;
  }
  const available = categories.reduce((n, c) => n + categoryCountAt(c, cfg.settings.difficulty), 0);
  if (available === 0) {
    el.quickPlayBtn.classList.add("hidden");
    return;
  }
  el.quickPlayBtn.textContent = quickPlayLabel(categories, cfg.settings);
  el.quickPlayBtn.classList.remove("hidden");
  el.quickPlayBtn.onclick = () => {
    withLoaded(el.quickPlayBtn, categories, () => {
      state.settings = { ...state.settings, ...cfg.settings };
      startRound(categories, state.settings);
    });
  };
}

let audioCtx = null;

function getAudioCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playTone(ctx, freq, startTime, duration, gainPeak) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

// streak escalation: correct-answer tone rises in pitch with the streak,
// capped so it doesn't climb forever on a long run.
function playAnswerSound(wasCorrect, streak) {
  if (!prefs.sound) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  if (wasCorrect) {
    const step = Math.min(streak || 0, 10);
    const pitchUp = 1 + step * 0.035;
    playTone(ctx, 660 * pitchUp, now, 0.12, 0.15);
    playTone(ctx, 880 * pitchUp, now + 0.09, 0.16, 0.15);
  } else {
    playTone(ctx, 220, now, 0.22, 0.12);
  }
}

function vibrate(pattern) {
  if (!prefs.sound) return;
  if (navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      // vibration unsupported/blocked — safe to ignore
    }
  }
}

// In-theme replacement for window.confirm(). Resolves true/false; only one
// sheet is ever open at a time since the app has no overlapping flows that
// would need it. Behaves like a real modal: focus moves into the sheet and
// back out afterwards, Escape cancels, Tab cycles within the two buttons,
// and everything behind it is made inert so it can't be tabbed or clicked.
let confirmSheetOpen = false;

function showConfirmSheet({ title, message, confirmText = "Confirm", cancelText = "Cancel", danger = false }) {
  if (confirmSheetOpen || feedbackSheetOpen) return Promise.resolve(false);
  confirmSheetOpen = true;
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement;
    el.confirmSheetTitle.textContent = title;
    el.confirmSheetMessage.textContent = message;
    el.confirmSheetConfirm.textContent = confirmText;
    el.confirmSheetCancel.textContent = cancelText;
    el.confirmSheetConfirm.classList.toggle("primary-btn", !danger);
    el.confirmSheetConfirm.classList.toggle("danger-btn", danger);
    el.confirmSheetOverlay.classList.remove("hidden");
    document.getElementById("app").inert = true;
    // Cancel is the safe default focus — every use of this sheet is either
    // destructive (quit, reset) or a resume prompt where "Discard" is the
    // action that needs the most deliberate choice anyway.
    el.confirmSheetCancel.focus();

    function cleanup(result) {
      el.confirmSheetOverlay.classList.add("hidden");
      document.getElementById("app").inert = false;
      el.confirmSheetConfirm.removeEventListener("click", onConfirm);
      el.confirmSheetCancel.removeEventListener("click", onCancel);
      el.confirmSheetOverlay.removeEventListener("click", onOverlayClick);
      document.removeEventListener("keydown", onKeyDown, true);
      confirmSheetOpen = false;
      if (previouslyFocused && typeof previouslyFocused.focus === "function" && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
      resolve(result);
    }
    function onConfirm() {
      cleanup(true);
    }
    function onCancel() {
      cleanup(false);
    }
    function onOverlayClick(e) {
      if (e.target === el.confirmSheetOverlay) cleanup(false);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup(false);
      } else if (e.key === "Tab") {
        // Only two focusable controls — just bounce between them.
        e.preventDefault();
        const next = document.activeElement === el.confirmSheetCancel ? el.confirmSheetConfirm : el.confirmSheetCancel;
        next.focus();
      }
    }

    el.confirmSheetConfirm.addEventListener("click", onConfirm);
    el.confirmSheetCancel.addEventListener("click", onCancel);
    el.confirmSheetOverlay.addEventListener("click", onOverlayClick);
    document.addEventListener("keydown", onKeyDown, true);
  });
}

// --- Question feedback ---
//
// Thumbs-down reports persist to localStorage immediately (an outbox), then
// upload on their own to a Firebase Realtime Database over plain fetch
// whenever a connection exists. The rules (classification, backoff, queue
// caps) are pure and live in feedback-queue.js. Reporting never touches
// score, streak, lives, seen-ids, stats or the saved active round.

const FEEDBACK_QUEUE_KEY = "offline-trivia:feedback-queue";
const FEEDBACK_REPORTED_KEY = "offline-trivia:feedback-reported";
const FEEDBACK_DEVICE_KEY = "offline-trivia:feedback-device";
const FEEDBACK_FAILED_KEY = "offline-trivia:feedback-failed";
const FEEDBACK_REPORTED_CAP = 5000;
const FEEDBACK_FETCH_TIMEOUT_MS = 15_000;

// Not clearing these in "Reset Stats" is deliberate: they aren't stats, and
// wiping them would silently throw away reports that haven't uploaded yet.

function loadJsonArray(key) {
  const value = readStored(key, []);
  if (Array.isArray(value)) return value;
  storageNotice("Some saved data needs recovery. Your original data has been kept on this device.");
  return [];
}

function loadFeedbackQueue() {
  let value;
  try {
    const raw = readRawStored(FEEDBACK_QUEUE_KEY);
    try { value = raw === null ? [] : JSON.parse(raw); }
    catch (e) { value = raw; }
  } catch (e) {
    storageNotice("Couldn't read saved reports. Allow browser storage before submitting another report.");
    return [{ original: null, report: null, failed: true, attempts: 0, nextAttemptAt: 0 }];
  }
  const queue = StorageLogic.queue(value);
  // Keep malformed data exportable; never overwrite it with an empty queue.
  return queue || [{ original: value, report: null, failed: true, attempts: 0, nextAttemptAt: 0, lastError: "Saved reports need recovery" }];
}

function saveFeedbackQueue(queue) {
  return writeStored(FEEDBACK_QUEUE_KEY, queue);
}

function loadReportedIds() {
  return new Set([
    ...loadJsonArray(FEEDBACK_REPORTED_KEY).filter(StorageLogic.questionId),
    ...loadFeedbackQueue().map(item => item.report && item.report.questionId).filter(StorageLogic.questionId),
  ]);
}

function addReportedId(questionId) {
  const ids = loadJsonArray(FEEDBACK_REPORTED_KEY).filter(id => StorageLogic.questionId(id) && id !== questionId);
  ids.push(questionId);
  return writeStored(FEEDBACK_REPORTED_KEY, ids.slice(-FEEDBACK_REPORTED_CAP));
}

function newReportId() {
  return makeId(crypto.getRandomValues(new Uint8Array(16)));
}

let memoryDeviceId = null;

// Random per-install id (no PII); lets the server rules tell "same device
// retrying" apart from "someone else overwriting a report".
function getDeviceId() {
  try {
    const saved = localStorage.getItem(FEEDBACK_DEVICE_KEY);
    if (saved && /^[A-Za-z0-9_-]{22}$/.test(saved)) return saved;
  } catch (e) {
    // fall through to the in-memory id
  }
  if (!memoryDeviceId) {
    memoryDeviceId = newReportId();
    try {
      localStorage.setItem(FEEDBACK_DEVICE_KEY, memoryDeviceId);
    } catch (e) {
      // storage unavailable — the id lasts for this session only
    }
  }
  return memoryDeviceId;
}

// Legacy failed reports remain exportable; new failures stay in the outbox.
function loadFailedReports() {
  return loadJsonArray(FEEDBACK_FAILED_KEY);
}

function feedbackBaseUrl() {
  const url = String(FEEDBACK_DB_URL || "").replace(/\/+$/, "");
  return url.startsWith("https://") ? url : "";
}

function renderFeedbackPending() {
  const queue = loadFeedbackQueue();
  const failed = queue.filter(item => item.failed).length + loadFailedReports().length;
  const pending = queue.filter(item => !item.failed).length;
  el.feedbackPending.textContent = [
    pending ? `${pending} report${pending === 1 ? "" : "s"} waiting to upload` : "",
    failed ? `${failed} report${failed === 1 ? "" : "s"} need attention` : "",
  ].filter(Boolean).join(" · ");
  el.feedbackPending.classList.toggle("hidden", !pending && !failed);
  document.getElementById("feedback-recovery").classList.toggle("hidden", !pending && !failed);
  document.getElementById("feedback-retry-btn").classList.toggle("hidden", !failed);
}

async function submitFeedback({ question, selected, comment, context }) {
  let report;
  try {
    report = createReport({ id: newReportId(), question, selected, comment, context, deviceId: getDeviceId(), appBuild: state.appBuild, now: Date.now() });
    if (!StorageLogic.report(report)) return { ok: false, message: "This question's report needs recovery. Please export your reports." };
  } catch (e) { return { ok: false }; }
  const result = await withStorageLock("feedback", () => {
    const queue = loadFeedbackQueue();
    if (loadReportedIds().has(question.id)) return { ok: true };
    let next;
    try { next = enqueue(queue, report); }
    catch (e) { return { ok: false, message: "Your report queue is full. Upload or export existing reports before trying again." }; }
    if (!saveFeedbackQueue(next)) return { ok: false };
    addReportedId(question.id);
    return { ok: true };
  });
  renderFeedbackPending();
  if (result && result.ok) flushFeedback();
  return result || { ok: false };
}

document.getElementById("feedback-export-btn").onclick = () => {
  // Include raw values too, so even invalid JSON can be recovered without loss.
  const raw = {};
  for (const key of [FEEDBACK_QUEUE_KEY, FEEDBACK_FAILED_KEY]) {
    try { raw[key] = localStorage.getItem(key); } catch (e) { storageNotice("Couldn't read reports for export."); return; }
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify({ v: 1, exportedAt: new Date().toISOString(), reports: loadFeedbackQueue(), legacyFailures: loadFailedReports(), raw }, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "offline-trivia-reports.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

document.getElementById("feedback-retry-btn").onclick = async () => {
  await withStorageLock("feedback", () => {
    const queue = loadFeedbackQueue();
    const legacy = loadFailedReports();
    for (const item of legacy) {
      if (item && StorageLogic.report(item.report) && !queue.some(q => q.report && q.report.id === item.report.id)) {
        // Preserve every legacy failure, even when migration temporarily exceeds the cap.
        queue.push({ report: item.report, failed: true, attempts: 0, nextAttemptAt: 0, lastError: String(item.status || "") });
      }
    }
    const next = queue.map(item => StorageLogic.report(item.report) ? { ...item, failed: false, attempts: 0, nextAttemptAt: 0, lastError: "" } : item);
    if (saveFeedbackQueue(next)) {
      // Only remove archived entries after their recoverable copies were saved.
      writeStored(FEEDBACK_FAILED_KEY, legacy.filter(item => !item || !StorageLogic.report(item.report)));
    }
    if (next.some(item => item.failed)) storageNotice("Some reports need manual recovery. Export reports to keep a copy.");
  });
  renderFeedbackPending();
  flushFeedback();
};

let feedbackFlushInFlight = false;
let feedbackRetryTimer = null;

async function sendFeedbackItem(base, item) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEEDBACK_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/feedback/${encodeURIComponent(item.report.id)}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toWireBody(item.report)),
      cache: "no-store",
      signal: controller.signal,
    });
    return { status: res.status };
  } catch (e) {
    return { networkError: true };
  } finally {
    clearTimeout(timer);
  }
}

// Reserve delivery across tabs, but keep the storage lock out of the network
// wait so another tab can enqueue while a request is pending.
async function flushFeedback() {
  const base = feedbackBaseUrl();
  if (!base || feedbackFlushInFlight) return;
  feedbackFlushInFlight = true;
  let wasOffline = false;
  try {
    const pending = dueItems(loadFeedbackQueue(), Date.now());
    for (const candidate of pending) {
      const reservation = await withStorageLock("feedback", () => {
        const queue = loadFeedbackQueue();
        const item = queue.find(it => it.report && it.report.id === candidate.report.id);
        if (!item || item.failed || item.nextAttemptAt > Date.now() || (item.sendingUntil || 0) > Date.now()) return null;
        item.sendingUntil = Date.now() + FEEDBACK_FETCH_TIMEOUT_MS + 5000;
        item.deliveryToken = newReportId();
        return saveFeedbackQueue(queue) ? { ...item } : null;
      });
      if (!reservation) continue;
      const result = await sendFeedbackItem(base, reservation);
      const outcome = classify(result);
      await withStorageLock("feedback", () => {
        const queue = loadFeedbackQueue();
        const item = queue.find(it => it.report && it.report.id === reservation.report.id);
        if (!item || item.deliveryToken !== reservation.deliveryToken) return;
        delete item.sendingUntil;
        delete item.deliveryToken;
        const next = applyOutcome(queue, item.report.id, outcome, Date.now(), result.status).queue;
        saveFeedbackQueue(next);
      });
      if (outcome === "offline") { wasOffline = true; break; }
    }
  } finally {
    feedbackFlushInFlight = false;
    renderFeedbackPending();
    scheduleFeedbackRetry({ wasOffline });
  }
}

// iOS Safari has no Background Sync, so the page drives delivery itself. The
// timer covers the case where the `online` event doesn't fire (also flaky on
// iOS). After an offline stop everything is still due immediately, hence the
// 60s floor — a 5s one would poll for an entire flight.
function scheduleFeedbackRetry({ wasOffline = false } = {}) {
  if (feedbackRetryTimer) {
    clearTimeout(feedbackRetryTimer);
    feedbackRetryTimer = null;
  }
  if (!feedbackBaseUrl()) return;
  const due = nextDueAt(loadFeedbackQueue());
  if (due === null) return;
  const floor = wasOffline ? 60_000 : 5_000;
  const delay = Math.min(Math.max(due - Date.now(), floor), BACKOFF_MAX_MS);
  feedbackRetryTimer = setTimeout(flushFeedback, delay);
}

function setReportButtonState(btn, reported) {
  btn.classList.toggle("reported", reported);
  btn.disabled = reported;
  btn.setAttribute("aria-pressed", reported ? "true" : "false");
  btn.setAttribute("aria-label", reported ? "Question reported" : "Report a problem with this question");
  btn.textContent = reported ? "👎 Reported" : "👎";
}

// Report sheet. Modeled on showConfirmSheet, but with its own keydown handler
// (that one traps Tab between exactly two buttons) and top-anchored in CSS so
// the iOS keyboard doesn't cover it. Resolves true if a report was saved.
// Opening it pushes no history entry; Back is handled in the popstate handler.
let feedbackSheetOpen = false;
let cancelFeedbackSheet = () => {};

function openFeedbackSheet({ question, selected, context }) {
  if (feedbackSheetOpen || confirmSheetOpen) return Promise.resolve(false);
  feedbackSheetOpen = true;
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement;
    el.feedbackSheetQuestion.textContent = question.question;
    let closed = false;
    el.feedbackComment.value = "";
    el.feedbackCounter.textContent = `0/${MAX_COMMENT_LENGTH}`;
    el.feedbackError.classList.add("hidden");
    el.feedbackSubmit.disabled = false;
    el.feedbackSheetOverlay.classList.remove("hidden");
    document.getElementById("app").inert = true;
    el.feedbackComment.focus();

    function cleanup(result) {
      if (closed) return;
      closed = true;
      el.feedbackSheetOverlay.classList.add("hidden");
      document.getElementById("app").inert = false;
      el.feedbackSubmit.removeEventListener("click", onSubmit);
      el.feedbackCancel.removeEventListener("click", onCancel);
      el.feedbackSheetOverlay.removeEventListener("click", onOverlayClick);
      el.feedbackComment.removeEventListener("input", onInput);
      document.removeEventListener("keydown", onKeyDown, true);
      feedbackSheetOpen = false;
      cancelFeedbackSheet = () => {};
      if (previouslyFocused && typeof previouslyFocused.focus === "function" && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
      resolve(result);
    }
    function onCancel() {
      cleanup(false);
    }
    let submitting = false;
    async function onSubmit() {
      if (submitting) return;
      submitting = true;
      el.feedbackSubmit.disabled = true;
      const res = await submitFeedback({ question, selected, comment: el.feedbackComment.value, context });
      if (closed) return;
      submitting = false;
      el.feedbackSubmit.disabled = false;
      if (!res.ok) {
        el.feedbackError.textContent = res.message || "Couldn't save your report on this device. Keep your comment and try again.";
        el.feedbackError.classList.remove("hidden");
        return;
      }
      announce("Thanks — report saved. It'll upload next time you're online.");
      cleanup(true);
    }
    function onOverlayClick(e) {
      if (e.target === el.feedbackSheetOverlay) cleanup(false);
    }
    function onInput() {
      el.feedbackCounter.textContent = `${el.feedbackComment.value.length}/${MAX_COMMENT_LENGTH}`;
    }
    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup(false);
      } else if (e.key === "Tab") {
        e.preventDefault();
        const order = [el.feedbackComment, el.feedbackCancel, el.feedbackSubmit];
        const at = order.indexOf(document.activeElement);
        const step = e.shiftKey ? -1 : 1;
        order[(at + step + order.length) % order.length].focus();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onSubmit();
      }
    }

    cancelFeedbackSheet = onCancel;
    el.feedbackSubmit.addEventListener("click", onSubmit);
    el.feedbackCancel.addEventListener("click", onCancel);
    el.feedbackSheetOverlay.addEventListener("click", onOverlayClick);
    el.feedbackComment.addEventListener("input", onInput);
    document.addEventListener("keydown", onKeyDown, true);
  });
}

// Quiz-screen 👎: available before and after answering (a broken question is
// often obvious before you pick).
el.reportBtn.addEventListener("click", async () => {
  if (state.answerPending) await state.answerPending;
  const q = state.roundQuestions[state.currentIndex];
  if (!q) return;
  // Otherwise a correct answer's auto-advance fires behind the open sheet.
  // Not restarted afterwards — the player taps Next.
  clearAutoAdvanceTimer();
  const answered = state.answers.length > state.currentIndex;
  const saved = await openFeedbackSheet({
    question: q,
    selected: answered ? state.answers[state.currentIndex].selected : null,
    context: answered ? "quiz-after-answer" : "quiz-before-answer",
  });
  if (!saved) return;
  setReportButtonState(el.reportBtn, true);
  // The button is disabled now, so focus can't go back to it.
  if (!el.nextBtn.classList.contains("layout-hidden")) el.nextBtn.focus();
  else el.questionText.focus();
});

// Question files (~7.6MB across all categories) are fetched only when a
// round actually needs them, not at startup — the category picker renders
// straight from categories.json's stamped counts. Each file is fetched at
// most once per session; a failed fetch is forgotten so a retry can work
// (e.g. first ever launch on flaky wifi).
function ensureLoaded(categories) {
  return Promise.all(
    categories.map((cat) => {
      if (cat.questions) return cat.questions;
      if (!state.loadedFiles[cat.id]) {
        state.loadedFiles[cat.id] = fetch(`data/${cat.file}`)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          })
          .then((questions) => {
            // Stored files omit the per-question "category" (implied by the
            // file, stripped at ship time to shrink the payload) — every
            // downstream consumer (seen tracking, stats, results) keys off
            // q.category, so re-attach it here.
            for (const q of questions) q.category = cat.id;
            cat.questions = questions;
            return questions;
          })
          .catch((e) => {
            delete state.loadedFiles[cat.id];
            throw e;
          });
      }
      return state.loadedFiles[cat.id];
    })
  );
}

// Runs `action` once the given categories' questions are loaded, with the
// triggering button disabled and relabelled "Loading…" meanwhile (a no-op
// flash when everything is already in memory).
async function withLoaded(button, categories, action) {
  const label = button.textContent;
  const wasDisabled = button.disabled;
  button.disabled = true;
  button.textContent = "Loading…";
  try {
    await ensureLoaded(categories);
  } catch (e) {
    button.disabled = wasDisabled;
    button.textContent = label;
    el.categoriesStatus.textContent = "Couldn't load those questions. Check your connection and try again.";
    return;
  }
  button.disabled = wasDisabled;
  button.textContent = label;
  action();
}

async function loadCategories() {
  try {
    const res = await fetch("data/categories.json");
    const categories = await res.json();

    state.categories = categories.map((cat) => ({ ...cat }));
    state.categoryById = {};
    for (const cat of state.categories) state.categoryById[cat.id] = cat;

    // A categories.json without stamped counts (never shipped since the
    // counts were introduced, or hand-edited) falls back to loading the
    // files up front so the picker still shows real numbers.
    const unstamped = state.categories.filter((c) => typeof c.questionCount !== "number");
    if (unstamped.length) {
      await Promise.all(unstamped.map((c) => ensureLoaded([c]).catch(() => { c.questions = []; })));
      for (const c of unstamped) c.questionCount = c.questions.length;
    }

    const savedPicker = loadPickerState();
    if (savedPicker) {
      state.settings = savedPicker.settings;
      state.selectedCategoryIds = new Set(
        savedPicker.selectedCategoryIds.filter((id) => state.categoryById[id])
      );
    }

    renderCategoryList();
    renderCategoryCounts();
    renderQuickPlay();
    await tryResumeActiveRound();
  } catch (e) {
    el.categoriesStatus.textContent = "Couldn't load categories. Try reopening the app.";
  }
}

function categoryStatsLine(catId) {
  const stats = loadStats();
  const s = stats.byCategory && stats.byCategory[catId];
  if (!s || !s.totalQuestions) return null;
  return `${Math.round((s.totalCorrect / s.totalQuestions) * 100)}% avg`;
}

function renderCategoryList() {
  el.categoryList.innerHTML = "";
  for (const cat of state.categories) {
    const btn = document.createElement("button");
    const isSelected = state.selectedCategoryIds.has(cat.id);
    btn.className = "category-card" + (isSelected ? " selected" : "");
    const count = categoryCountAt(cat, "any");
    btn.disabled = count === 0;
    const statLine = categoryStatsLine(cat.id);
    const metaLine = `${count} question${count === 1 ? "" : "s"}${statLine ? " · " + statLine : ""}`;
    btn.innerHTML = `
      <span class="category-check" aria-hidden="true"></span>
      <span class="category-icon" aria-hidden="true">${categoryIcon(cat.id)}</span>
      <span class="category-info">
        <span class="category-name"></span>
        <span class="category-meta"></span>
      </span>
    `;
    btn.querySelector(".category-name").textContent = cat.name;
    btn.querySelector(".category-meta").textContent = metaLine;
    btn.addEventListener("click", () => toggleCategorySelection(cat.id));
    el.categoryList.appendChild(btn);
  }
  el.categoriesStatus.textContent = "";
  renderSelectionBar();
}

function renderCategoryCounts() {
  if (!state.categories.length) {
    el.categoryCounts.classList.add("hidden");
    return;
  }
  el.categoryCounts.classList.remove("hidden");
  el.categoryCounts.innerHTML = `<p class="settings-label">Question Bank</p>`;
  for (const cat of state.categories) {
    const statLine = categoryStatsLine(cat.id);
    const value = `${categoryCountAt(cat, "any")} questions${statLine ? " · " + statLine : ""}`;
    el.categoryCounts.appendChild(breakdownRow(cat.name, value));
  }
}

function breakdownRow(label, value) {
  const row = document.createElement("div");
  row.className = "category-breakdown-row";
  const name = document.createElement("span");
  name.textContent = label;
  const val = document.createElement("span");
  val.className = "stats-value";
  val.textContent = value;
  row.append(name, val);
  return row;
}

function toggleCategorySelection(catId) {
  if (state.selectedCategoryIds.has(catId)) {
    state.selectedCategoryIds.delete(catId);
  } else {
    state.selectedCategoryIds.add(catId);
  }
  savePickerState();
  renderCategoryList();
}

function playableCategories() {
  return state.categories.filter((c) => categoryCountAt(c, "any") > 0);
}

function renderSelectionBar() {
  const playable = playableCategories();
  if (playable.length === 0) {
    el.selectionBar.classList.add("hidden");
    return;
  }
  el.selectionBar.classList.remove("hidden");

  const allSelected = playable.every((c) => state.selectedCategoryIds.has(c.id));
  el.selectAllBtn.textContent = allSelected ? "Clear Selection" : "Select All";
  el.selectAllBtn.onclick = () => {
    if (allSelected) {
      state.selectedCategoryIds.clear();
    } else {
      for (const c of playable) state.selectedCategoryIds.add(c.id);
    }
    savePickerState();
    renderCategoryList();
  };

  const count = state.selectedCategoryIds.size;
  el.playSelectedBtn.disabled = count === 0;
  el.playSelectedBtn.textContent = count === 0 ? "Play Selected" : `Play Selected (${count})`;
}

el.playSelectedBtn.addEventListener("click", () => {
  const categories = state.categories.filter((c) => state.selectedCategoryIds.has(c.id));
  if (!categories.length) return;
  withLoaded(el.playSelectedBtn, categories, () => openSettings(categories));
});

function openSettings(categories) {
  state.pendingCategories = categories;
  renderSettingsScreen();
  showScreen("settings");
}

function settingsTitle(categories) {
  if (categories.length === 1) return categories[0].name;
  if (categories.length <= 3) return categories.map((c) => c.name).join(", ");
  return `${categories.length} Categories`;
}

function renderSettingsScreen() {
  el.settingsCategoryName.textContent = settingsTitle(state.pendingCategories);
  const combinedQuestions = state.pendingCategories.flatMap((c) => c.questions);

  el.modeOptions.innerHTML = "";
  for (const mode of MODE_OPTIONS) {
    const btn = document.createElement("button");
    btn.className = "toggle-btn" + (state.settings.mode === mode.id ? " active" : "");
    btn.textContent = mode.label;
    btn.addEventListener("click", () => {
      state.settings.mode = mode.id;
      savePickerState();
      renderSettingsScreen();
    });
    el.modeOptions.appendChild(btn);
  }

  const isSurvival = state.settings.mode === "survival";
  el.countGroup.classList.toggle("hidden", isSurvival);

  el.countOptions.innerHTML = "";
  for (const count of COUNT_OPTIONS) {
    const btn = document.createElement("button");
    btn.className = "toggle-btn" + (state.settings.count === count ? " active" : "");
    btn.textContent = count;
    btn.addEventListener("click", () => {
      state.settings.count = count;
      savePickerState();
      renderSettingsScreen();
    });
    el.countOptions.appendChild(btn);
  }

  el.difficultyOptions.innerHTML = "";
  for (const diff of DIFFICULTY_OPTIONS) {
    const btn = document.createElement("button");
    btn.className = "toggle-btn" + (state.settings.difficulty === diff.id ? " active" : "");
    const count = filterByDifficulty(combinedQuestions, diff.id).length;
    btn.innerHTML = `${diff.label}<span class="toggle-btn-count">${count}</span>`;
    btn.addEventListener("click", () => {
      state.settings.difficulty = diff.id;
      savePickerState();
      renderSettingsScreen();
    });
    el.difficultyOptions.appendChild(btn);
  }

  const pool = filterByDifficulty(combinedQuestions, state.settings.difficulty);
  if (isSurvival) {
    const cap = Math.min(SURVIVAL_POOL_CAP, pool.length);
    el.settingsAvailability.textContent = pool.length === 0
      ? "No questions available at this difficulty — pick another."
      : `Survival: ${SURVIVAL_LIVES} lives. Up to ${cap} questions from this difficulty.`;
  } else {
    const actualCount = Math.min(state.settings.count, pool.length);
    if (pool.length === 0) {
      el.settingsAvailability.textContent = "No questions available at this difficulty — pick another.";
    } else if (actualCount < state.settings.count) {
      el.settingsAvailability.textContent = `Only ${pool.length} questions available at this difficulty — round will use all ${pool.length}.`;
    } else {
      el.settingsAvailability.textContent = `${pool.length} questions available at this difficulty.`;
    }
  }
  el.startRoundBtn.disabled = pool.length === 0;
}

el.settingsBackBtn.addEventListener("click", () => showScreen("categories"));
el.startRoundBtn.addEventListener("click", () => startRound(state.pendingCategories, state.settings));

function seenStorageKey(categoryId) {
  return `offline-trivia:seen:${categoryId}`;
}

function loadSeenIds(categoryId) {
  return new Set(loadJsonArray(seenStorageKey(categoryId)).filter(StorageLogic.questionId));
}

function saveSeenIds(categoryId, seenSet) {
  return writeStored(seenStorageKey(categoryId), Array.from(seenSet));
}

const ACTIVE_ROUND_KEY = "offline-trivia:active-round";

// Checkpointed after every answer and every "Next" tap, so an iOS PWA that
// gets backgrounded/reloaded mid-round (or mid-flight) can pick back up
// instead of losing all progress. Only ever saved at a question boundary
// (not mid-reveal), so resuming always lands on a fresh, unanswered
// question. The lifeline is checkpointed too so reloads cannot restore a used
// lifeline; tryResumeActiveRound reconciles answers before continuing.
function roundStorageKey(id) { return `offline-trivia:round:${id}`; }

function saveActiveRound() {
  const seenByCat = {};
  for (const catId of Object.keys(state.seenByCat)) seenByCat[catId] = Array.from(state.seenByCat[catId]);
  const snapshot = {
    v: 1, roundId: state.roundId, revision: state.roundRevision + 1, savedAt: Date.now(),
    currentCategoryIds: state.currentCategories.map(c => c.id), roundQuestions: state.roundQuestions,
    currentIndex: state.currentIndex, score: state.score, streak: state.streak, bestStreak: state.bestStreak,
    answers: state.answers, seenByCat, lifelineUsed: state.lifelineUsed, mode: state.mode, lives: state.lives, settings: state.roundSettings,
  };
  const ok = writeStored(roundStorageKey(state.roundId), snapshot);
  if (ok) { state.roundRevision = snapshot.revision; state.roundPersisted = true; }
  return ok;
}

function clearActiveRound(roundId = state.roundId) {
  try {
    if (roundId) removeStored(roundStorageKey(roundId));
    const legacy = readStored(ACTIVE_ROUND_KEY);
    if (legacy && (legacy.roundId || `legacy-${hashLegacyRound(legacy)}`) === roundId) localStorage.removeItem(ACTIVE_ROUND_KEY);
  } catch (e) { storageNotice("Couldn't clear the saved round. Its result will still be counted only once."); }
}

function loadActiveRound() {
  const candidates = [];
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith("offline-trivia:round:") && key !== ACTIVE_ROUND_KEY) continue;
      const raw = readStored(key);
      const saved = StorageLogic.round(raw);
      if (!saved) { storageNotice("A saved round couldn't be restored. Other progress is still available; the original save has been kept."); continue; }
      // Stable identity also prevents two tabs restoring the same legacy round from counting it twice.
      if (!saved.roundId) saved.roundId = `legacy-${hashLegacyRound(raw)}`;
      if (loadStats().completedRoundIds.includes(saved.roundId)) continue;
      candidates.push(saved);
    }
  } catch (e) { storageNotice("Saved rounds aren't available. Allow browser storage to resume progress."); }
  return candidates.sort((a, b) => b.savedAt - a.savedAt)[0] || null;
}

function hashLegacyRound(value) {
  let hash = 2166136261;
  for (const char of JSON.stringify(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}

function roundIsCurrent() {
  if (state.roundConflict) return false;
  if (!state.roundPersisted) return true;
  const saved = readStored(roundStorageKey(state.roundId));
  if (saved && saved.revision === state.roundRevision) return true;
  state.roundConflict = true;
  clearAutoAdvanceTimer();
  storageNotice("This round changed in another tab. Reload saved progress to continue with the latest answers.");
  document.getElementById("storage-reload-btn").classList.remove("hidden");
  return false;
}

// Offers to resume a round saved by saveActiveRound(). Requires
// state.categoryById to already be populated, so this must run after
// loadCategories() resolves.
async function tryResumeActiveRound() {
  let saved = loadActiveRound();
  if (!saved) return;

  const categories = saved.currentCategoryIds.map((id) => state.categoryById[id]);
  if (categories.some((c) => !c)) return; // categories didn't load — try again next launch

  const { answeredCount, finished: promptFinished } = reconcileResume(saved);
  const confirmed = await showConfirmSheet({
    title: promptFinished ? "See your last round?" : "Resume your round?",
    message: promptFinished
      ? "Your last round's results are ready."
      : `Question ${answeredCount + 1} of ${saved.roundQuestions.length}.`,
    confirmText: promptFinished ? "See Results" : "Resume",
    cancelText: "Discard",
  });
  const latest = StorageLogic.round(readStored(roundStorageKey(saved.roundId)));
  if (latest) saved = latest;
  const { mode: savedMode, lives: savedLives, finished, currentIndex } = reconcileResume(saved);
  state.roundId = saved.roundId;
  state.roundRevision = saved.revision;
  state.roundPersisted = !!readStored(roundStorageKey(saved.roundId));
  state.roundConflict = false;
  state.resultsRecorded = false;
  if (!confirmed) {
    await withStorageLock(`round:${state.roundId}`, clearActiveRound);
    return;
  }

  state.currentCategories = categories;
  state.roundQuestions = saved.roundQuestions;
  state.score = saved.score;
  state.streak = saved.streak;
  state.bestStreak = saved.bestStreak;
  state.answers = saved.answers;
  state.lifelineUsed = !!saved.lifelineUsed;
  state.mode = savedMode;
  state.lives = savedLives;
  // Rounds saved before roundSettings existed only recorded the mode; fall
  // back to the picker's other settings for those.
  state.roundSettings = saved.settings || { ...state.settings, mode: savedMode };
  state.seenByCat = {};
  for (const catId of Object.keys(saved.seenByCat || {})) {
    state.seenByCat[catId] = new Set(saved.seenByCat[catId]);
  }
  state.currentIndex = currentIndex;
  if (!state.roundPersisted) saveActiveRound();

  if (finished) {
    el.progressFill.style.width = "100%";
    showResults();
  } else {
    showScreen("quiz");
    renderQuestion();
  }
}

const STATS_KEY = "offline-trivia:stats";

function loadStats() {
  return StorageLogic.stats(readStored(STATS_KEY), defaultStats());
}

function saveStats(stats) { return writeStored(STATS_KEY, { ...stats, v: 1 }); }

async function recordGameResult(score, total, answers, bestStreak, mode) {
  const roundId = state.roundId;
  return withStorageLock("stats", () => {
    const prior = loadStats();
    if (prior.completedRoundIds.includes(roundId)) return { prior, updated: prior };
    const updated = applyGameResult(prior, { score, total, answers, bestStreak, mode });
    updated.completedRoundIds = [...prior.completedRoundIds, roundId];
    if (!saveStats(updated)) return null;
    return { prior, updated };
  });
}

function renderStatsSummary() {
  const stats = loadStats();
  if (stats.gamesPlayed === 0) {
    el.statsSummary.classList.add("hidden");
    el.resetStatsBtn.classList.add("hidden");
    return;
  }
  el.statsSummary.classList.remove("hidden");
  el.resetStatsBtn.classList.remove("hidden");

  const overallPct = stats.totalQuestions > 0
    ? Math.round((stats.totalCorrect / stats.totalQuestions) * 100)
    : 0;
  const overallLine =
    `${stats.gamesPlayed} ${stats.gamesPlayed === 1 ? "game" : "games"} · ${overallPct}% avg · ${Math.round(stats.bestPct)}% best`;

  const today = todayBucket(stats);
  const todayLine = today.gamesPlayed === 0
    ? "No games yet"
    : `${today.gamesPlayed} ${today.gamesPlayed === 1 ? "game" : "games"} · ${Math.round((today.totalCorrect / today.totalQuestions) * 100)}% avg`;

  const lastLine = !stats.lastGame
    ? "—"
    : stats.lastGame.mode === "survival"
      ? `Survival: ${stats.lastGame.score}`
      : `${Math.round(stats.lastGame.pct)}% (${stats.lastGame.score}/${stats.lastGame.total})`;

  const survivalRow = stats.bestSurvivalScore > 0
    ? `<div class="stats-row"><span>Best Survival</span><span class="stats-value">💀 ${stats.bestSurvivalScore}</span></div>`
    : "";

  el.statsSummary.innerHTML = `
    <div class="stats-row"><span>Overall</span><span class="stats-value">${overallLine}</span></div>
    <div class="stats-row"><span>Today</span><span class="stats-value">${todayLine}</span></div>
    <div class="stats-row"><span>Last Game</span><span class="stats-value">${lastLine}</span></div>
    <div class="stats-row"><span>Best Streak</span><span class="stats-value">🔥 ${stats.bestStreak}</span></div>
    ${survivalRow}
  `;
}

el.resetStatsBtn.addEventListener("click", async () => {
  const confirmed = await showConfirmSheet({
    title: "Reset all stats?",
    message: "This can't be undone.",
    confirmText: "Reset",
    cancelText: "Cancel",
    danger: true,
  });
  if (!confirmed) return;
  await withStorageLock("stats", () => {
    // Keep completion identities so an already-open results tab cannot re-add a reset game.
    const completedRoundIds = loadStats().completedRoundIds;
    saveStats({ ...defaultStats(), completedRoundIds });
  });
  renderStatsSummary();
  renderCategoryCounts();
});

function isRoundOver() {
  if (state.mode === "survival" && state.lives <= 0) return true;
  return state.currentIndex >= state.roundQuestions.length;
}

// `settings` is passed explicitly (rather than read from state.settings) so
// Play Again and Quick Play replay the round that was actually played, not
// whatever the picker currently says.
async function startRound(categories, settings) {
  return withStorageLock("seen", () => {
    if (!categories.length || !categories.every(cat => Array.isArray(cat.questions))) return;
    settings = StorageLogic.settings(settings);
    if (!categories.some(cat => filterByDifficulty(cat.questions, settings.difficulty).length)) return;
    state.roundId = newReportId();
    state.roundRevision = 0;
    state.roundPersisted = false;
    state.roundConflict = false;
    state.resultsRecorded = false;
    state.resultsInFlight = false;
    state.currentCategories = categories;
    state.roundSettings = { ...settings };
    state.mode = settings.mode;
    saveLastRoundConfig(categories, state.roundSettings);

    // Balanced draw across categories with per-category, per-difficulty
    // repeat avoidance — see GameLogic.buildRound. Each question keeps its own
    // real category (q.category), so a mixed round still tracks "seen" per
    // underlying category, not per round.
    const seenIn = {};
    for (const cat of categories) seenIn[cat.id] = loadSeenIds(cat.id);
    const round = buildRound(categories, state.roundSettings, seenIn);
    state.roundQuestions = round.questions;

    // Only mark a question "seen" once it's actually answered (in
    // selectAnswer) — marking the whole round up front meant quitting before
    // reaching a question still permanently burned it out of the pool. A
    // category whose pool ran dry had its history cleared, though, and that
    // needs persisting now so the next round sees the same starting point.
    state.seenByCat = round.seenByCat;
    for (const catId of round.resetCategoryIds) {
      const seen = loadSeenIds(catId);
      for (const q of filterByDifficulty(categories.find(cat => cat.id === catId).questions, settings.difficulty)) seen.delete(q.id);
      saveSeenIds(catId, seen);
    }

    state.currentIndex = 0;
    state.score = 0;
    state.streak = 0;
    state.bestStreak = 0;
    state.answers = [];
    state.lifelineUsed = false;
    state.lives = state.mode === "survival" ? SURVIVAL_LIVES : 0;
    saveActiveRound();
    showScreen("quiz");
    renderQuestion();
  });
}

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function flashMilestone() {
  if (prefersReducedMotion()) return;
  el.milestoneFlash.classList.remove("flash");
  void el.milestoneFlash.offsetWidth;
  el.milestoneFlash.classList.add("flash");
}

function updateStreakBadge(animate) {
  if (state.streak >= 2) {
    el.streakBadge.textContent = `🔥 ${state.streak}`;
    el.streakBadge.classList.remove("hidden");
    el.streakBadge.classList.toggle("tier-2", state.streak >= 5 && state.streak < 10);
    el.streakBadge.classList.toggle("tier-3", state.streak >= 10);
    if (animate) {
      el.streakBadge.style.animation = "none";
      void el.streakBadge.offsetWidth;
      el.streakBadge.style.animation = "";
      if (state.streak >= 5 && state.streak % 5 === 0) flashMilestone();
    }
  } else {
    el.streakBadge.classList.remove("tier-2", "tier-3");
    el.streakBadge.classList.add("hidden");
  }
  el.quizBody.classList.toggle("streak-glow-2", state.streak >= 5 && state.streak < 10);
  el.quizBody.classList.toggle("streak-glow-3", state.streak >= 10);
}

// Updates the bits of the quiz header that change independent of a full
// question re-render: score (every mode), plus either the progress
// bar/counter (standard) or the hearts display (survival, since there's no
// fixed round length to show a fraction of).
function renderQuizStatus() {
  el.scoreChip.textContent = `🎯 ${state.score}`;
  if (state.mode === "survival") {
    el.progressTrack.classList.add("hidden");
    el.questionCounter.classList.add("hidden");
    el.livesDisplay.classList.remove("hidden");
    el.livesDisplay.textContent = "❤️".repeat(Math.max(state.lives, 0)) + "🖤".repeat(Math.max(SURVIVAL_LIVES - state.lives, 0));
  } else {
    el.progressTrack.classList.remove("hidden");
    el.questionCounter.classList.remove("hidden");
    el.livesDisplay.classList.add("hidden");
    el.questionCounter.textContent = `${state.currentIndex + 1}/${state.roundQuestions.length}`;
    el.progressFill.style.width = `${(state.currentIndex / state.roundQuestions.length) * 100}%`;
  }
}

// Long stems and long option sets get a smaller type size so a worst-case
// question still fits a short phone screen without pushing the options
// (and Next) below the fold. Thresholds are in characters of stem text and
// of the longest option, tuned against the corpus's longest entries.
function textSizeClass(q) {
  const longestOption = Math.max(...q.options.map((o) => o.length));
  if (q.question.length > 220 || longestOption > 60) return "text-xs";
  if (q.question.length > 150 || longestOption > 40) return "text-sm";
  return "";
}

// Screen-reader announcement (visually hidden aria-live region). Cleared
// then set on a tick so identical consecutive messages still get read.
function announce(message) {
  el.answerAnnouncer.textContent = "";
  setTimeout(() => {
    el.answerAnnouncer.textContent = message;
  }, 50);
}

function renderQuestion() {
  clearAutoAdvanceTimer();
  window.scrollTo(0, 0);
  const q = state.roundQuestions[state.currentIndex];
  const cat = state.categoryById[q.category];
  el.questionCategory.textContent = `${categoryIcon(q.category)} ${cat ? cat.name : q.category}`;
  const diff = DIFFICULTY_OPTIONS.find((d) => d.id === q.difficulty && d.id !== "any");
  el.questionDifficulty.textContent = diff ? diff.label : "";
  el.questionDifficulty.className = "difficulty-pill" + (diff ? ` difficulty-${diff.id}` : " hidden");
  el.questionText.textContent = q.question;
  el.quizBody.classList.remove("text-sm", "text-xs");
  const sizeClass = textSizeClass(q);
  if (sizeClass) el.quizBody.classList.add(sizeClass);
  el.screenQuiz.style.setProperty("--current-accent", categoryAccentVar(q.category));
  // The report button is reused across questions, so reset it every time.
  setReportButtonState(el.reportBtn, loadReportedIds().has(q.id));
  renderQuizStatus();
  el.nextBtn.classList.add("layout-hidden");
  updateStreakBadge(false);
  el.lifelineBtn.classList.toggle("layout-hidden", state.lifelineUsed);

  // Re-trigger the entrance animation on a fresh question (remove/reflow/add,
  // same trick flashMilestone uses) — a plain class add wouldn't restart the
  // animation on consecutive questions since the class never actually leaves.
  for (const target of [el.questionCategory, el.questionDifficulty, el.questionText]) {
    target.classList.remove("question-enter");
    void target.offsetWidth;
    target.classList.add("question-enter");
  }

  el.optionsList.innerHTML = "";
  q.shuffledOptions.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "option-btn option-enter";
    btn.style.animationDelay = `${i * 40}ms`;
    btn.dataset.option = opt;

    const badge = document.createElement("span");
    badge.className = "option-badge";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = OPTION_LETTERS[i] || "";

    const label = document.createElement("span");
    label.className = "option-label";
    label.textContent = opt;

    btn.appendChild(badge);
    btn.appendChild(label);
    btn.addEventListener("click", () => selectAnswer(opt));
    el.optionsList.appendChild(btn);
  });
}

el.lifelineBtn.addEventListener("click", () => {
  const index = state.currentIndex, roundId = state.roundId;
  withStorageLock(`round:${roundId}`, () => {
    if (currentScreen !== "quiz" || state.currentIndex !== index || state.roundId !== roundId || state.answers.length !== index || state.lifelineUsed || !roundIsCurrent()) return;
    const q = state.roundQuestions[state.currentIndex];
    const wrongButtons = [...el.optionsList.children].filter(
      (btn) => btn.dataset.option !== q.answer
    );
    const toEliminate = shuffle(wrongButtons).slice(0, 2);
    for (const btn of toEliminate) {
      btn.disabled = true;
      btn.classList.add("eliminated");
    }
    state.lifelineUsed = true;
    el.lifelineBtn.classList.add("layout-hidden");
    saveActiveRound();
  });
});

function markOptionResult(btn, symbol) {
  // Color alone isn't enough (colorblind-friendly) — pair it with a symbol.
  const icon = document.createElement("span");
  icon.className = "option-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = symbol;
  btn.appendChild(icon);
}

async function selectAnswer(selected) {
  const index = state.currentIndex, roundId = state.roundId;
  const operation = withStorageLock(`round:${roundId}`, () => {
    if (currentScreen !== "quiz" || state.roundId !== roundId || state.currentIndex !== index || state.answers.length !== index || !roundIsCurrent()) return;
    const q = state.roundQuestions[state.currentIndex];
    if (!q || !q.options.includes(selected)) return;
    const wasCorrect = selected === q.answer;
    if (wasCorrect) {
      state.score++;
      state.streak++;
      if (state.streak > state.bestStreak) state.bestStreak = state.streak;
    } else {
      state.streak = 0;
      if (state.mode === "survival") state.lives--;
    }
    try { playAnswerSound(wasCorrect, state.streak); } catch (e) { /* Audio must never interrupt a saved answer. */ }
    vibrate(wasCorrect ? 40 : [30, 60, 30]);
    updateStreakBadge(true);
    renderQuizStatus();

    state.answers.push({
      id: q.id,
      question: q.question,
      options: q.shuffledOptions,
      correctAnswer: q.answer,
      selected,
      wasCorrect,
      category: q.category,
    });

    if (!state.seenByCat[q.category]) state.seenByCat[q.category] = new Set();
    state.seenByCat[q.category].add(q.id);
    withStorageLock("seen", () => {
      const seen = loadSeenIds(q.category);
      seen.add(q.id);
      saveSeenIds(q.category, seen);
    });
    saveActiveRound();

    el.lifelineBtn.classList.add("layout-hidden");

    for (const btn of el.optionsList.children) {
      btn.disabled = true;
      if (btn.dataset.option === q.answer) {
        btn.classList.add("correct");
        markOptionResult(btn, "✓");
      } else if (btn.dataset.option === selected) {
        btn.classList.add("incorrect");
        markOptionResult(btn, "✗");
      }
    }

    const roundWillBeOver = state.mode === "survival" && state.lives <= 0
      ? true
      : state.currentIndex + 1 >= state.roundQuestions.length;
    el.nextBtn.classList.remove("layout-hidden");
    el.nextBtn.textContent = roundWillBeOver ? "See Results" : "Next";

    announce(
      wasCorrect
        ? `Correct. Score ${state.score}.`
        : `Wrong. The answer was ${q.answer}.${state.mode === "survival" ? ` ${state.lives} ${state.lives === 1 ? "life" : "lives"} left.` : ""}`
    );

    // Auto-advance only past correct answers, so a miss still waits for a
    // manual tap — the point is to read the correct answer, not rush past it.
    if (wasCorrect && prefs.autoAdvance) {
      autoAdvanceTimer = setTimeout(advanceToNext, 1200);
    }
  });
  state.answerPending = operation;
  try { return await operation; }
  finally { if (state.answerPending === operation) state.answerPending = null; }
}

let autoAdvanceTimer = null;

function clearAutoAdvanceTimer() {
  if (autoAdvanceTimer) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
}

async function advanceToNext() {
  const index = state.currentIndex, roundId = state.roundId;
  if (state.answerPending) await state.answerPending;
  clearAutoAdvanceTimer();
  if (currentScreen !== "quiz") return;
  if (confirmSheetOpen || feedbackSheetOpen) return;
  if (state.answers.length && (state.answers.length === state.roundQuestions.length || (state.mode === "survival" && state.lives <= 0))) {
    await showResults();
    return;
  }
  const finished = await withStorageLock(`round:${roundId}`, () => {
    if (currentScreen !== "quiz" || state.roundId !== roundId || state.currentIndex !== index || state.answers.length !== index + 1 || !roundIsCurrent()) return false;
    if (state.mode === "survival" && state.lives <= 0) return true;
    state.currentIndex++;
    if (state.currentIndex < state.roundQuestions.length) {
      saveActiveRound();
      renderQuestion();
      return false;
    }
    el.progressFill.style.width = "100%";
    return true;
  });
  if (finished) await showResults();
}

el.nextBtn.addEventListener("click", advanceToNext);

// Desktop/keyboard play: 1-4 or A-D picks an option, Enter/Space advances
// once Next is showing, L uses the lifeline. Ignored while the confirm or
// feedback sheet is open or when focus is in a text field (the feedback
// sheet's comment box is one).
document.addEventListener("keydown", (e) => {
  if (currentScreen !== "quiz" || confirmSheetOpen || feedbackSheetOpen) return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;

  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  let optionIndex = -1;
  if (key >= "1" && key <= "9") optionIndex = Number(key) - 1;
  else if (OPTION_LETTERS.includes(key)) optionIndex = OPTION_LETTERS.indexOf(key);

  if (optionIndex >= 0) {
    const btn = el.optionsList.children[optionIndex];
    if (btn && !btn.disabled) {
      e.preventDefault();
      btn.click();
    }
    return;
  }
  if ((key === "Enter" || key === " ") && !el.nextBtn.classList.contains("layout-hidden")) {
    // Let a focused button handle its own Enter/Space so it isn't fired twice.
    if (tag === "BUTTON") return;
    e.preventDefault();
    advanceToNext();
    return;
  }
  if (key === "L" && !el.lifelineBtn.classList.contains("layout-hidden")) {
    e.preventDefault();
    el.lifelineBtn.click();
  }
});

// Asks whether to abandon the in-progress round. The auto-advance timer is
// cleared up front, not after the sheet resolves: a pending timer (set after
// answering correctly) could otherwise fire while the sheet is open and
// silently call showResults() underneath it.
async function confirmQuit() {
  if (state.answerPending) await state.answerPending;
  clearAutoAdvanceTimer();
  return showConfirmSheet({
    title: "Quit this round?",
    message: "Your progress will be lost.",
    confirmText: "Quit",
    cancelText: "Keep Playing",
    danger: true,
  });
}

function abandonRound() {
  clearAutoAdvanceTimer();
  const roundId = state.roundId;
  withStorageLock(`round:${roundId}`, () => clearActiveRound(roundId));
  state.roundQuestions = [];
  state.currentIndex = 0;
  state.score = 0;
  state.streak = 0;
  state.bestStreak = 0;
  state.answers = [];
  state.lifelineUsed = false;
  state.lives = 0;
}

el.quitBtn.addEventListener("click", async () => {
  if (!isRoundOver()) {
    const confirmed = await confirmQuit();
    if (!confirmed) return;
  }
  abandonRound();
  showScreen("categories");
});

function renderResultsCategoryBreakdown(answers) {
  const byCategory = new Map();
  for (const a of answers) {
    if (!byCategory.has(a.category)) byCategory.set(a.category, { total: 0, correct: 0 });
    const entry = byCategory.get(a.category);
    entry.total++;
    if (a.wasCorrect) entry.correct++;
  }

  if (byCategory.size <= 1) {
    el.resultsCategoryBreakdown.classList.add("hidden");
    el.resultsCategoryBreakdown.innerHTML = "";
    return;
  }

  el.resultsCategoryBreakdown.innerHTML = "";
  for (const [catId, e] of byCategory.entries()) {
    const name = state.categoryById[catId] ? state.categoryById[catId].name : catId;
    el.resultsCategoryBreakdown.appendChild(breakdownRow(name, `${e.correct}/${e.total}`));
  }
  el.resultsCategoryBreakdown.classList.remove("hidden");
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Animates a number counting up from 0 to `value`, calling onUpdate(current)
// every frame. Jumps straight to the final value under prefers-reduced-motion
// (same skip-entirely pattern confettiBurst/flashMilestone already use).
function animateCountUp(value, onUpdate, duration = 700) {
  if (prefersReducedMotion() || value <= 0) {
    onUpdate(value);
    return;
  }
  const start = performance.now();
  function frame(now) {
    const t = Math.min((now - start) / duration, 1);
    onUpdate(Math.round(value * easeOutCubic(t)));
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function playStarChime(index) {
  if (!prefs.sound) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  playTone(ctx, 520 + index * 140, ctx.currentTime, 0.18, 0.14);
}

// Lights up the earned stars one at a time with a rising chime, instead of
// all appearing at once. Lights them all immediately (no stagger, no sound)
// under prefers-reduced-motion.
function revealResultsStars(score, total) {
  const lit = starRating(score, total);
  el.resultsStars.innerHTML = [1, 2, 3].map(() => `<span class="star">★</span>`).join("");
  const starEls = [...el.resultsStars.children];
  if (prefersReducedMotion()) {
    starEls.forEach((s, i) => s.classList.toggle("lit", i < lit));
    return;
  }
  starEls.forEach((s, i) => {
    setTimeout(() => {
      if (i < lit) {
        s.classList.add("lit");
        playStarChime(i);
      }
    }, 260 + i * 260);
  });
}

const CONFETTI_COLORS = ["--card-1", "--card-2", "--card-3", "--card-4", "--card-5", "--card-6", "--card-7", "--card-8"]
  .map((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim());

// Lightweight particle burst for a perfect score / new best / new streak
// record. No deps, per CLAUDE.md's no-build-step rule. Skips entirely under
// prefers-reduced-motion rather than trying to offer a static substitute.
function confettiBurst() {
  if (prefersReducedMotion()) return;
  const canvas = el.confettiCanvas;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const count = 140;
  const particles = Array.from({ length: count }, () => ({
    x: Math.random() * window.innerWidth,
    y: -20 - Math.random() * window.innerHeight * 0.4,
    vx: (Math.random() - 0.5) * 3,
    vy: 2 + Math.random() * 3,
    size: 5 + Math.random() * 5,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    rotation: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.3,
  }));

  const duration = 2600;
  const start = performance.now();

  function frame(now) {
    const elapsed = now - start;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.02;
      p.rotation += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - elapsed / duration);
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (elapsed < duration) {
      requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }
  requestAnimationFrame(frame);
}

async function showResults() {
  if (state.resultsRecorded || state.resultsInFlight || !state.answers.length) return;
  if (state.mode === "survival" ? state.lives > 0 && state.answers.length < state.roundQuestions.length : state.answers.length < state.roundQuestions.length) return;
  state.resultsInFlight = true;
  const roundId = state.roundId;
  clearAutoAdvanceTimer();
  // answers.length rather than roundQuestions.length: for survival the pool
  // is a fixed cap (SURVIVAL_POOL_CAP) that's usually much larger than how
  // far the player actually got, so the pool size is never the right
  // denominator — only what was actually answered is.
  const total = state.answers.length;
  const recorded = await recordGameResult(state.score, total, state.answers, state.bestStreak, state.mode);
  if (state.roundId !== roundId) return;
  state.resultsInFlight = false;
  if (!recorded) {
    // A completed save restored on launch has no visible quiz yet. Present its
    // final answer again so the result-save retry is always reachable.
    state.currentIndex = Math.max(0, state.answers.length - 1);
    showScreen("quiz");
    renderQuestion();
    const answer = state.answers[state.currentIndex];
    for (const button of el.optionsList.children) {
      button.disabled = true;
      if (button.dataset.option === answer.correctAnswer) button.classList.add("correct");
      else if (button.dataset.option === answer.selected) button.classList.add("incorrect");
    }
    el.lifelineBtn.classList.add("layout-hidden");
    el.nextBtn.classList.remove("layout-hidden");
    el.nextBtn.textContent = "Retry saving results";
    return;
  }
  state.resultsRecorded = true;
  const { prior: priorStats, updated: updatedStats } = recorded;
  await withStorageLock(`round:${state.roundId}`, clearActiveRound);

  const isSurvival = state.mode === "survival";
  const isNewBest = isSurvival
    ? updatedStats.bestSurvivalScore > priorStats.bestSurvivalScore
    : Math.round(updatedStats.bestPct) > Math.round(priorStats.bestPct);
  const isNewStreakRecord = updatedStats.bestStreak > priorStats.bestStreak;
  const isPerfect = !isSurvival && total > 0 && state.score === total;

  el.resultsScore.textContent = isSurvival ? "0" : `0/${total}`;
  animateCountUp(state.score, (v) => {
    el.resultsScore.textContent = isSurvival ? `${v}` : `${v}/${total}`;
  });

  if (isSurvival) {
    el.resultsStars.classList.add("hidden");
    el.resultsStars.innerHTML = "";
    el.resultsSubtitle.textContent = survivalSubtitle(state.lives, isNewBest);
    renderSurvivalResultsStats(state.score, updatedStats, isNewBest, isNewStreakRecord);
  } else {
    el.resultsStars.classList.remove("hidden");
    revealResultsStars(state.score, total);
    el.resultsSubtitle.textContent = subtitleFor(state.score, total);
    renderResultsStats(state.score, total, priorStats, updatedStats, isNewBest, isNewStreakRecord);
  }
  renderResultsCategoryBreakdown(state.answers);

  if (isPerfect || isNewBest || isNewStreakRecord) confettiBurst();

  el.resultsReview.innerHTML = "";
  const reportedIds = loadReportedIds();
  for (const a of state.answers) {
    const item = document.createElement("div");
    item.className = "review-item";

    const optionsList = document.createElement("ul");
    optionsList.className = "review-options";
    for (const opt of a.options) {
      const li = document.createElement("li");
      const isCorrect = opt === a.correctAnswer;
      const isSelected = opt === a.selected;
      let cls = "review-option";
      let prefix = "";
      if (isCorrect) {
        cls += " right";
        prefix = "✓ ";
      } else if (isSelected) {
        cls += " wrong";
        prefix = "✗ ";
      }
      li.className = cls;
      li.textContent = `${prefix}${opt}`;
      optionsList.appendChild(li);
    }

    const questionEl = document.createElement("p");
    questionEl.className = "review-question";
    questionEl.tabIndex = -1; // focus target after a report, since the 👎 disables itself
    questionEl.textContent = a.question;
    const questionRow = document.createElement("div");
    questionRow.className = "review-question-row";
    questionRow.appendChild(questionEl);
    // Rounds saved before reporting existed have no id on their answers — no
    // button for those rather than guessing.
    if (a.id) {
      const reportBtn = document.createElement("button");
      reportBtn.type = "button";
      reportBtn.className = "report-btn";
      setReportButtonState(reportBtn, reportedIds.has(a.id));
      reportBtn.addEventListener("click", async () => {
        const saved = await openFeedbackSheet({
          // a.options is the shuffled display order; the canonical order isn't
          // kept on answers, and the snapshot doesn't need it.
          question: { id: a.id, category: a.category, question: a.question, options: a.options, answer: a.correctAnswer },
          selected: a.selected,
          context: "results",
        });
        if (!saved) return;
        setReportButtonState(reportBtn, true);
        questionEl.focus();
      });
      questionRow.appendChild(reportBtn);
    }
    item.appendChild(questionRow);
    item.appendChild(optionsList);
    el.resultsReview.appendChild(item);
  }

  showScreen("results");
}

function renderResultsStats(score, total, prior, updated, isNewBest, isNewStreakRecord) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const priorAvgPct = prior.gamesPlayed > 0 && prior.totalQuestions > 0
    ? Math.round((prior.totalCorrect / prior.totalQuestions) * 100)
    : null;
  const gameWord = updated.gamesPlayed === 1 ? "game" : "games";

  let deltaHtml = "";
  if (priorAvgPct === null) {
    deltaHtml = `<p class="stats-delta">This is your first recorded game.</p>`;
  } else {
    const diff = pct - priorAvgPct;
    const cls = diff > 0 ? "up" : diff < 0 ? "down" : "";
    const diffText = diff === 0
      ? "Right at your average."
      : diff > 0
        ? `${diff} pts above your average.`
        : `${Math.abs(diff)} pts below your average.`;
    deltaHtml = `<p class="stats-delta ${cls}">${diffText}</p>`;
  }
  if (isNewBest) {
    deltaHtml += `<p class="stats-delta up">New best score!</p>`;
  }
  if (isNewStreakRecord) {
    deltaHtml += `<p class="stats-delta up">New streak record!</p>`;
  }

  el.resultsStats.innerHTML = `
    <div class="stats-row"><span>This game</span><span class="stats-value">${pct}%</span></div>
    <div class="stats-row"><span>Your average</span><span class="stats-value">${priorAvgPct === null ? "—" : priorAvgPct + "%"}</span></div>
    <div class="stats-row"><span>Longest streak</span><span class="stats-value">🔥 ${state.bestStreak}</span></div>
    <div class="stats-row"><span>Games played</span><span class="stats-value">${updated.gamesPlayed} ${gameWord}</span></div>
    ${deltaHtml}
  `;
}

function subtitleFor(score, total) {
  const pct = score / total;
  if (pct === 1) return "Perfect score!";
  if (pct >= 0.8) return "Great job!";
  if (pct >= 0.5) return "Not bad!";
  return "Room to improve — play again!";
}

// Survival has no fixed total to compute a percentage against, so its
// subtitle is framed around lives/best-score instead of subtitleFor's pct
// thresholds.
function survivalSubtitle(livesLeft, isNewBest) {
  if (isNewBest) return "New personal best!";
  if (livesLeft > 0) return "You cleared the entire category!";
  return "Out of lives — play again!";
}

function renderSurvivalResultsStats(score, updated, isNewBest, isNewStreakRecord) {
  let deltaHtml = "";
  if (isNewBest) deltaHtml += `<p class="stats-delta up">New best score!</p>`;
  if (isNewStreakRecord) deltaHtml += `<p class="stats-delta up">New streak record!</p>`;

  const livesHtml = state.lives > 0
    ? "❤️".repeat(state.lives)
    : "💀";

  el.resultsStats.innerHTML = `
    <div class="stats-row"><span>This run</span><span class="stats-value">${score} correct</span></div>
    <div class="stats-row"><span>Your best (Survival)</span><span class="stats-value">${updated.bestSurvivalScore}</span></div>
    <div class="stats-row"><span>Longest streak</span><span class="stats-value">🔥 ${state.bestStreak}</span></div>
    <div class="stats-row"><span>Lives remaining</span><span class="stats-value">${livesHtml}</span></div>
    ${deltaHtml}
  `;
}

el.playAgainBtn.addEventListener("click", () => {
  const settings = state.roundSettings || state.settings;
  withLoaded(el.playAgainBtn, state.currentCategories, () => startRound(state.currentCategories, settings));
});
el.chooseCategoryBtn.addEventListener("click", () => showScreen("categories"));

async function loadVersion() {
  try {
    const res = await fetch("version.json");
    const data = await res.json();
    el.appVersion.textContent = `v${data.build}`;
    state.appBuild = Number(data.build) || 0;
  } catch (e) {
    // non-critical — just don't show a version number
  }
}

try {
  history.replaceState({ depth: 0, screen: "categories" }, "");
} catch (e) {
  // history API unavailable — Back just won't be intercepted
}

loadVersion();
async function initializeApp() {
  await restoreStorageMirrors();
  Object.assign(prefs, loadPrefs());
  applyTheme();
  renderPrefsRow();
  loadCategories();
  renderStatsSummary();
  renderFeedbackPending();
  flushFeedback();
}
initializeApp();
window.addEventListener("online", flushFeedback);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") flushFeedback();
});

// A new build installs in the background and then *waits* (sw.js no longer
// calls skipWaiting on its own), so the running session keeps a consistent
// set of files. This toast offers a reload to switch over; ignoring it is
// fine — the new version activates by itself the next time the app is
// opened fresh. Reloading mid-round is safe: the round is checkpointed to
// localStorage and offered for resume on the next launch.
function showUpdateToast(registration) {
  const waiting = registration.waiting;
  if (!waiting) return;
  el.updateToast.classList.remove("hidden");
  el.updateReloadBtn.onclick = () => {
    el.updateReloadBtn.disabled = true;
    el.updateReloadBtn.textContent = "Updating…";
    waiting.postMessage({ type: "SKIP_WAITING" });
  };
  el.updateDismissBtn.onclick = () => el.updateToast.classList.add("hidden");
}

let offlineRegistration = null;
let offlineWasReady = false;

function renderOfflineStatus(info) {
  const status = document.getElementById("offline-status");
  const retry = document.getElementById("offline-retry-btn");
  retry.disabled = false;
  retry.classList.toggle("hidden", info.status !== "failed");
  if (info.status === "ready") {
    offlineWasReady = true;
    status.textContent = "Ready to play offline";
  } else if (info.status === "downloading") {
    status.textContent = `${offlineWasReady ? "Updating offline copy" : "Downloading for offline play"}${info.total ? `: ${info.completed} of ${info.total} files` : "…"}`;
  } else if (info.status === "failed") {
    if (!info.updateFailed) offlineWasReady = false;
    status.textContent = offlineWasReady && info.updateFailed
      ? "Your offline copy is ready. The latest download failed; retry when connected."
      : "Offline download isn't complete. Connect to the internet and retry before travelling.";
  } else status.textContent = "Checking offline availability…";
}

function queryOfflineStatus(worker) {
  if (!worker) { renderOfflineStatus({ status: "failed" }); return; }
  const channel = new MessageChannel();
  const timer = setTimeout(() => {
    channel.port1.close();
    renderOfflineStatus({ status: "failed" });
  }, 5000);
  channel.port1.onmessage = event => {
    clearTimeout(timer);
    channel.port1.close();
    renderOfflineStatus(event.data);
  };
  worker.postMessage({ type: "GET_OFFLINE_STATUS" }, [channel.port2]);
}

function watchOfflineWorker(worker, registration) {
  if (!worker || worker.offlineWatched) return;
  worker.offlineWatched = true;
  renderOfflineStatus({ status: "downloading" });
  worker.addEventListener("statechange", () => {
    if (worker.state === "installed") {
      queryOfflineStatus(worker);
      if (navigator.serviceWorker.controller) showUpdateToast(registration);
    } else if (worker.state === "redundant") renderOfflineStatus({ status: "failed", updateFailed: !!registration.active });
    else if (worker.state === "activated") queryOfflineStatus(worker);
  });
}

async function setupOffline(retry = false) {
  if (!("serviceWorker" in navigator)) {
    document.getElementById("offline-status").textContent = "Offline installation isn't supported in this browser. You can play while connected.";
    return;
  }
  renderOfflineStatus({ status: "checking" });
  try {
    const registration = await navigator.serviceWorker.register("sw.js", { updateViaCache: "none" });
    offlineRegistration = registration;
    registration.addEventListener("updatefound", () => watchOfflineWorker(registration.installing, registration));
    if (retry) await registration.update();
    if (registration.installing) watchOfflineWorker(registration.installing, registration);
    else if (registration.waiting) {
      queryOfflineStatus(registration.waiting);
      showUpdateToast(registration);
    } else if (registration.active) {
      if (retry) {
        renderOfflineStatus({ status: "downloading" });
        registration.active.postMessage({ type: "REPAIR_OFFLINE_CACHE" });
      } else queryOfflineStatus(registration.active);
    } else renderOfflineStatus({ status: "failed" });
  } catch (e) { renderOfflineStatus({ status: "failed" }); }
}

document.getElementById("offline-retry-btn").onclick = () => setupOffline(true);
if ("serviceWorker" in navigator) {
  let reloading = false;
  navigator.serviceWorker.addEventListener("message", event => {
    if (event.data && event.data.type === "OFFLINE_STATUS") renderOfflineStatus({
      ...event.data,
      updateFailed: event.data.status === "failed" && !!(offlineRegistration && offlineRegistration.active && event.source !== offlineRegistration.active),
    });
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    if (el.updateReloadBtn.disabled) {
      reloading = true;
      window.location.reload();
    } else queryOfflineStatus(navigator.serviceWorker.controller);
  });
}
if (document.readyState === "complete") setupOffline();
else window.addEventListener("load", () => setupOffline());

window.addEventListener("storage", event => {
  if (event.key === STATS_KEY && currentScreen === "categories") {
    renderStatsSummary();
    renderCategoryCounts();
  }
  if (event.key === FEEDBACK_QUEUE_KEY || event.key === FEEDBACK_FAILED_KEY || event.key === FEEDBACK_REPORTED_KEY) {
    renderFeedbackPending();
    if (currentScreen === "quiz") {
      const q = state.roundQuestions[state.currentIndex];
      if (q) setReportButtonState(el.reportBtn, loadReportedIds().has(q.id));
    }
  }
  if (event.key === PREFS_KEY) { Object.assign(prefs, loadPrefs()); applyTheme(); renderPrefsRow(); }
});
