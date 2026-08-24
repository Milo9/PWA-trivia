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
const SURVIVAL_LIVES = 3;
// Capped well below "the whole selected pool" — saveActiveRound serializes
// roundQuestions on every answer, and an uncapped select-all survival round
// (thousands of questions) would blow past localStorage's ~5MB quota on iOS
// Safari and silently break resume. Nobody survives this many anyway; if
// someone does, isRoundOver() treats pool exhaustion as a clean finish.
const SURVIVAL_POOL_CAP = 150;
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
  roundQuestions: [],
  currentIndex: 0,
  score: 0,
  streak: 0,
  bestStreak: 0,
  answers: [], // { question, options, correctAnswer, selected, wasCorrect, category }
  seenByCat: {}, // { [categoryId]: Set<questionId> } — this round's in-progress seen tracking
  lifelineUsed: false, // 50/50 lifeline, one per round
  mode: "standard", // "standard" | "survival" — mirrors settings.mode for the active round
  lives: 0, // survival mode only
};

const el = {
  categoryList: document.getElementById("category-list"),
  categoriesStatus: document.getElementById("categories-status"),
  appVersion: document.getElementById("app-version"),

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

  confirmSheetOverlay: document.getElementById("confirm-sheet-overlay"),
  confirmSheet: document.getElementById("confirm-sheet"),
  confirmSheetTitle: document.getElementById("confirm-sheet-title"),
  confirmSheetMessage: document.getElementById("confirm-sheet-message"),
  confirmSheetCancel: document.getElementById("confirm-sheet-cancel"),
  confirmSheetConfirm: document.getElementById("confirm-sheet-confirm"),
};

function showScreen(name) {
  for (const s of [el.screenCategories, el.screenSettings, el.screenQuiz, el.screenResults]) {
    s.classList.add("hidden");
  }
  if (name === "categories") {
    el.screenCategories.classList.remove("hidden");
    if (state.categories.length) renderCategoryList();
    renderStatsSummary();
    renderCategoryCounts();
    renderQuickPlay();
  }
  if (name === "settings") el.screenSettings.classList.remove("hidden");
  if (name === "quiz") el.screenQuiz.classList.remove("hidden");
  if (name === "results") el.screenResults.classList.remove("hidden");
}

function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const PREFS_KEY = "offline-trivia:prefs";

function defaultPrefs() {
  return { sound: true, autoAdvance: true };
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...defaultPrefs(), ...JSON.parse(raw) } : defaultPrefs();
  } catch (e) {
    return defaultPrefs();
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (e) {
    // localStorage unavailable — prefs just won't persist
  }
}

const prefs = loadPrefs();

function renderPrefsRow() {
  el.soundToggleBtn.textContent = prefs.sound ? "🔊 Sound On" : "🔇 Sound Off";
  el.soundToggleBtn.classList.toggle("active", prefs.sound);
  el.autoAdvanceToggleBtn.textContent = prefs.autoAdvance ? "⏭ Auto-Advance On" : "⏭ Auto-Advance Off";
  el.autoAdvanceToggleBtn.classList.toggle("active", prefs.autoAdvance);
}

el.soundToggleBtn.addEventListener("click", () => {
  prefs.sound = !prefs.sound;
  savePrefs(prefs);
  renderPrefsRow();
});

el.autoAdvanceToggleBtn.addEventListener("click", () => {
  prefs.autoAdvance = !prefs.autoAdvance;
  savePrefs(prefs);
  renderPrefsRow();
});

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
        selectedCategoryIds: Array.from(state.selectedCategoryIds),
        settings: state.settings,
      })
    );
  } catch (e) {
    // localStorage unavailable — picker state just won't persist
  }
}

function loadPickerState() {
  try {
    const raw = localStorage.getItem(PICKER_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const settings = parsed.settings || {};
    const sanitized = {
      count: COUNT_OPTIONS.includes(settings.count) ? settings.count : state.settings.count,
      difficulty: DIFFICULTY_OPTIONS.some((d) => d.id === settings.difficulty)
        ? settings.difficulty
        : state.settings.difficulty,
      mode: MODE_OPTIONS.some((m) => m.id === settings.mode) ? settings.mode : state.settings.mode,
    };
    return {
      selectedCategoryIds: Array.isArray(parsed.selectedCategoryIds) ? parsed.selectedCategoryIds : [],
      settings: sanitized,
    };
  } catch (e) {
    return null;
  }
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
        categoryIds: categories.map((c) => c.id),
        settings,
      })
    );
  } catch (e) {
    // localStorage unavailable — Quick Play just won't be offered
  }
}

