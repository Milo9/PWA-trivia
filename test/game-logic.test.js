// Unit tests for the pure game logic in game-logic.js. Run with `npm test`
// (node:test, no dependencies). `npm run ship` runs these before validating.
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../game-logic.js");

// Deterministic rng: a tiny LCG, so shuffles are reproducible per test.
function seededRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeCategory(id, count, difficulty = "easy") {
  return {
    id,
    name: id,
    questions: Array.from({ length: count }, (_, i) => ({
      id: `${id}-${String(i + 1).padStart(3, "0")}`,
      category: id,
      difficulty: typeof difficulty === "function" ? difficulty(i) : difficulty,
      question: `${id} question ${i + 1}?`,
      options: ["A", "B", "C", "D"],
      answer: "A",
    })),
  };
}

test("shuffle returns a permutation and leaves the input alone", () => {
  const input = [1, 2, 3, 4, 5, 6];
  const out = L.shuffle(input, seededRng(3));
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(out.slice().sort(), input);
});

test("filterByDifficulty: 'any' passes everything through", () => {
  const qs = makeCategory("x", 6, (i) => ["easy", "medium", "hard"][i % 3]).questions;
  assert.equal(L.filterByDifficulty(qs, "any").length, 6);
  assert.equal(L.filterByDifficulty(qs, "hard").length, 2);
});

test("requestedCountFor caps standard rounds at the pool and survival at the cap", () => {
  assert.equal(L.requestedCountFor({ mode: "standard", count: 20 }, 7), 7);
  assert.equal(L.requestedCountFor({ mode: "standard", count: 20 }, 500), 20);
  assert.equal(L.requestedCountFor({ mode: "survival", count: 10 }, 5000), L.SURVIVAL_POOL_CAP);
  assert.equal(L.requestedCountFor({ mode: "survival", count: 10 }, 40), 40);
});

test("buildRound balances a mixed round across categories of very different sizes", () => {
  const small = makeCategory("small", 30);
  const big = makeCategory("big", 900);
  const { questions } = L.buildRound([small, big], { mode: "standard", count: 20, difficulty: "any" }, {}, seededRng(7));
  assert.equal(questions.length, 20);
  const fromSmall = questions.filter((q) => q.category === "small").length;
  assert.equal(fromSmall, 10, "round-robin should give each category half the round");
  assert.equal(new Set(questions.map((q) => q.id)).size, 20, "no repeats within a round");
  for (const q of questions) {
    assert.deepEqual(q.shuffledOptions.slice().sort(), q.options.slice().sort());
  }
});

test("buildRound skips already-seen questions until a category's pool runs dry", () => {
  const cat = makeCategory("c", 12);
  const seen = { c: new Set(cat.questions.slice(0, 7).map((q) => q.id)) };
  const { questions, resetCategoryIds } = L.buildRound([cat], { mode: "standard", count: 5, difficulty: "any" }, seen, seededRng(1));
  assert.equal(questions.length, 5);
  assert.deepEqual(resetCategoryIds, []);
  for (const q of questions) assert.ok(!seen.c.has(q.id), `${q.id} was already seen`);
});

test("buildRound resets only the exhausted category, not its neighbours", () => {
  const a = makeCategory("a", 4);
  const b = makeCategory("b", 40);
  const seen = {
    a: new Set(a.questions.map((q) => q.id)), // fully exhausted
    b: new Set(b.questions.slice(0, 5).map((q) => q.id)),
  };
  const result = L.buildRound([a, b], { mode: "standard", count: 8, difficulty: "any" }, seen, seededRng(11));
  assert.equal(result.questions.length, 8);
  assert.deepEqual(result.resetCategoryIds, ["a"]);
  assert.equal(result.seenByCat.a.size, 0, "exhausted category's seen set was cleared");
  assert.equal(result.seenByCat.b.size, 5, "the other category's history is untouched");
  assert.equal(seen.a.size, 4, "input seen sets are not mutated");
  assert.equal(result.questions.filter((q) => q.category === "a").length, 4);
  for (const q of result.questions.filter((q) => q.category === "b")) assert.ok(!seen.b.has(q.id));
});

test("buildRound resets only the current difficulty's ids when that pool is exhausted", () => {
  const cat = makeCategory("c", 10, (i) => (i < 4 ? "easy" : "hard"));
  const easyIds = cat.questions.filter((q) => q.difficulty === "easy").map((q) => q.id);
  const hardIds = cat.questions.filter((q) => q.difficulty === "hard").map((q) => q.id);
  const seen = { c: new Set([...easyIds, ...hardIds.slice(0, 2)]) };
  const result = L.buildRound([cat], { mode: "standard", count: 10, difficulty: "easy" }, seen, seededRng(5));
  assert.equal(result.questions.length, 4, "easy pool only has 4 questions");
  assert.deepEqual(result.resetCategoryIds, ["c"]);
  for (const id of hardIds.slice(0, 2)) assert.ok(result.seenByCat.c.has(id), "hard-difficulty history survives an easy reset");
  for (const id of easyIds) assert.ok(!result.seenByCat.c.has(id));
});

