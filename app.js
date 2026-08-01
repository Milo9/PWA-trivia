const COUNT_OPTIONS = [10, 20, 30, 40];
const DIFFICULTY_OPTIONS = [
  { id: "any", label: "Any" },
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
];

const state = {
  categories: [],
  currentCategory: null,
  pendingCategory: null,
  settings: { count: 10, difficulty: "any" },
  roundQuestions: [],
  currentIndex: 0,
  score: 0,
  answers: [], // { question, options, correctAnswer, selected, wasCorrect }
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
  resetStatsBtn: document.getElementById("reset-stats-btn"),

  settingsCategoryName: document.getElementById("settings-category-name"),
  countOptions: document.getElementById("count-options"),
  difficultyOptions: document.getElementById("difficulty-options"),
  settingsAvailability: document.getElementById("settings-availability"),
  startRoundBtn: document.getElementById("start-round-btn"),
  settingsBackBtn: document.getElementById("settings-back-btn"),

  quitBtn: document.getElementById("quit-btn"),
  progressFill: document.getElementById("progress-fill"),
  questionCounter: document.getElementById("question-counter"),
  questionCategory: document.getElementById("question-category"),
  questionText: document.getElementById("question-text"),
  optionsList: document.getElementById("options-list"),
  nextBtn: document.getElementById("next-btn"),

  resultsScore: document.getElementById("results-score"),
  resultsSubtitle: document.getElementById("results-subtitle"),
  resultsStats: document.getElementById("results-stats"),
  resultsReview: document.getElementById("results-review"),
  playAgainBtn: document.getElementById("play-again-btn"),
  chooseCategoryBtn: document.getElementById("choose-category-btn"),
};

function showScreen(name) {
  for (const s of [el.screenCategories, el.screenSettings, el.screenQuiz, el.screenResults]) {
    s.classList.add("hidden");
  }
  if (name === "categories") {
    el.screenCategories.classList.remove("hidden");
    renderStatsSummary();
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
    renderCategoryList();
  } catch (e) {
    el.categoriesStatus.textContent = "Couldn't load categories. Try reopening the app.";
  }
}

function renderCategoryList() {
  el.categoryList.innerHTML = "";
  for (const cat of state.categories) {
    const btn = document.createElement("button");
    btn.className = "category-card";
    btn.innerHTML = `<span>${cat.name}</span><span class="count">${cat.questions.length} questions</span>`;
    btn.disabled = cat.questions.length === 0;
    btn.addEventListener("click", () => openSettings(cat));
    el.categoryList.appendChild(btn);
  }
  el.categoriesStatus.textContent = "";
}

function filterByDifficulty(questions, difficulty) {
  return difficulty === "any" ? questions : questions.filter((q) => q.difficulty === difficulty);
}

function openSettings(category) {
  state.pendingCategory = category;
  renderSettingsScreen();
  showScreen("settings");
}

function renderSettingsScreen() {
  el.settingsCategoryName.textContent = state.pendingCategory.name;

  el.countOptions.innerHTML = "";
  for (const count of COUNT_OPTIONS) {
    const btn = document.createElement("button");
    btn.className = "toggle-btn" + (state.settings.count === count ? " active" : "");
    btn.textContent = count;
    btn.addEventListener("click", () => {
      state.settings.count = count;
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
      renderSettingsScreen();
    });
    el.difficultyOptions.appendChild(btn);
  }

  const pool = filterByDifficulty(state.pendingCategory.questions, state.settings.difficulty);
  const actualCount = Math.min(state.settings.count, pool.length);
  if (pool.length === 0) {
    el.settingsAvailability.textContent = "No questions available at this difficulty — pick another.";
  } else if (actualCount < state.settings.count) {
    el.settingsAvailability.textContent = `Only ${pool.length} questions available at this difficulty — round will use all ${pool.length}.`;
  } else {
    el.settingsAvailability.textContent = `${pool.length} questions available at this difficulty.`;
  }
  el.startRoundBtn.disabled = pool.length === 0;
}

el.settingsBackBtn.addEventListener("click", () => showScreen("categories"));
el.startRoundBtn.addEventListener("click", () => startRound(state.pendingCategory));

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
    lastGame: null, // { score, total, pct }
    today: { date: currentDateKey(), gamesPlayed: 0, totalQuestions: 0, totalCorrect: 0 },
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

// Records this game's result and returns the updated overall stats.
function recordGameResult(score, total) {
  const stats = loadStats();
  stats.gamesPlayed += 1;
  stats.totalQuestions += total;
  stats.totalCorrect += score;
  const pct = total > 0 ? (score / total) * 100 : 0;
  if (pct > stats.bestPct) stats.bestPct = pct;

  const today = todayBucket(stats);
  today.gamesPlayed += 1;
  today.totalQuestions += total;
  today.totalCorrect += score;
  stats.today = today;

  stats.lastGame = { score, total, pct };

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

  const lastLine = stats.lastGame
    ? `${Math.round(stats.lastGame.pct)}% (${stats.lastGame.score}/${stats.lastGame.total})`
    : "—";

  el.statsSummary.innerHTML = `
    <div class="stats-row"><span>Overall</span><span class="stats-value">${overallLine}</span></div>
    <div class="stats-row"><span>Today</span><span class="stats-value">${todayLine}</span></div>
    <div class="stats-row"><span>Last Game</span><span class="stats-value">${lastLine}</span></div>
  `;
}

