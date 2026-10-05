// Pure logic for the thumbs-down question-feedback outbox (loaded as a plain
// <script> before app.js — no build step, per CLAUDE.md — and by
// test/feedback-queue.test.js via require). Nothing in here touches the DOM,
// localStorage, fetch, Date.now, or Math.random/crypto: time and randomness
// are passed in, so the queue/backoff rules can be unit-tested without a
// browser. IO (storage, network, UI) lives in app.js.
//
// Delivery model: every report has a client-generated id and is delivered by
// an idempotent PUT to /feedback/<id>.json, so a retry after a lost response
// rewrites the same record instead of duplicating it. Never switch to POST.

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FeedbackQueue = api;
})(typeof self !== "undefined" ? self : this, function () {
  const SCHEMA_VERSION = 1;
  const MAX_COMMENT_LENGTH = 500;
  const MAX_QUEUE = 200;
  const MAX_INVALID_ATTEMPTS = 3;
  const BACKOFF_BASE_MS = 30_000;
  const BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;
  const CONTEXTS = ["quiz-before-answer", "quiz-after-answer", "results"];

  const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  // 16 random bytes -> 22 base64url chars, no padding. Hand-rolled (no btoa /
  // Buffer) so it behaves identically in the browser and in Node. RTDB keys
  // can't contain . # $ [ ] / — base64url never produces any of those.
  function makeId(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const b0 = bytes[i];
      const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
      const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
      const n = (b0 << 16) | (b1 << 8) | b2;
      out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63];
      if (i + 1 < bytes.length) out += B64URL[(n >> 6) & 63];
      if (i + 2 < bytes.length) out += B64URL[n & 63];
    }
    return out;
  }

  function normalizeComment(text) {
    let s = text == null ? "" : String(text);
    s = s.trim().replace(/\n{3,}/g, "\n\n");
    return s.length > MAX_COMMENT_LENGTH ? s.slice(0, MAX_COMMENT_LENGTH) : s;
  }

  function createReport({ id, question, selected, comment, context, deviceId, appBuild, now }) {
    if (!CONTEXTS.includes(context)) throw new Error(`Invalid feedback context: ${context}`);
    if (!question || typeof question.id !== "string" || !question.id) {
      throw new Error("Question is missing an id");
    }
    if (!Array.isArray(question.options) || question.options.length !== 4) {
      throw new Error("Question must have exactly 4 options");
    }
    return {
      v: SCHEMA_VERSION,
      id,
      questionId: question.id,
      category: question.category,
      question: question.question,
      options: question.options.slice(),
      answer: question.answer,
      // RTDB drops nulls, which would fail the rules' schema — always a string.
      selected: selected == null ? "" : String(selected),
      comment: normalizeComment(comment),
      context,
      deviceId,
      appBuild: typeof appBuild === "number" && appBuild >= 0 ? appBuild : 0,
      clientCreatedAt: now,
    };
  }

  // Returns a new array; a report for a question that's already queued
  // replaces that item in place (latest comment wins). Over MAX_QUEUE, the
  // oldest items fall off the front.
  function enqueue(queue, report) {
    const item = { report, attempts: 0, nextAttemptAt: 0, lastError: "" };
    const next = queue.slice();
    const existing = next.findIndex((it) => it.report.questionId === report.questionId);
    if (existing !== -1) next[existing] = item;
    else next.push(item);
    return next.length > MAX_QUEUE ? next.slice(next.length - MAX_QUEUE) : next;
  }

  function dueItems(queue, now) {
    return queue.filter((it) => it.nextAttemptAt <= now);
  }

  function nextDueAt(queue) {
    if (!queue.length) return null;
    return Math.min(...queue.map((it) => it.nextAttemptAt));
  }

  // result is { networkError: true } or { status: number }.
  //
  // 401/403/404 deliberately "retry" and never drop: RTDB answers 401 for ANY
  // rule rejection, so a broken rules file is indistinguishable from a bad
  // payload, and 401/404 are also what you get before the Firebase project is
  // set up. Dropping on those would silently delete every queued report on
  // every phone. A stuck item costs ~4 requests a day at the backoff cap.
  function classify(result) {
    if (result && result.networkError) return "offline";
    const status = result && result.status;
    if (status >= 200 && status <= 299) return "sent";
    if (status === 400 || status === 413) return "invalid";
    return "retry";
  }

  function backoffMs(attempts) {
    if (!(attempts >= 1)) return 0;
    return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (attempts - 1));
  }

  function applyOutcome(queue, reportId, outcome, now, status) {
    const idx = queue.findIndex((it) => it.report.id === reportId);
    if (idx === -1) return { queue, dropped: null };
    const item = queue[idx];

    if (outcome === "sent") {
      return { queue: queue.filter((_, i) => i !== idx), dropped: null };
    }
    if (outcome === "retry" || outcome === "invalid") {
      const attempts = item.attempts + 1;
      if (outcome === "invalid" && attempts >= MAX_INVALID_ATTEMPTS) {
        return {
          queue: queue.filter((_, i) => i !== idx),
          dropped: { ...item, attempts, lastError: String(status) },
        };
      }
      const updated = {
        ...item,
        attempts,
        nextAttemptAt: now + backoffMs(attempts),
        lastError: String(status),
      };
      const next = queue.slice();
      next[idx] = updated;
      return { queue: next, dropped: null };
    }
    // "offline" (the normal state, costs no attempt) and anything unknown.
    return { queue, dropped: null };
  }

  function toWireBody(report) {
    return { ...report, receivedAt: { ".sv": "timestamp" } };
  }

  return {
    SCHEMA_VERSION,
    MAX_COMMENT_LENGTH,
    MAX_QUEUE,
    MAX_INVALID_ATTEMPTS,
    BACKOFF_BASE_MS,
    BACKOFF_MAX_MS,
    CONTEXTS,
    makeId,
    normalizeComment,
    createReport,
    enqueue,
    dueItems,
    nextDueAt,
    classify,
    backoffMs,
    applyOutcome,
    toWireBody,
  };
});