test("buildRound never repeats a question inside one round even after a mid-draw reset", () => {
  const cat = makeCategory("c", 6);
  const seen = { c: new Set(cat.questions.slice(0, 5).map((q) => q.id)) };
  const { questions } = L.buildRound([cat], { mode: "standard", count: 6, difficulty: "any" }, seen, seededRng(2));
  assert.equal(questions.length, 6);
  assert.equal(new Set(questions.map((q) => q.id)).size, 6);
});

test("buildRound survival mode caps the pool", () => {
  const cat = makeCategory("c", 400);
  const { questions } = L.buildRound([cat], { mode: "survival", count: 10, difficulty: "any" }, {}, seededRng(9));
  assert.equal(questions.length, L.SURVIVAL_POOL_CAP);
});

test("buildRound with an empty pool returns no questions", () => {
  const cat = makeCategory("c", 5, "easy");
  const { questions } = L.buildRound([cat], { mode: "standard", count: 10, difficulty: "hard" }, {}, seededRng(1));
  assert.equal(questions.length, 0);
});

test("reconcileResume lands on the first unanswered question, even if the index lagged", () => {
  const saved = { roundQuestions: new Array(10), answers: new Array(3), currentIndex: 2, mode: "standard" };
  const r = L.reconcileResume(saved);
  assert.equal(r.currentIndex, 3);
  assert.equal(r.finished, false);
  assert.equal(r.answeredCount, 3);
});

test("reconcileResume marks a fully-answered standard round finished", () => {
  const r = L.reconcileResume({ roundQuestions: new Array(5), answers: new Array(5), currentIndex: 4 });
  assert.equal(r.finished, true);
  assert.equal(r.mode, "standard");
});

test("reconcileResume marks a survival round with no lives left finished", () => {
  const r = L.reconcileResume({ roundQuestions: new Array(150), answers: new Array(12), currentIndex: 11, mode: "survival", lives: 0 });
  assert.equal(r.finished, true);
  const alive = L.reconcileResume({ roundQuestions: new Array(150), answers: new Array(12), currentIndex: 11, mode: "survival", lives: 1 });
  assert.equal(alive.finished, false);
  assert.equal(alive.currentIndex, 12);
});

test("starRating thresholds", () => {
  assert.equal(L.starRating(10, 10), 3);
  assert.equal(L.starRating(9, 10), 3);
  assert.equal(L.starRating(7, 10), 2);
  assert.equal(L.starRating(5, 10), 1);
  assert.equal(L.starRating(4, 10), 0);
  assert.equal(L.starRating(0, 0), 0);
});

test("applyGameResult updates totals, bests, today bucket and per-category stats without mutating input", () => {
  const stats = L.defaultStats("2026-09-18");
  const answers = [
    { category: "a", wasCorrect: true },
    { category: "a", wasCorrect: false },
    { category: "b", wasCorrect: true },
  ];
  const next = L.applyGameResult(stats, { score: 2, total: 3, answers, bestStreak: 2, mode: "standard" }, "2026-09-18");
  assert.equal(stats.gamesPlayed, 0, "input not mutated");
  assert.equal(next.gamesPlayed, 1);
  assert.equal(next.totalQuestions, 3);
  assert.equal(next.totalCorrect, 2);
  assert.ok(Math.abs(next.bestPct - 66.67) < 0.01);
  assert.equal(next.bestStreak, 2);
  assert.deepEqual(next.byCategory, { a: { totalQuestions: 2, totalCorrect: 1 }, b: { totalQuestions: 1, totalCorrect: 1 } });
  assert.deepEqual(next.today, { date: "2026-09-18", gamesPlayed: 1, totalQuestions: 3, totalCorrect: 2 });
  assert.deepEqual(next.lastGame, { score: 2, total: 3, pct: (2 / 3) * 100, mode: "standard" });
});

test("applyGameResult: survival scores don't touch bestPct, and a new day resets the today bucket", () => {
  let stats = L.defaultStats("2026-09-17");
  stats = L.applyGameResult(stats, { score: 8, total: 10, answers: [], bestStreak: 4, mode: "standard" }, "2026-09-17");
  const after = L.applyGameResult(stats, { score: 25, total: 27, answers: [], bestStreak: 9, mode: "survival" }, "2026-09-18");
  assert.equal(after.bestPct, 80, "survival run must not raise bestPct");
  assert.equal(after.bestSurvivalScore, 25);
  assert.equal(after.bestStreak, 9);
  assert.deepEqual(after.today, { date: "2026-09-18", gamesPlayed: 1, totalQuestions: 27, totalCorrect: 25 });
});

test("todayBucket returns the stored bucket only for the same date", () => {
  const stats = { today: { date: "2026-09-18", gamesPlayed: 2, totalQuestions: 20, totalCorrect: 15 } };
  assert.equal(L.todayBucket(stats, "2026-09-18"), stats.today);
  assert.deepEqual(L.todayBucket(stats, "2026-09-19"), { date: "2026-09-19", gamesPlayed: 0, totalQuestions: 0, totalCorrect: 0 });
});
