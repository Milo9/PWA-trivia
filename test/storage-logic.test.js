const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../storage-logic.js");
const L = require("../game-logic.js");
const F = require("../feedback-queue.js");
const question = { id: "history-001", category: "history", difficulty: "easy", question: "A question?", options: ["A", "B", "C", "D"], shuffledOptions: ["B", "A", "C", "D"], answer: "A" };
const saved = () => ({ currentCategoryIds: ["history"], roundQuestions: [question], currentIndex: 100, answers: [], score: 100, mode: "survival", lives: -10, seenByCat: { history: ["history-001", null] } });

test("settings and preferences recover invalid persisted types", () => {
  assert.deepEqual(S.settings({ count: -1, mode: "oops", difficulty: null }), S.settings(null));
  const defaults = { sound: false, autoAdvance: true, theme: "dark" };
  assert.deepEqual(S.prefs({ sound: "true", autoAdvance: null, theme: "oops" }, defaults), defaults);
});

test("stats sanitize nested corruption and preserve completion identities", () => {
  const actual = S.stats({ totalQuestions: 5, totalCorrect: 200, bestPct: Infinity, today: null, byCategory: { history: { totalQuestions: 2, totalCorrect: -1 }, bad: null }, completedRoundIds: ["round-1", "round-1", {}, "<script>"] }, L.defaultStats());
  assert.equal(actual.totalCorrect, 5);
  assert.equal(actual.bestPct, 0);
  assert.equal(actual.byCategory.history.totalCorrect, 0);
  assert.deepEqual(actual.completedRoundIds, ["round-1"]);
  assert.doesNotThrow(() => L.applyGameResult(actual, { score: 1, total: 1, answers: [], bestStreak: 1, mode: "standard" }));
});

test("round validation rejects malformed, unsupported, or mismatched saves", () => {
  for (const bad of [null, {}, { roundQuestions: [{}] }, { ...saved(), v: 2 }, { ...saved(), answers: [{}] }, { ...saved(), roundQuestions: [{ ...question, shuffledOptions: ["A", "A", "B", "C"] }] }, { ...saved(), currentCategoryIds: ["friends"] }]) assert.equal(S.round(bad), null);
});

test("legacy rounds derive score, lives, streak and resume position from valid answers", () => {
  const value = saved();
  value.answers = [{ selected: "B" }];
  const actual = S.round(value);
  assert.equal(actual.score, 0);
  assert.equal(actual.lives, 2);
  assert.equal(actual.currentIndex, 1);
  assert.equal(actual.answers[0].id, question.id);
  assert.deepEqual(actual.seenByCat.history, [question.id]);
});

test("feedback recovery keeps malformed records exportable without recursive wrapping", () => {
  const input = [null, { report: { id: "broken" } }];
  const queue = S.queue(input);
  assert.equal(queue.length, 2);
  assert.ok(queue.every(item => item.failed));
  assert.deepEqual(S.queue(queue), queue);
  assert.deepEqual(queue[1].original, input[1]);
  assert.deepEqual(F.dueItems(queue, Infinity), []);
});

test("valid queued feedback recovers invalid retry metadata", () => {
  const report = F.createReport({ id: "a".repeat(22), question, selected: "A", comment: "", context: "results", deviceId: "b".repeat(22), appBuild: 1, now: 1234 });
  assert.ok(S.report(report));
  const [actual] = S.queue([{ report, attempts: "NaN", nextAttemptAt: Infinity, lastError: null }]);
  assert.equal(actual.attempts, 0);
  assert.equal(actual.nextAttemptAt, 0);
  assert.equal(actual.failed, false);
});

test("storage limits stay in sync with the game rules they validate", () => {
  assert.equal(S.SURVIVAL_LIVES, L.SURVIVAL_LIVES);
  assert.equal(S.MAX_ROUND_QUESTIONS, L.SURVIVAL_POOL_CAP);
  assert.ok(Math.max(...S.COUNT_OPTIONS) <= S.MAX_ROUND_QUESTIONS);
  const many = n => Array.from({ length: n }, (_, i) => ({ ...question, id: `history-${String(i + 1).padStart(3, "0")}` }));
  assert.notEqual(S.round({ ...saved(), roundQuestions: many(L.SURVIVAL_POOL_CAP) }), null);
  assert.equal(S.round({ ...saved(), roundQuestions: many(L.SURVIVAL_POOL_CAP + 1) }), null);
  assert.equal(S.round(saved()).lives, L.SURVIVAL_LIVES);
});
