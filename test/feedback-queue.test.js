// Unit tests for the pure feedback-outbox logic in feedback-queue.js. Run
// with `npm test` (node:test, no dependencies).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const F = require("../feedback-queue.js");

const QUESTION = {
  id: "history-1234",
  category: "history",
  question: "Who was the first emperor of Rome?",
  options: ["Augustus", "Nero", "Caesar", "Trajan"],
  answer: "Augustus",
};

function report(overrides = {}) {
  return F.createReport({
    id: "A".repeat(22),
    question: QUESTION,
    selected: "Nero",
    comment: "bad",
    context: "quiz-after-answer",
    deviceId: "D".repeat(22),
    appBuild: 7,
    now: 1_730_000_000_000,
    ...overrides,
  });
}

function item(id, questionId, extra = {}) {
  return { report: { id, questionId }, attempts: 0, nextAttemptAt: 0, lastError: "", ...extra };
}

test("makeId: 22 chars, base64url alphabet only, deterministic", () => {
  const bytes = Uint8Array.from({ length: 16 }, (_, i) => i * 17 + 3);
  const id = F.makeId(bytes);
  assert.equal(id.length, 22);
  assert.match(id, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(F.makeId(bytes), id);
  assert.notEqual(F.makeId(new Uint8Array(16)), id);
});

test("makeId: matches Node's base64url for the same bytes", () => {
  for (const fill of [0, 1, 0xfb, 0xff, 0x3e]) {
    const bytes = new Uint8Array(16).fill(fill);
    assert.equal(F.makeId(bytes), Buffer.from(bytes).toString("base64url"));
  }
  const mixed = Uint8Array.from([250, 251, 252, 253, 254, 255, 0, 1, 2, 3, 62, 63, 64, 65, 66, 67]);
  assert.equal(F.makeId(mixed), Buffer.from(mixed).toString("base64url"));
});

test("normalizeComment: trims, collapses newline runs, truncates, coerces", () => {
  assert.equal(F.normalizeComment("  hi  "), "hi");
  assert.equal(F.normalizeComment("a\n\n\n\n\nb"), "a\n\nb");
  assert.equal(F.normalizeComment("a\n\nb"), "a\n\nb");
  assert.equal(F.normalizeComment("x".repeat(600)).length, F.MAX_COMMENT_LENGTH);
  assert.equal(F.normalizeComment(null), "");
  assert.equal(F.normalizeComment(undefined), "");
  assert.equal(F.normalizeComment(42), "42");
});

test("createReport: shape, null selected -> empty string, options copied", () => {
  const r = report({ selected: null });
  assert.equal(r.v, 1);
  assert.equal(r.selected, "");
  assert.equal(r.questionId, "history-1234");
  assert.equal(r.category, "history");
  assert.equal(r.answer, "Augustus");
  assert.equal(r.clientCreatedAt, 1_730_000_000_000);

  const source = { ...QUESTION, options: QUESTION.options.slice() };
  const r2 = report({ question: source });
  source.options[0] = "MUTATED";
  assert.equal(r2.options[0], "Augustus");
});

test("createReport: appBuild falls back to 0", () => {
  assert.equal(report({ appBuild: undefined }).appBuild, 0);
  assert.equal(report({ appBuild: -3 }).appBuild, 0);
});

test("createReport: throws on bad context or malformed question", () => {
  assert.throws(() => report({ context: "nope" }));
  assert.throws(() => report({ question: { ...QUESTION, id: "" } }));
  assert.throws(() => report({ question: { ...QUESTION, id: undefined } }));
  assert.throws(() => report({ question: { ...QUESTION, options: ["a", "b", "c"] } }));
  assert.throws(() => report({ question: { ...QUESTION, options: undefined } }));
});

test("enqueue: appends, replaces same questionId in place, doesn't mutate", () => {
  const q0 = [];
  const q1 = F.enqueue(q0, report({ id: "1".repeat(22) }));
  assert.equal(q0.length, 0);
  assert.equal(q1.length, 1);
  assert.deepEqual(
    { attempts: q1[0].attempts, nextAttemptAt: q1[0].nextAttemptAt, lastError: q1[0].lastError },
    { attempts: 0, nextAttemptAt: 0, lastError: "" }
  );

  const other = { ...QUESTION, id: "history-9999" };
  const q2 = F.enqueue(q1, report({ id: "2".repeat(22), question: other }));
  assert.equal(q2.length, 2);

  const q3 = F.enqueue(q2, report({ id: "3".repeat(22), comment: "newer" }));
  assert.equal(q2.length, 2);
  assert.equal(q3.length, 2);
  assert.equal(q3[0].report.id, "3".repeat(22));
  assert.equal(q3[0].report.comment, "newer");
  assert.equal(q3[1].report.questionId, "history-9999");
});

test("enqueue: caps at MAX_QUEUE by dropping the oldest", () => {
  let queue = [];
  for (let i = 0; i < F.MAX_QUEUE + 5; i++) {
    queue = F.enqueue(queue, report({ id: String(i).padStart(22, "0"), question: { ...QUESTION, id: `history-${1000 + i}` } }));
  }
  assert.equal(queue.length, F.MAX_QUEUE);
  assert.equal(queue[0].report.questionId, "history-1005");
  assert.equal(queue[queue.length - 1].report.questionId, `history-${1000 + F.MAX_QUEUE + 4}`);
});

test("dueItems / nextDueAt respect nextAttemptAt", () => {
  const queue = [item("a", "q1", { nextAttemptAt: 500 }), item("b", "q2", { nextAttemptAt: 100 }), item("c", "q3", { nextAttemptAt: 0 })];
  assert.deepEqual(F.dueItems(queue, 100).map((i) => i.report.id), ["b", "c"]);
  assert.deepEqual(F.dueItems(queue, 99).map((i) => i.report.id), ["c"]);
  assert.deepEqual(F.dueItems(queue, 1000).map((i) => i.report.id), ["a", "b", "c"]);
  assert.equal(F.nextDueAt(queue), 0);
  assert.equal(F.nextDueAt([queue[0], queue[1]]), 100);
  assert.equal(F.nextDueAt([]), null);
});

test("classify: status table", () => {
  const table = [
    [{ status: 200 }, "sent"],
    [{ status: 204 }, "sent"],
    [{ networkError: true }, "offline"],
    [{ status: 400 }, "invalid"],
    [{ status: 413 }, "invalid"],
    [{ status: 401 }, "retry"],
    [{ status: 403 }, "retry"],
    [{ status: 404 }, "retry"],
    [{ status: 408 }, "retry"],
    [{ status: 418 }, "retry"],
    [{ status: 429 }, "retry"],
    [{ status: 500 }, "retry"],
    [{ status: 503 }, "retry"],
  ];
  for (const [input, expected] of table) {
    assert.equal(F.classify(input), expected, JSON.stringify(input));
  }
});

test("backoffMs: 0, doubling, capped", () => {
  assert.equal(F.backoffMs(0), 0);
  assert.equal(F.backoffMs(1), 30_000);
  assert.equal(F.backoffMs(2), 60_000);
  assert.equal(F.backoffMs(3), 120_000);
  assert.equal(F.backoffMs(100), F.BACKOFF_MAX_MS);
  assert.equal(F.backoffMs(1000), F.BACKOFF_MAX_MS);
});

test("applyOutcome: sent removes the item", () => {
  const queue = [item("a", "q1"), item("b", "q2")];
  const { queue: next, dropped } = F.applyOutcome(queue, "a", "sent", 1000);
  assert.deepEqual(next.map((i) => i.report.id), ["b"]);
  assert.equal(dropped, null);
  assert.equal(queue.length, 2);
});

test("applyOutcome: offline leaves the queue unchanged and costs no attempt", () => {
  const queue = [item("a", "q1")];
  const { queue: next, dropped } = F.applyOutcome(queue, "a", "offline", 1000);
  assert.equal(next, queue);
  assert.equal(next[0].attempts, 0);
  assert.equal(dropped, null);
});

test("applyOutcome: retry increments and backs off but never drops", () => {
  let queue = [item("a", "q1")];
  let now = 1_000_000;
  for (let i = 1; i <= 50; i++) {
    const res = F.applyOutcome(queue, "a", "retry", now, 401);
    assert.equal(res.dropped, null);
    queue = res.queue;
    assert.equal(queue.length, 1);
    assert.equal(queue[0].attempts, i);
    assert.equal(queue[0].nextAttemptAt, now + F.backoffMs(i));
    assert.equal(queue[0].lastError, "401");
  }
  assert.equal(queue[0].nextAttemptAt - now, F.BACKOFF_MAX_MS);
});

test("applyOutcome: invalid drops only at MAX_INVALID_ATTEMPTS and returns dropped", () => {
  let queue = [item("a", "q1"), item("b", "q2")];
  for (let i = 1; i < F.MAX_INVALID_ATTEMPTS; i++) {
    const res = F.applyOutcome(queue, "a", "invalid", 5000, 400);
    assert.equal(res.dropped, null);
    queue = res.queue;
    assert.equal(queue.find((it) => it.report.id === "a").attempts, i);
  }
  const res = F.applyOutcome(queue, "a", "invalid", 5000, 400);
  assert.deepEqual(res.queue.map((it) => it.report.id), ["b"]);
  assert.equal(res.dropped.report.id, "a");
  assert.equal(res.dropped.attempts, F.MAX_INVALID_ATTEMPTS);
  assert.equal(res.dropped.lastError, "400");
});

test("applyOutcome: unknown id is a no-op", () => {
  const queue = [item("a", "q1")];
  for (const outcome of ["sent", "offline", "retry", "invalid"]) {
    const res = F.applyOutcome(queue, "zzz", outcome, 1000, 500);
    assert.equal(res.queue, queue);
    assert.equal(res.dropped, null);
  }
});

// Hard-coded copy of the key set firebase/database.rules.json requires. If
// this changes, the rules file and the report shape must change together.
const RULES_REQUIRED_KEYS = [
  "v", "id", "questionId", "category", "question", "options", "answer",
  "selected", "comment", "context", "deviceId", "appBuild", "clientCreatedAt", "receivedAt",
];

test("toWireBody: key set and types match what the Firebase rules require", () => {
  const body = F.toWireBody(report());
  assert.deepEqual(Object.keys(body).sort(), RULES_REQUIRED_KEYS.slice().sort());
  assert.equal(body.v, 1);
  assert.equal(typeof body.id, "string");
  assert.equal(body.id.length, 22);
  assert.match(body.questionId, /^[a-z0-9-]+-[0-9]{3,}$/);
  assert.match(body.category, /^[a-z0-9-]{1,40}$/);
  assert.equal(typeof body.question, "string");
  assert.equal(body.options.length, 4);
  assert.ok(body.options.every((o) => typeof o === "string"));
  assert.equal(typeof body.answer, "string");
  assert.equal(typeof body.selected, "string");
  assert.equal(typeof body.comment, "string");
  assert.ok(F.CONTEXTS.includes(body.context));
  assert.match(body.deviceId, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(typeof body.appBuild, "number");
  assert.equal(typeof body.clientCreatedAt, "number");
  assert.deepEqual(body.receivedAt, { ".sv": "timestamp" });

  // "selected" for a before-answer report is "" (never null/undefined).
  const before = F.toWireBody(report({ selected: null, context: "quiz-before-answer" }));
  assert.equal(before.selected, "");
  assert.deepEqual(Object.keys(before).sort(), RULES_REQUIRED_KEYS.slice().sort());
});

test("rules file requires exactly the same key set as the wire body", () => {
  const file = path.join(__dirname, "..", "firebase", "database.rules.json");
  if (!fs.existsSync(file)) return; // written in a later phase
  const rules = JSON.parse(fs.readFileSync(file, "utf8")).rules.feedback.$reportId;
  const match = rules[".validate"].match(/hasChildren\(\[([^\]]*)\]\)/);
  assert.ok(match, "rules .validate should call hasChildren([...])");
  const required = match[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
  assert.deepEqual(required.sort(), RULES_REQUIRED_KEYS.slice().sort());
  // Every required key also has its own validation rule.
  for (const key of RULES_REQUIRED_KEYS) assert.ok(rules[key], `rules missing validator for ${key}`);
});
