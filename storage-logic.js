// Validation at the boundary between persisted data and the running app.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.StorageLogic = api;
})(typeof self !== "undefined" ? self : this, function () {
  const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const count = (v, fallback = 0) => Number.isSafeInteger(v) && v >= 0 ? v : fallback;
  const categoryId = (v) => typeof v === "string" && /^[a-z0-9-]{1,40}$/.test(v);
  const questionId = (v) => typeof v === "string" && /^[a-z0-9-]+-[0-9]{3,}$/.test(v) && v.length <= 64;
  const text = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;
  const options = (v) => Array.isArray(v) && v.length === 4 && v.every(s => text(s, 300)) && new Set(v).size === 4;
  // The round-length choices; app.js renders its count picker from this.
  const COUNT_OPTIONS = [10, 20, 30, 40];
  // Mirrors of GameLogic.SURVIVAL_LIVES / SURVIVAL_POOL_CAP (this file loads
  // first and stays standalone); test/storage-logic.test.js keeps them equal.
  const SURVIVAL_LIVES = 3;
  const MAX_ROUND_QUESTIONS = 150;
  // Completed-round ids are kept only to stop a lingering save (or a stale
  // tab) counting a game twice; the most recent ones are all that matter.
  const MAX_COMPLETED_ROUND_IDS = 500;

  function settings(value, defaults = { count: 10, difficulty: "any", mode: "standard" }) {
    const v = object(value) ? value : {};
    return {
      count: COUNT_OPTIONS.includes(v.count) ? v.count : defaults.count,
      difficulty: ["any", "easy", "medium", "hard"].includes(v.difficulty) ? v.difficulty : defaults.difficulty,
      mode: ["standard", "survival"].includes(v.mode) ? v.mode : defaults.mode,
    };
  }

  function prefs(value, defaults) {
    const v = object(value) && (value.v === undefined || value.v === 1) ? value : {};
    return {
      sound: typeof v.sound === "boolean" ? v.sound : defaults.sound,
      autoAdvance: typeof v.autoAdvance === "boolean" ? v.autoAdvance : defaults.autoAdvance,
      theme: ["light", "dark"].includes(v.theme) ? v.theme : defaults.theme,
    };
  }

  function stats(value, defaults) {
    const v = object(value) && (value.v === undefined || value.v === 1) ? value : {};
    const bucket = (b) => {
      b = object(b) ? b : {};
      const totalQuestions = count(b.totalQuestions);
      return { gamesPlayed: count(b.gamesPlayed), totalQuestions, totalCorrect: Math.min(count(b.totalCorrect), totalQuestions) };
    };
    const result = { ...defaults, ...bucket(v), byCategory: {} };
    for (const key of ["bestStreak", "bestSurvivalScore"]) result[key] = count(v[key]);
    result.bestPct = Number.isFinite(v.bestPct) ? Math.max(0, Math.min(100, v.bestPct)) : 0;
    if (object(v.today) && /^\d{4}-\d{2}-\d{2}$/.test(v.today.date)) result.today = { date: v.today.date, ...bucket(v.today) };
    if (object(v.byCategory)) {
      for (const [id, b] of Object.entries(v.byCategory)) if (categoryId(id)) {
        const { totalQuestions, totalCorrect } = bucket(b);
        result.byCategory[id] = { totalQuestions, totalCorrect };
      }
    }
    if (object(v.lastGame) && count(v.lastGame.total) > 0) {
      const total = count(v.lastGame.total);
      const score = Math.min(count(v.lastGame.score), total);
      result.lastGame = { score, total, pct: score / total * 100, mode: v.lastGame.mode === "survival" ? "survival" : "standard" };
    }
    result.completedRoundIds = Array.isArray(v.completedRoundIds)
      ? [...new Set(v.completedRoundIds.filter(id => typeof id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(id)))].slice(-MAX_COMPLETED_ROUND_IDS) : [];
    return result;
  }

  function round(v) {
    if (!object(v) || (v.v !== undefined && v.v !== 1)) return null;
    if (!Array.isArray(v.currentCategoryIds) || !v.currentCategoryIds.length || !v.currentCategoryIds.every(categoryId)) return null;
    if (!Array.isArray(v.roundQuestions) || !v.roundQuestions.length || v.roundQuestions.length > MAX_ROUND_QUESTIONS) return null;
    const ids = new Set();
    for (const q of v.roundQuestions) {
      if (!object(q) || !questionId(q.id) || ids.has(q.id) || !v.currentCategoryIds.includes(q.category)
        || !text(q.question, 600) || !options(q.options) || !q.options.includes(q.answer)
        || !["easy", "medium", "hard"].includes(q.difficulty)
        || !options(q.shuffledOptions) || !q.shuffledOptions.every(o => q.options.includes(o))) return null;
      ids.add(q.id);
    }
    if (!Array.isArray(v.answers) || v.answers.length > v.roundQuestions.length) return null;
    const answers = [];
    let streak = 0, bestStreak = 0, score = 0;
    for (let i = 0; i < v.answers.length; i++) {
      const a = v.answers[i], q = v.roundQuestions[i];
      if (!object(a) || !q.options.includes(a.selected) || (a.id !== undefined && a.id !== q.id)) return null;
      const wasCorrect = a.selected === q.answer;
      score += wasCorrect ? 1 : 0;
      streak = wasCorrect ? streak + 1 : 0;
      bestStreak = Math.max(bestStreak, streak);
      answers.push({ id: q.id, question: q.question, options: q.shuffledOptions.slice(), correctAnswer: q.answer, selected: a.selected, wasCorrect, category: q.category });
    }
    const mode = v.mode === "survival" ? "survival" : "standard";
    const lives = mode === "survival" ? SURVIVAL_LIVES - (answers.length - score) : 0;
    if (lives < 0) return null;
    const seenByCat = {};
    if (object(v.seenByCat)) for (const [id, values] of Object.entries(v.seenByCat)) {
      if (categoryId(id) && Array.isArray(values)) seenByCat[id] = values.filter(questionId);
    }
    return {
      v: 1, roundId: typeof v.roundId === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(v.roundId) ? v.roundId : null,
      revision: count(v.revision), savedAt: count(v.savedAt),
      currentCategoryIds: [...new Set(v.currentCategoryIds)], roundQuestions: v.roundQuestions,
      currentIndex: answers.length, answers, score, streak, bestStreak, mode, lives,
      lifelineUsed: v.lifelineUsed === true, seenByCat, settings: { ...settings(v.settings), mode },
    };
  }

  function report(v) {
    return object(v) && Object.keys(v).length === 13 && v.v === 1 && /^[A-Za-z0-9_-]{22}$/.test(v.id)
      && /^[A-Za-z0-9_-]{22}$/.test(v.deviceId) && questionId(v.questionId) && categoryId(v.category)
      && text(v.question, 600) && options(v.options) && v.options.includes(v.answer)
      && typeof v.selected === "string" && (v.selected === "" || v.options.includes(v.selected))
      && typeof v.comment === "string" && v.comment.length <= 500
      && ["quiz-before-answer", "quiz-after-answer", "results"].includes(v.context)
      && count(v.appBuild, -1) >= 0 && count(v.clientCreatedAt, -1) >= 0;
  }

  function queue(value) {
    if (!Array.isArray(value)) return null;
    return value.map(item => {
      if (!object(item) || !report(item.report)) {
        if (object(item) && item.failed === true && Object.hasOwn(item, "original")) return { ...item, failed: true };
        return { report: object(item) ? item.report : null, original: item, failed: true, attempts: 0, nextAttemptAt: 0, lastError: "Saved report needs recovery" };
      }
      return { ...item, attempts: count(item.attempts), nextAttemptAt: count(item.nextAttemptAt), sendingUntil: count(item.sendingUntil), lastError: typeof item.lastError === "string" ? item.lastError : "", failed: item.failed === true };
    });
  }

  return { COUNT_OPTIONS, SURVIVAL_LIVES, MAX_ROUND_QUESTIONS, MAX_COMPLETED_ROUND_IDS, settings, prefs, stats, round, report, queue, categoryId, questionId };
});
