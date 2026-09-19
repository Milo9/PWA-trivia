// Pure game logic shared by app.js (loaded as a plain <script> before it —
// no build step, per CLAUDE.md) and test/game-logic.test.js (loaded via
// require). Nothing in here touches the DOM, localStorage, timers, or
// Math.random directly: anything random takes an `rng` argument so tests
// can pin it. Keep it that way — this file exists so the round-building,
// resume, and stats rules can be unit-tested without a browser.

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GameLogic = api;
})(typeof self !== "undefined" ? self : this, function () {
  const SURVIVAL_LIVES = 3;
  // Capped well below "the whole selected pool" — the active round is
  // serialized to localStorage on every answer, and an uncapped select-all
  // survival round (thousands of questions) would blow past localStorage's
  // ~5MB quota on iOS Safari and silently break resume.
  const SURVIVAL_POOL_CAP = 150;

  function shuffle(array, rng = Math.random) {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function filterByDifficulty(questions, difficulty) {
    return difficulty === "any" ? questions : questions.filter((q) => q.difficulty === difficulty);
  }

  function requestedCountFor(settings, poolSize) {
    return settings.mode === "survival"
      ? Math.min(SURVIVAL_POOL_CAP, poolSize)
      : Math.min(settings.count, poolSize);
  }

  // Builds a round's question list from the selected categories.
  //
  // Balanced across categories: questions are drawn round-robin, one per
  // category per pass, so a small category isn't drowned out by a large one
  // in a mixed round (uniform sampling from the combined pool gave a
  // 852-question category ~30% of a round against a 1978-question one).
  //
  // Repeat avoidance is per category *and* per difficulty pool: a category
  // whose unseen questions (at this difficulty) run dry mid-draw has just
  // that pool's ids cleared from its seen set — other selected categories,
  // and the same category's other difficulties, keep their history.
  //
  // `seenByCat` maps categoryId -> Set<questionId> and is treated as
  // read-only; the returned `seenByCat` is a fresh copy with any resets
  // applied, and `resetCategoryIds` lists which categories were reset so
  // the caller can persist those.
  function buildRound(categories, settings, seenByCat, rng = Math.random) {
    const nextSeen = {};
    for (const cat of categories) nextSeen[cat.id] = new Set(seenByCat[cat.id] || []);

    const pools = categories.map((cat) => {
      const filtered = filterByDifficulty(cat.questions, settings.difficulty);
      return {
        cat,
        filtered,
        unseen: shuffle(filtered.filter((q) => !nextSeen[cat.id].has(q.id)), rng),
        reset: false,
      };
    });

    const poolSize = pools.reduce((n, p) => n + p.filtered.length, 0);
    const requested = requestedCountFor(settings, poolSize);
    const picked = [];
    const pickedIds = new Set();
    const resetCategoryIds = [];

    while (picked.length < requested) {
      let progressed = false;
      for (const pool of pools) {
        if (picked.length >= requested) break;
        if (pool.unseen.length === 0 && !pool.reset && pool.filtered.length > 0) {
          // This category's difficulty pool is exhausted: forget just those
          // ids and refill with whatever this round hasn't already taken.
          pool.reset = true;
          resetCategoryIds.push(pool.cat.id);
          for (const q of pool.filtered) nextSeen[pool.cat.id].delete(q.id);
          pool.unseen = shuffle(pool.filtered.filter((q) => !pickedIds.has(q.id)), rng);
        }
        if (pool.unseen.length === 0) continue;
        const q = pool.unseen.pop();
        picked.push(q);
        pickedIds.add(q.id);
        progressed = true;
      }
      if (!progressed) break;
    }

    const questions = picked.map((q) => ({ ...q, shuffledOptions: shuffle(q.options, rng) }));
    return { questions, seenByCat: nextSeen, resetCategoryIds };
  }

  // Works out where a saved round should pick back up. The index is only
  // checkpointed after "Next," so a save that landed right after an answer
  // (before "Next" was tapped) would otherwise re-render an already-answered
  // question and double-count it once the user answers again.
  function reconcileResume(saved) {
    const total = saved.roundQuestions.length;
    const answeredCount = Math.min(saved.answers.length, total);
    const mode = saved.mode || "standard";
    const lives = typeof saved.lives === "number" ? saved.lives : 0;
    const finished = mode === "survival"
      ? lives <= 0 || answeredCount >= total
      : answeredCount >= total;
    return {
      answeredCount,
      mode,
      lives,
      finished,
      currentIndex: Math.max(saved.currentIndex || 0, answeredCount),
    };
  }

  function starRating(score, total) {
    const pct = total > 0 ? (score / total) * 100 : 0;
    if (pct >= 90) return 3;
    if (pct >= 70) return 2;
    if (pct >= 50) return 1;
    return 0;
  }

  function dateKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function defaultStats(today = dateKey()) {
    return {
      gamesPlayed: 0,
      totalQuestions: 0,
      totalCorrect: 0,
      bestPct: 0,
      bestStreak: 0,
      bestSurvivalScore: 0,
      lastGame: null, // { score, total, pct, mode }
      today: { date: today, gamesPlayed: 0, totalQuestions: 0, totalCorrect: 0 },
      byCategory: {}, // { [categoryId]: { totalQuestions, totalCorrect } }
    };
  }

  // Returns stats.today if it's still today's bucket, otherwise a fresh
  // zeroed-out bucket for the current date (doesn't mutate).
  function todayBucket(stats, today = dateKey()) {
    if (stats.today && stats.today.date === today) return stats.today;
    return { date: today, gamesPlayed: 0, totalQuestions: 0, totalCorrect: 0 };
  }

  // Pure version of "record this game": returns a new stats object. `answers`
  // carries the category each question actually belonged to, so a mixed
  // round attributes each question to its own category. bestPct only makes
  // sense for a fixed-length standard round — a survival run is structurally
  // almost-all-correct, so it gets its own bestSurvivalScore instead.
  function applyGameResult(stats, { score, total, answers, bestStreak, mode }, today = dateKey()) {
    const next = {
      ...stats,
      byCategory: { ...stats.byCategory },
      gamesPlayed: stats.gamesPlayed + 1,
      totalQuestions: stats.totalQuestions + total,
      totalCorrect: stats.totalCorrect + score,
    };
    const pct = total > 0 ? (score / total) * 100 : 0;
    if (mode === "survival") {
      if (score > next.bestSurvivalScore) next.bestSurvivalScore = score;
    } else if (pct > next.bestPct) {
      next.bestPct = pct;
    }
    if (bestStreak > next.bestStreak) next.bestStreak = bestStreak;

    const bucket = { ...todayBucket(stats, today) };
    bucket.gamesPlayed += 1;
    bucket.totalQuestions += total;
    bucket.totalCorrect += score;
    next.today = bucket;
    next.lastGame = { score, total, pct, mode };

    for (const a of answers || []) {
      if (!a.category) continue;
      const prev = next.byCategory[a.category] || { totalQuestions: 0, totalCorrect: 0 };
      next.byCategory[a.category] = {
        totalQuestions: prev.totalQuestions + 1,
        totalCorrect: prev.totalCorrect + (a.wasCorrect ? 1 : 0),
      };
    }
    return next;
  }

  return {
    SURVIVAL_LIVES,
    SURVIVAL_POOL_CAP,
    shuffle,
    filterByDifficulty,
    requestedCountFor,
    buildRound,
    reconcileResume,
    starRating,
    dateKey,
    defaultStats,
    todayBucket,
    applyGameResult,
  };
});