el.resetStatsBtn.addEventListener("click", () => {
  if (!confirm("Reset all game stats? This can't be undone.")) return;
  saveStats(defaultStats());
  renderStatsSummary();
});

function startRound(category) {
  state.currentCategory = category;
  const filtered = filterByDifficulty(category.questions, state.settings.difficulty);
  const requestedCount = Math.min(state.settings.count, filtered.length);

  // Avoid repeating questions already asked for this category until the
  // whole pool (at the current difficulty) has been cycled through once.
  let seen = loadSeenIds(category.id);
  let unseen = filtered.filter((q) => !seen.has(q.id));
  if (unseen.length < requestedCount) {
    seen = new Set();
    unseen = filtered;
  }

  const pool = shuffle(unseen);
  state.roundQuestions = pool.slice(0, requestedCount).map((q) => ({
    ...q,
    shuffledOptions: shuffle(q.options),
  }));

  for (const q of state.roundQuestions) seen.add(q.id);
  saveSeenIds(category.id, seen);

  state.currentIndex = 0;
  state.score = 0;
  state.answers = [];
  showScreen("quiz");
  renderQuestion();
}

function renderQuestion() {
  const q = state.roundQuestions[state.currentIndex];
  el.questionCategory.textContent = state.currentCategory.name;
  el.questionText.textContent = q.question;
  el.questionCounter.textContent = `${state.currentIndex + 1}/${state.roundQuestions.length}`;
  el.progressFill.style.width = `${(state.currentIndex / state.roundQuestions.length) * 100}%`;
  el.nextBtn.classList.add("hidden");

  el.optionsList.innerHTML = "";
  for (const opt of q.shuffledOptions) {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.textContent = opt;
    btn.addEventListener("click", () => selectAnswer(opt));
    el.optionsList.appendChild(btn);
  }
}

function addAnswerIcon(btn, symbol) {
  // Color alone isn't enough (colorblind-friendly) — pair it with a symbol.
  const label = document.createElement("span");
  label.className = "option-label";
  label.textContent = btn.textContent;

  const icon = document.createElement("span");
  icon.className = "option-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = symbol;

  btn.textContent = "";
  btn.appendChild(label);
  btn.appendChild(icon);
}

function selectAnswer(selected) {
  const q = state.roundQuestions[state.currentIndex];
  const wasCorrect = selected === q.answer;
  if (wasCorrect) state.score++;

  state.answers.push({
    question: q.question,
    options: q.shuffledOptions,
    correctAnswer: q.answer,
    selected,
    wasCorrect,
  });

  for (const btn of el.optionsList.children) {
    btn.disabled = true;
    if (btn.textContent === q.answer) {
      btn.classList.add("correct");
      addAnswerIcon(btn, "✓");
    } else if (btn.textContent === selected) {
      btn.classList.add("incorrect");
      addAnswerIcon(btn, "✗");
    }
  }

  el.nextBtn.classList.remove("hidden");
  el.nextBtn.textContent =
    state.currentIndex + 1 < state.roundQuestions.length ? "Next" : "See Results";
}

el.nextBtn.addEventListener("click", () => {
  state.currentIndex++;
  if (state.currentIndex < state.roundQuestions.length) {
    renderQuestion();
  } else {
    el.progressFill.style.width = "100%";
    showResults();
  }
});

el.quitBtn.addEventListener("click", () => {
  const inProgress = state.currentIndex < state.roundQuestions.length;
  if (inProgress && !confirm("Quit this round? Your progress will be lost.")) {
    return;
  }
  state.roundQuestions = [];
  state.currentIndex = 0;
  state.score = 0;
  state.answers = [];
  showScreen("categories");
});

function showResults() {
  const total = state.roundQuestions.length;
  const priorStats = loadStats();
  const updatedStats = recordGameResult(state.score, total);

  el.resultsScore.textContent = `${state.score}/${total}`;
  el.resultsSubtitle.textContent = subtitleFor(state.score, total);
  renderResultsStats(state.score, total, priorStats, updatedStats);

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

function renderResultsStats(score, total, prior, updated) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const priorAvgPct = prior.gamesPlayed > 0 && prior.totalQuestions > 0
    ? Math.round((prior.totalCorrect / prior.totalQuestions) * 100)
    : null;
  const isNewBest = Math.round(updated.bestPct) > Math.round(prior.bestPct);
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

  el.resultsStats.innerHTML = `
    <div class="stats-row"><span>This game</span><span class="stats-value">${pct}%</span></div>
    <div class="stats-row"><span>Your average</span><span class="stats-value">${priorAvgPct === null ? "—" : priorAvgPct + "%"}</span></div>
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

el.playAgainBtn.addEventListener("click", () => startRound(state.currentCategory));
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
