#!/usr/bin/env node
// Failure/recovery and multi-tab browser regressions. No live backend writes.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createServer } = require("./serve.js");

async function main() {
  let failAsset = null;
  let updateBuild = false;
  const server = createServer();
  const serve = server.listeners("request")[0];
  server.removeAllListeners("request");
  server.on("request", (req, res) => {
    if (req.url === failAsset) { res.writeHead(503); res.end("Simulated interruption"); return; }
    if (req.url === "/sw.js" && updateBuild) {
      res.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" });
      res.end(fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8").replace(/const CACHE_VERSION = ".*?";/, 'const CACHE_VERSION = "reliability-update";'));
      return;
    }
    serve(req, res);
  });
  await new Promise(resolve => server.listen(0, "localhost", resolve));
  const base = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const errors = [];
  const watch = page => page.on("pageerror", error => errors.push(error.message));
  let backendMode = "offline";
  const uploads = [];

  async function context(fallback = false) {
    const ctx = await browser.newContext({ serviceWorkers: "block", acceptDownloads: true });
    await ctx.addInitScript(({ fallback }) => {
      if (fallback) Object.defineProperty(navigator, "locks", { value: undefined });
      if (!localStorage.getItem("offline-trivia:prefs")) localStorage.setItem("offline-trivia:prefs", JSON.stringify({ sound: false, autoAdvance: false, theme: "dark" }));
    }, { fallback });
    await ctx.route("https://offline-trivia-feedback-default-rtdb.firebaseio.com/**", async route => {
      if (backendMode === "offline") return route.abort();
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "PUT", "Access-Control-Allow-Headers": "Content-Type" } });
      uploads.push(route.request().url());
      await route.fulfill({ status: backendMode === "invalid" ? 400 : 200, headers: { "Access-Control-Allow-Origin": "*" }, body: "{}" });
    });
    return ctx;
  }
  async function open(ctx) {
    const page = await ctx.newPage(); watch(page);
    await page.goto(base);
    await page.waitForSelector(".category-card");
    return page;
  }
  async function start(page) {
    await page.evaluate(async () => {
      const categories = [state.categories[0]];
      await ensureLoaded(categories);
      await startRound(categories, { count: 10, mode: "standard", difficulty: "any" });
    });
  }
  async function finish(page) {
    await page.evaluate(async () => {
      for (let n = 0; n < 10 && currentScreen === "quiz"; n++) {
        if (state.answers.length === state.currentIndex) await selectAnswer(state.roundQuestions[state.currentIndex].answer);
        await advanceToNext();
      }
    });
  }
  try {
    console.log("[1] Corrupt saves recover; malformed reports remain exportable");
    const corrupt = await context();
    await corrupt.addInitScript(() => {
      localStorage.setItem("offline-trivia:active-round", JSON.stringify({ roundQuestions: [{}] }));
      localStorage.setItem("offline-trivia:stats", JSON.stringify({ today: null, byCategory: null, totalCorrect: "oops" }));
      localStorage.setItem("offline-trivia:last-round", JSON.stringify({ categoryIds: [null, {}], settings: { count: -1 } }));
      localStorage.setItem("offline-trivia:feedback-queue", "{broken JSON");
    });
    const bad = await open(corrupt);
    assert.match(await bad.locator("#storage-status").textContent(), /restored|read|recovery/);
    assert.match(await bad.locator("#feedback-pending").textContent(), /need attention/);
    const downloadEvent = bad.waitForEvent("download");
    await bad.click("#feedback-export-btn");
    const download = await downloadEvent;
    const exported = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
    assert.equal(exported.raw["offline-trivia:feedback-queue"], "{broken JSON");
    await corrupt.close();

    for (const fallback of [false, true]) {
      console.log(`[2] Concurrent reports, rounds and results (${fallback ? "IndexedDB fallback" : "Web Locks"})`);
      backendMode = "offline";
      const ctx = await context(fallback);
      const a = await open(ctx), b = await open(ctx);
      await Promise.all([start(a), start(b)]);
      const ids = await Promise.all([a.evaluate(() => state.roundId), b.evaluate(() => state.roundId)]);
      assert.notEqual(ids[0], ids[1]);
      assert.equal(await a.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("offline-trivia:round:")).length), 2);
      const enqueueReport = (page, suffix) => page.evaluate(async suffix => {
        const question = { ...state.roundQuestions[0], id: `friends-${suffix}` };
        return submitFeedback({ question, selected: null, comment: "Concurrent", context: "quiz-before-answer" });
      }, suffix);
      assert.ok((await Promise.all([enqueueReport(a, "90001"), enqueueReport(b, "90002")])).every(r => r.ok));
      await a.waitForFunction(() => !feedbackFlushInFlight && loadFeedbackQueue().every(item => !item.sendingUntil));
      await b.waitForFunction(() => !feedbackFlushInFlight);
      assert.equal(await a.evaluate(() => loadFeedbackQueue().length), 2);
      backendMode = "ok"; uploads.length = 0;
      await Promise.all([a.evaluate(() => flushFeedback()), b.evaluate(() => flushFeedback())]);
      assert.equal(await a.evaluate(() => loadFeedbackQueue().length), 0);
      assert.equal(uploads.length, 2);
      assert.equal(new Set(uploads).size, 2);
      await a.evaluate(async () => {
        const answer = state.roundQuestions[0].answer;
        await Promise.all([selectAnswer(answer), selectAnswer(answer)]);
        await Promise.all([advanceToNext(), advanceToNext()]);
      });
      assert.deepEqual(await a.evaluate(() => [state.answers.length, state.currentIndex, state.score]), [1, 1, 1]);
      await Promise.all([finish(a), finish(b)]);
      await Promise.all([a.evaluate(() => Promise.all([showResults(), showResults()])), b.evaluate(() => showResults())]);
      assert.deepEqual(await a.evaluate(() => [loadStats().gamesPlayed, loadStats().totalQuestions, loadStats().totalCorrect]), [2, 20, 20]);
      assert.equal(await a.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("offline-trivia:round:")).length), 0);
      await a.evaluate(() => localStorage.removeItem("offline-trivia:stats"));
      await a.reload();
      await a.waitForSelector(".category-card");
      assert.equal(await a.evaluate(() => loadStats().gamesPlayed), 2, "committed stats restore a missing localStorage mirror");
      await ctx.close();
    }

    console.log("[3] Full queues and failed reports preserve every report");
    backendMode = "offline";
    const fullCtx = await context(); const full = await open(fullCtx); await start(full);
    const fullResult = await full.evaluate(async () => {
      const q = state.roundQuestions[0];
      const queue = Array.from({ length: 200 }, (_, i) => ({ report: createReport({ id: newReportId(), question: { ...q, id: `friends-${91000 + i}` }, selected: "", comment: "Saved", context: "results", deviceId: getDeviceId(), appBuild: 1, now: Date.now() }), attempts: 0, nextAttemptAt: 0, lastError: "" }));
      await withStorageLock("feedback", () => saveFeedbackQueue(queue));
      const first = queue[0].report.id;
      const result = await submitFeedback({ question: { ...q, id: "friends-99999" }, selected: null, comment: "New", context: "quiz-before-answer" });
      return { result, firstKept: loadFeedbackQueue()[0].report.id === first, count: loadFeedbackQueue().length };
    });
    assert.equal(fullResult.result.ok, false); assert.match(fullResult.result.message, /full/);
    assert.equal(fullResult.firstKept, true); assert.equal(fullResult.count, 200);
    await full.evaluate(() => withStorageLock("feedback", () => {
      const queue = loadFeedbackQueue().slice(0, 1);
      queue[0].failed = true;
      queue[0].attempts = 3;
      queue[0].sendingUntil = 0;
      saveFeedbackQueue(queue);
      showScreen("categories");
    }));
    backendMode = "ok";
    await full.click("#feedback-retry-btn");
    await full.waitForFunction(() => loadFeedbackQueue().length === 0);
    await fullCtx.close();

    console.log("[4] A stale tab cannot overwrite a resumed round");
    const shared = await context(); const owner = await open(shared); await start(owner);
    const stale = await open(shared);
    await stale.click("#confirm-sheet-confirm");
    await stale.waitForSelector("#screen-quiz:not(.hidden)");
    await owner.evaluate(() => selectAnswer(state.roundQuestions[0].answer));
    await stale.evaluate(() => selectAnswer(state.roundQuestions[0].answer));
    assert.equal(await stale.evaluate(() => state.answers.length), 0);
    assert.match(await stale.locator("#storage-status").textContent(), /another tab/);
    await shared.close();

    console.log("[5] Failed result saves remain resumable and can be retried");
    const quotaCtx = await context(); const quota = await open(quotaCtx); await start(quota);
    await quotaCtx.addInitScript(() => {
      if (localStorage.getItem("audit:fail-stats")) {
        window.originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
          if (key === "offline-trivia:stats") throw new DOMException("Full", "QuotaExceededError");
          return window.originalSetItem.call(this, key, value);
        };
      }
    });
    await quota.evaluate(() => {
      window.originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === "offline-trivia:stats") throw new DOMException("Full", "QuotaExceededError");
        return window.originalSetItem.call(this, key, value);
      };
    });
    await finish(quota);
    assert.match(await quota.locator("#storage-status").textContent(), /save/);
    assert.equal(await quota.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("offline-trivia:round:")).length), 1);
    await quota.evaluate(() => localStorage.setItem("audit:fail-stats", "1"));
    await quota.reload();
    await quota.waitForSelector("#confirm-sheet-overlay:not(.hidden)");
    await quota.click("#confirm-sheet-confirm");
    await quota.waitForSelector("#screen-quiz:not(.hidden)");
    assert.equal(await quota.locator("#next-btn").textContent(), "Retry saving results");
    await quota.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; localStorage.removeItem("audit:fail-stats"); });
    await quota.click("#next-btn");
    await quota.waitForSelector("#screen-results:not(.hidden)");
    assert.equal(await quota.evaluate(() => loadStats().gamesPlayed), 1);
    await quotaCtx.close();

    console.log("[6] Offline install failure, retry, cache repair, and failed/successful updates");
    failAsset = "/data/questions/friends.json";
    const offlineCtx = await browser.newContext();
    const offline = await open(offlineCtx);
    await offline.waitForSelector("#offline-retry-btn:not(.hidden)");
    assert.match(await offline.locator("#offline-status").textContent(), /isn't complete/);
    failAsset = null;
    await offline.click("#offline-retry-btn");
    await offline.waitForFunction(() => document.getElementById("offline-status").textContent === "Ready to play offline");
    await offline.waitForFunction(() => !!navigator.serviceWorker.controller);
    await offlineCtx.setOffline(true);
    await offline.reload();
    await offline.waitForSelector(".category-card");
    await offline.waitForFunction(() => document.getElementById("offline-status").textContent === "Ready to play offline");
    await offlineCtx.setOffline(false);
    await offline.evaluate(async () => {
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        await cache.delete("data/questions/friends.json");
      }
      queryOfflineStatus(navigator.serviceWorker.controller);
    });
    await offline.waitForSelector("#offline-retry-btn:not(.hidden)");
    assert.match(await offline.locator("#offline-status").textContent(), /isn't complete/);
    await offline.click("#offline-retry-btn");
    await offline.waitForFunction(() => document.getElementById("offline-status").textContent === "Ready to play offline");
    updateBuild = true; failAsset = "/icons/icon-192.png";
    await offline.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await offline.waitForSelector("#offline-retry-btn:not(.hidden)");
    assert.match(await offline.locator("#offline-status").textContent(), /offline copy is ready/);
    failAsset = null;
    await offline.click("#offline-retry-btn");
    await offline.waitForSelector("#update-toast:not(.hidden)");
    await Promise.all([offline.waitForEvent("load"), offline.click("#update-reload-btn")]);
    await offline.waitForFunction(() => document.getElementById("offline-status").textContent === "Ready to play offline");
    assert.ok((await offline.evaluate(() => caches.keys())).includes("trivia-cache-reliability-update"));
    await offlineCtx.close();
    assert.deepEqual(errors, []);
    console.log("All reliability checks passed.");
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
