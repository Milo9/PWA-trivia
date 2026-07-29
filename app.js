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
  resultsReview: document.getElementById("results-review"),
  playAgainBtn: document.getElementById("play-again-btn"),
  chooseCategoryBtn: document.getElementById("choose-category-btn"),
};

function showScreen(name) {
  for (const s of [el.screenCategories, el.screenSettings, el.screenQuiz, el.screenResults]) {
    s.classList.add("hidden");
  }
  if (name === "categories") el.screenCategories.classList.remove("hidden");
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

function startRound(category) {
  state.currentCategory = category;
  const filtered = filterByDifficulty(category.questions, state.settings.difficulty);
  const pool = shuffle(filtered);
  const count = Math.min(state.settings.count, pool.length);
  state.roundQuestions = pool.slice(0, count).map((q) => ({
    ...q,
    shuffledOptions: shuffle(q.options),
  }));
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
  el.resultsScore.textContent = `${state.score}/${total}`;
  el.resultsSubtitle.textContent = subtitleFor(state.score, total);

  el.resultsReview.innerHTML = "";
  for (const a of state.answers) {
    const item = document.createElement("div");
    item.className = "review-item";
    const answerLine = a.wasCorrect
      ? `<p class="review-answer right">✓ ${a.selected}</p>`
      : `<p class="review-answer wrong">✗ ${a.selected}</p><p class="review-answer right">✓ ${a.correctAnswer}</p>`;
    item.innerHTML = `<p class="review-question">${a.question}</p>${answerLine}`;
    el.resultsReview.appendChild(item);
  }

  showScreen("results");
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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // offline-first app still works without SW registration succeeding on first load
    });
  });
}