function loadLastRoundConfig() {
  try {
    const raw = localStorage.getItem(LAST_ROUND_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function quickPlayLabel(categories, settings) {
  const names = categories.length <= 2 ? categories.map((c) => c.name).join(" + ") : `${categories.length} Categories`;
  const modeLabel = settings.mode === "survival" ? "Survival" : `${settings.count}Q`;
  const diffOpt = DIFFICULTY_OPTIONS.find((d) => d.id === settings.difficulty);
  return `▶ Quick Play: ${names} (${modeLabel} · ${diffOpt ? diffOpt.label : "Any"})`;
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
  const pool = filterByDifficulty(categories.flatMap((c) => c.questions), cfg.settings.difficulty);
  if (pool.length === 0) {
    el.quickPlayBtn.classList.add("hidden");
    return;
  }
  el.quickPlayBtn.textContent = quickPlayLabel(categories, cfg.settings);
  el.quickPlayBtn.classList.remove("hidden");
  el.quickPlayBtn.onclick = () => {
    state.settings = { ...state.settings, ...cfg.settings };
    startRound(categories);
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
// would need it.
function showConfirmSheet({ title, message, confirmText = "Confirm", cancelText = "Cancel", danger = false }) {
  return new Promise((resolve) => {
    el.confirmSheetTitle.textContent = title;
    el.confirmSheetMessage.textContent = message;
    el.confirmSheetConfirm.textContent = confirmText;
    el.confirmSheetCancel.textContent = cancelText;
    el.confirmSheetConfirm.classList.toggle("primary-btn", !danger);
    el.confirmSheetConfirm.classList.toggle("danger-btn", danger);
    el.confirmSheetOverlay.classList.remove("hidden");

    function cleanup(result) {
      el.confirmSheetOverlay.classList.add("hidden");
      el.confirmSheetConfirm.removeEventListener("click", onConfirm);
      el.confirmSheetCancel.removeEventListener("click", onCancel);
      el.confirmSheetOverlay.removeEventListener("click", onOverlayClick);
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

    el.confirmSheetConfirm.addEventListener("click", onConfirm);
    el.confirmSheetCancel.addEventListener("click", onCancel);
    el.confirmSheetOverlay.addEventListener("click", onOverlayClick);
  });
}

async function loadCategories() {
  try {
    const res = await fetch("data/categories.json");
    const categories = await res.json();

    const withCounts = await Promise.all(
      categories.map(async (cat) => {
        try {
          const qRes = await fetch(`data/${cat.file}`);
          const questions = await qRes.json();
          return { ...cat, questions };
        } catch (e) {
          return { ...cat, questions: [] };
        }
      })
    );

    state.categories = withCounts;
    state.categoryById = {};
    for (const cat of withCounts) state.categoryById[cat.id] = cat;

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
    tryResumeActiveRound();
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
    btn.disabled = cat.questions.length === 0;
    btn.innerHTML = `
      <span class="category-check" aria-hidden="true"></span>
      <span class="category-icon" aria-hidden="true">${categoryIcon(cat.id)}</span>
      <span class="category-info">
        <span class="category-name">${cat.name}</span>
      </span>
    `;
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
  const rows = state.categories
    .map((cat) => {
      const statLine = categoryStatsLine(cat.id);
      const value = `${cat.questions.length} questions${statLine ? " · " + statLine : ""}`;
      return `<div class="category-breakdown-row"><span>${cat.name}</span><span class="stats-value">${value}</span></div>`;
    })
    .join("");
  el.categoryCounts.innerHTML = `<p class="settings-label">Question Bank</p>${rows}`;
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
  return state.categories.filter((c) => c.questions.length > 0);
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
  openSettings(categories);
});

function filterByDifficulty(questions, difficulty) {
  return difficulty === "any" ? questions : questions.filter((q) => q.difficulty === difficulty);
}

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
    btn.textContent = diff.label;
    btn.addEventListener("click", () => {
      state.settings.difficulty = diff.id;
      savePickerState();
      renderSettingsScreen();
    });
    el.difficultyOptions.appendChild(btn);
  }

  const combinedQuestions = state.pendingCategories.flatMap((c) => c.questions);
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
el.startRoundBtn.addEventListener("click", () => startRound(state.pendingCategories));

function seenStorageKey(categoryId) {
  return `offline-trivia:seen:${categoryId}`;
}

function loadSeenIds(categoryId) {
  try {
    const raw = localStorage.getItem(seenStorageKey(categoryId));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) {
    return new Set();
  }
}

function saveSeenIds(categoryId, seenSet) {
  try {
    localStorage.setItem(seenStorageKey(categoryId), JSON.stringify(Array.from(seenSet)));
  } catch (e) {
    // localStorage unavailable — repeat-avoidance just won't persist
  }
}

const ACTIVE_ROUND_KEY = "offline-trivia:active-round";

// Checkpointed after every answer and every "Next" tap, so an iOS PWA that
// gets backgrounded/reloaded mid-round (or mid-flight) can pick back up
// instead of losing all progress. Only ever saved at a question boundary
// (not mid-reveal), so resuming always lands on a fresh, unanswered
// question — see the currentIndex/answers.length reconciliation in
// tryResumeActiveRound.
function saveActiveRound() {
  try {
    const seenByCat = {};
    for (const catId of Object.keys(state.seenByCat)) {
      seenByCat[catId] = Array.from(state.seenByCat[catId]);
    }
    localStorage.setItem(
      ACTIVE_ROUND_KEY,
      JSON.stringify({
        currentCategoryIds: state.currentCategories.map((c) => c.id),
        roundQuestions: state.roundQuestions,
        currentIndex: state.currentIndex,
        score: state.score,
        streak: state.streak,
        bestStreak: state.bestStreak,
        answers: state.answers,
        seenByCat,
        lifelineUsed: state.lifelineUsed,
        mode: state.mode,
        lives: state.lives,
      })
    );
  } catch (e) {
    // localStorage unavailable — resume just won't work
  }
}

function clearActiveRound() {
  try {
    localStorage.removeItem(ACTIVE_ROUND_KEY);
  } catch (e) {
    // ignore
  }
}

function loadActiveRound() {
  try {
    const raw = localStorage.getItem(ACTIVE_ROUND_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// Offers to resume a round saved by saveActiveRound(). Requires
// state.categoryById to already be populated, so this must run after
// loadCategories() resolves.
async function tryResumeActiveRound() {
  const saved = loadActiveRound();
  if (!saved || !saved.roundQuestions || !saved.roundQuestions.length) return;

  const categories = saved.currentCategoryIds.map((id) => state.categoryById[id]);
  if (categories.some((c) => !c)) return; // categories didn't load — try again next launch

  const answeredCount = Math.min(saved.answers.length, saved.roundQuestions.length);
  const savedMode = saved.mode || "standard";
  const savedLives = typeof saved.lives === "number" ? saved.lives : 0;
  const finished = savedMode === "survival"
    ? savedLives <= 0 || answeredCount >= saved.roundQuestions.length
    : answeredCount >= saved.roundQuestions.length;
  const confirmed = await showConfirmSheet({
    title: finished ? "See your last round?" : "Resume your round?",
    message: finished
      ? "Your last round's results are ready."
      : `Question ${answeredCount + 1} of ${saved.roundQuestions.length}.`,
    confirmText: finished ? "See Results" : "Resume",
    cancelText: "Discard",
  });
  if (!confirmed) {
    clearActiveRound();
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
  state.seenByCat = {};
  for (const catId of Object.keys(saved.seenByCat || {})) {
    state.seenByCat[catId] = new Set(saved.seenByCat[catId]);
  }
  // Reconcile rather than trust saved.currentIndex directly: it's only
  // checkpointed after "Next," so a save that landed right after an answer
  // (before "Next" was tapped) would otherwise re-render an already-answered
  // question and double-count it once the user answers again.
  state.currentIndex = Math.max(saved.currentIndex, answeredCount);

  if (finished) {
    el.progressFill.style.width = "100%";
    showResults();
  } else {
    showScreen("quiz");
    renderQuestion();
  }
}

const STATS_KEY = "offline-trivia:stats";

function currentDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function defaultStats() {
  return {
    gamesPlayed: 0,
    totalQuestions: 0,
    totalCorrect: 0,
    bestPct: 0,
    bestStreak: 0,
    bestSurvivalScore: 0,
    lastGame: null, // { score, total, pct, mode }
    today: { date: currentDateKey(), gamesPlayed: 0, totalQuestions: 0, totalCorrect: 0 },
    byCategory: {}, // { [categoryId]: { totalQuestions, totalCorrect } }
  };
}

function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? { ...defaultStats(), ...JSON.parse(raw) } : defaultStats();
  } catch (e) {
    return defaultStats();
  }
}

function saveStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (e) {
    // localStorage unavailable — stats just won't persist
  }
}

// Returns stats.today if it's still today's bucket, otherwise a fresh
// zeroed-out bucket for the current date (doesn't mutate/save).
function todayBucket(stats) {
  if (stats.today && stats.today.date === currentDateKey()) return stats.today;
  return { date: currentDateKey(), gamesPlayed: 0, totalQuestions: 0, totalCorrect: 0 };
}

// Records this game's result and returns the updated overall stats. `answers`
// (state.answers) carries the category each question actually belonged to,
// so a mixed round attributes each question to its own category rather than
// the round as a whole. `bestPct` (and the star rating/confetti it drives)
// only makes sense for a fixed-length standard round — a survival run is
// structurally almost-all-correct (at most a few misses before lives run
// out), so it gets its own bestSurvivalScore instead of skewing bestPct.
function recordGameResult(score, total, answers, bestStreak, mode) {
  const stats = loadStats();
  stats.gamesPlayed += 1;
  stats.totalQuestions += total;
  stats.totalCorrect += score;
  const pct = total > 0 ? (score / total) * 100 : 0;
  if (mode === "survival") {
    if (score > stats.bestSurvivalScore) stats.bestSurvivalScore = score;
  } else if (pct > stats.bestPct) {
    stats.bestPct = pct;
  }
  if (bestStreak > stats.bestStreak) stats.bestStreak = bestStreak;

  const today = todayBucket(stats);
  today.gamesPlayed += 1;
  today.totalQuestions += total;
  today.totalCorrect += score;
  stats.today = today;

  stats.lastGame = { score, total, pct, mode };

  for (const a of answers || []) {
    if (!a.category) continue;
    if (!stats.byCategory[a.category]) {
      stats.byCategory[a.category] = { totalQuestions: 0, totalCorrect: 0 };
    }
    stats.byCategory[a.category].totalQuestions += 1;
    if (a.wasCorrect) stats.byCategory[a.category].totalCorrect += 1;
  }

  saveStats(stats);
  return stats;
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
  saveStats(defaultStats());
  renderStatsSummary();
  renderCategoryCounts();
});

function isRoundOver() {
  if (state.mode === "survival" && state.lives <= 0) return true;
  return state.currentIndex >= state.roundQuestions.length;
}

function startRound(categories) {
  state.currentCategories = categories;
  state.mode = state.settings.mode;
  saveLastRoundConfig(categories, state.settings);

  const filtered = filterByDifficulty(categories.flatMap((c) => c.questions), state.settings.difficulty);
  const requestedCount = state.mode === "survival"
    ? Math.min(SURVIVAL_POOL_CAP, filtered.length)
    : Math.min(state.settings.count, filtered.length);

  // Avoid repeating questions already asked for a category until its whole
  // pool (at the current difficulty) has been cycled through once. Each
  // question keeps its own real category (q.category), so a mixed round
  // still tracks "seen" per underlying category, not per round.
  const seenByCat = {};
  for (const cat of categories) seenByCat[cat.id] = loadSeenIds(cat.id);

  let unseen = filtered.filter((q) => !seenByCat[q.category].has(q.id));
  if (unseen.length < requestedCount) {
    for (const cat of categories) seenByCat[cat.id] = new Set();
    unseen = filtered;
  }

  const pool = shuffle(unseen);
  state.roundQuestions = pool.slice(0, requestedCount).map((q) => ({
    ...q,
    shuffledOptions: shuffle(q.options),
  }));

  // Only mark a question "seen" once it's actually answered (in
  // selectAnswer) — marking the whole round up front meant quitting before
  // reaching a question still permanently burned it out of the pool.
  state.seenByCat = seenByCat;

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

function renderQuestion() {
  clearAutoAdvanceTimer();
  const q = state.roundQuestions[state.currentIndex];
  const cat = state.categoryById[q.category];
  el.questionCategory.textContent = `${categoryIcon(q.category)} ${cat ? cat.name : q.category}`;
  el.questionText.textContent = q.question;
  el.screenQuiz.style.setProperty("--current-accent", categoryAccentVar(q.category));
  renderQuizStatus();
  el.nextBtn.classList.add("hidden");
  updateStreakBadge(false);
  el.lifelineBtn.classList.toggle("hidden", state.lifelineUsed);

  // Re-trigger the entrance animation on a fresh question (remove/reflow/add,
  // same trick flashMilestone uses) — a plain class add wouldn't restart the
  // animation on consecutive questions since the class never actually leaves.
  for (const target of [el.questionCategory, el.questionText]) {
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
  if (state.lifelineUsed) return;
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
  el.lifelineBtn.classList.add("hidden");
  // Not checkpointed here deliberately — saves only happen at question
  // boundaries (see saveActiveRound's comment). Worst case on an interrupted
  // reload: the player gets their lifeline back on the same fresh question.
});

function markOptionResult(btn, symbol) {
  // Color alone isn't enough (colorblind-friendly) — pair it with a symbol.
  const icon = document.createElement("span");
  icon.className = "option-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = symbol;
  btn.appendChild(icon);
}

function selectAnswer(selected) {
  const q = state.roundQuestions[state.currentIndex];
  const wasCorrect = selected === q.answer;
  if (wasCorrect) {
    state.score++;
    state.streak++;
    if (state.streak > state.bestStreak) state.bestStreak = state.streak;
  } else {
    state.streak = 0;
    if (state.mode === "survival") state.lives--;
  }
  playAnswerSound(wasCorrect, state.streak);
  vibrate(wasCorrect ? 40 : [30, 60, 30]);
  updateStreakBadge(true);
  renderQuizStatus();

  state.answers.push({
    question: q.question,
    options: q.shuffledOptions,
    correctAnswer: q.answer,
    selected,
    wasCorrect,
    category: q.category,
  });

  if (!state.seenByCat[q.category]) state.seenByCat[q.category] = new Set();
  state.seenByCat[q.category].add(q.id);
  saveSeenIds(q.category, state.seenByCat[q.category]);
  saveActiveRound();

  el.lifelineBtn.classList.add("hidden");

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
  el.nextBtn.classList.remove("hidden");
  el.nextBtn.textContent = roundWillBeOver ? "See Results" : "Next";

  // Auto-advance only past correct answers, so a miss still waits for a
  // manual tap — the point is to read the correct answer, not rush past it.
  if (wasCorrect && prefs.autoAdvance) {
    autoAdvanceTimer = setTimeout(advanceToNext, 1200);
  }
}

let autoAdvanceTimer = null;

function clearAutoAdvanceTimer() {
  if (autoAdvanceTimer) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
}

function advanceToNext() {
  clearAutoAdvanceTimer();
  if (state.mode === "survival" && state.lives <= 0) {
    showResults();
    return;
  }
  state.currentIndex++;
  if (state.currentIndex < state.roundQuestions.length) {
    saveActiveRound();
    renderQuestion();
  } else {
    el.progressFill.style.width = "100%";
    showResults();
  }
}

el.nextBtn.addEventListener("click", advanceToNext);

el.quitBtn.addEventListener("click", async () => {
  // Cleared up front, not after the confirm sheet resolves: a pending
  // auto-advance timer (set after answering correctly) can otherwise fire
  // while the sheet is open and silently call showResults() underneath it.
  clearAutoAdvanceTimer();
  const inProgress = !isRoundOver();
  if (inProgress) {
    const confirmed = await showConfirmSheet({
      title: "Quit this round?",
      message: "Your progress will be lost.",
      confirmText: "Quit",
      cancelText: "Keep Playing",
      danger: true,
    });
    if (!confirmed) return;
  }
  clearActiveRound();
  state.roundQuestions = [];
  state.currentIndex = 0;
  state.score = 0;
  state.streak = 0;
  state.bestStreak = 0;
  state.answers = [];
  state.lifelineUsed = false;
  state.lives = 0;
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

  const rows = [...byCategory.entries()]
    .map(([catId, e]) => {
      const name = state.categoryById[catId] ? state.categoryById[catId].name : catId;
      return `<div class="category-breakdown-row"><span>${name}</span><span class="stats-value">${e.correct}/${e.total}</span></div>`;
    })
    .join("");
  el.resultsCategoryBreakdown.innerHTML = rows;
  el.resultsCategoryBreakdown.classList.remove("hidden");
}

function starRating(score, total) {
  const pct = total > 0 ? (score / total) * 100 : 0;
  if (pct >= 90) return 3;
  if (pct >= 70) return 2;
  if (pct >= 50) return 1;
  return 0;
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

function showResults() {
  clearActiveRound();
  // answers.length rather than roundQuestions.length: for survival the pool
  // is a fixed cap (SURVIVAL_POOL_CAP) that's usually much larger than how
  // far the player actually got, so the pool size is never the right
  // denominator — only what was actually answered is.
  const total = state.answers.length;
  const priorStats = loadStats();
  const updatedStats = recordGameResult(state.score, total, state.answers, state.bestStreak, state.mode);

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

    item.innerHTML = `<p class="review-question">${a.question}</p>`;
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

el.playAgainBtn.addEventListener("click", () => startRound(state.currentCategories));
el.chooseCategoryBtn.addEventListener("click", () => showScreen("categories"));

async function loadVersion() {
  try {
    const res = await fetch("version.json");
    const data = await res.json();
    el.appVersion.textContent = `v${data.build}`;
  } catch (e) {
    // non-critical — just don't show a version number
  }
}

loadCategories();
loadVersion();
renderStatsSummary();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // offline-first app still works without SW registration succeeding on first load
    });
  });
}
