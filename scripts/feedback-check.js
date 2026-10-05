#!/usr/bin/env node
// Browser check for the thumbs-down question-feedback feature, driven with the
// `playwright` devDependency (see CLAUDE.md — no extra setup). Boots its own
// scripts/serve.js on a scratch port, so it doesn't collide with `npm run
// serve` or visual-check.
//
// Context A (service workers blocked, so page.route() sees every request):
//   serves the real app.js with FEEDBACK_DB_URL pointed at a stub origin, and
//   stubs that origin (including the CORS preflight). Scenarios: offline
//   enqueue -> flush on reconnect, survives reload, gameplay untouched,
//   keyboard isolation, Back button, results review, a rejected item not
//   blocking the queue, dedup.
// Context B (real service worker): offline launch still has feedback-queue.js
//   and can queue a report.
//
// Usage: node scripts/feedback-check.js [--headed]
//        npm run feedback-check
// Screenshots land in dev-screenshots/feedback/ (gitignored). Any assertion
// failure, page console error/warning, or uncaught exception exits non-zero.

const { chromium } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

const ROOT = path.join(__dirname, "..");
const PORT = 8098;
const BASE = `http://localhost:${PORT}/`;
const STUB_ORIGIN = "https://stub-db.example";
const OUT_DIR = path.join(ROOT, "dev-screenshots", "feedback");
const headed = process.argv.includes("--headed");

// Hard-coded copy of the key set firebase/database.rules.json requires.
const RULES_KEYS = [
  "v", "id", "questionId", "category", "question", "options", "answer",
  "selected", "comment", "context", "deviceId", "appBuild", "clientCreatedAt", "receivedAt",
].sort();

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const f of fs.readdirSync(OUT_DIR)) if (f.endsWith(".png")) fs.unlinkSync(path.join(OUT_DIR, f));

let shotCount = 0;
async function shot(page, name, opts = {}) {
  shotCount += 1;
  await page.waitForTimeout(400); // let screen/sheet fade-ins finish before capturing
  const file = path.join(OUT_DIR, `${String(shotCount).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, ...opts });
  console.log("  screenshot:", path.relative(ROOT, file));
}

const failures = [];
function check(cond, label, detail) {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    console.log(`  FAIL ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
    failures.push(label);
  }
}

function waitForServer(port, timeoutMs = 8000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function attempt() {
      http
        .get(`http://localhost:${port}/`, (res) => {
          res.resume();
          resolve();
        })
        .on("error", () => {
          if (Date.now() - start > timeoutMs) reject(new Error("server did not start in time"));
          else setTimeout(attempt, 150);
        });
    })();
  });
}

// ---- stub backend -------------------------------------------------------

const stub = {
  mode: "ok", // "ok" -> 200, "fail" -> abort, "reject" -> 401
  perId: {}, // reportId -> mode override
  offline: false, // mirrors context.setOffline; the handler aborts when set
  requests: [], // recorded non-OPTIONS requests: { method, url, id, body }
};

const CORS = { "Access-Control-Allow-Origin": "*" };

async function stubHandler(route) {
  const req = route.request();
  if (req.method() === "OPTIONS") {
    // A cross-origin PUT with Content-Type: application/json always preflights.
    await route.fulfill({
      status: 204,
      headers: { ...CORS, "Access-Control-Allow-Methods": "PUT", "Access-Control-Allow-Headers": "Content-Type" },
    });
    return;
  }
  const m = req.url().match(/\/feedback\/([^/.]+)\.json/);
  const id = m ? decodeURIComponent(m[1]) : null;
  const mode = (id && stub.perId[id]) || stub.mode;
  if (stub.offline || mode === "fail") {
    await route.abort();
    return;
  }
  let body = null;
  try {
    body = JSON.parse(req.postData() || "null");
  } catch (e) {
    body = "<unparseable>";
  }
  stub.requests.push({ method: req.method(), url: req.url(), id, body });
  if (mode === "reject") {
    await route.fulfill({ status: 401, headers: { ...CORS, "Content-Type": "application/json" }, body: '{"error":"Permission denied"}' });
  } else {
    await route.fulfill({ status: 200, headers: { ...CORS, "Content-Type": "application/json" }, body: "{}" });
  }
}

async function newStubbedContext(browser) {
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 375, height: 667 } });
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const patched = appJs.replace('const FEEDBACK_DB_URL = "";', `const FEEDBACK_DB_URL = "${STUB_ORIGIN}";`);
  if (patched === appJs) throw new Error("could not patch FEEDBACK_DB_URL in app.js");
  await context.route((url) => url.pathname === "/app.js" && url.origin === `http://localhost:${PORT}`, (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: patched })
  );
  await context.route(`${STUB_ORIGIN}/**`, stubHandler);
  // Deterministic prefs on first load only (a reload must not reset them).
  await context.addInitScript(() => {
    try {
      if (!localStorage.getItem("offline-trivia:prefs")) {
        localStorage.setItem("offline-trivia:prefs", JSON.stringify({ sound: false, autoAdvance: false, theme: "dark" }));
      }
    } catch (e) {}
  });
  return context;
}

// ---- page helpers -------------------------------------------------------

const readQueue = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("offline-trivia:feedback-queue") || "[]"));
const readFailed = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("offline-trivia:feedback-failed") || "[]"));

async function startRound(page) {
  await page.goto(BASE);
  await page.waitForSelector("#category-list .category-card:not([disabled])");
  await page.locator("#category-list .category-card:not([disabled])").first().click();
  await page.click("#play-selected-btn");
  await page.waitForSelector("#start-round-btn");
  await page.click("#start-round-btn");
  await page.waitForSelector("#options-list .option-btn");
  await page.waitForTimeout(400);
}

async function answer(page, index) {
  await page.locator("#options-list .option-btn").nth(index).click();
}

async function nextQuestion(page) {
  await page.click("#next-btn");
  await page.waitForFunction(() => {
    const results = document.getElementById("screen-results");
    if (results && !results.classList.contains("hidden")) return true;
    const opts = document.querySelectorAll("#options-list .option-btn");
    return opts.length > 0 && [...opts].every((b) => !b.disabled);
  }, null, { timeout: 6000 });
}

// Waits for any in-flight flush to finish, so a trigger fired right after
// isn't swallowed by the single-flight guard (a test race, not an app bug).
const flushIdle = (page) => page.waitForFunction(() => !feedbackFlushInFlight, null, { timeout: 5000 });

async function sheetOpen(page) {
  return page.evaluate(() => !document.getElementById("feedback-sheet-overlay").classList.contains("hidden"));
}

// Opens the sheet from `buttonLocator`, optionally types a comment, submits.
async function reportVia(page, buttonLocator, comment) {
  await buttonLocator.click();
  await page.waitForSelector("#feedback-sheet-overlay:not(.hidden)");
  if (comment) await page.fill("#feedback-comment", comment);
  await page.click("#feedback-submit");
  await page.waitForSelector("#feedback-sheet-overlay.hidden", { state: "attached" });
}

async function main() {
  const server = spawn(process.execPath, [path.join(ROOT, "scripts", "serve.js"), String(PORT)], { cwd: ROOT });
  server.stderr.on("data", (d) => process.stderr.write(String(d)));
  await waitForServer(PORT);

  const browser = await chromium.launch({ headless: !headed });
  const issues = [];
  const watch = (page) => {
    page.on("console", (msg) => {
      if (msg.type() !== "error" && msg.type() !== "warning") return;
      // Aborted/rejected stub requests are expected to log "Failed to load resource".
      if ((msg.location().url || "").includes("stub-db.example")) return;
      if (msg.text().includes("Service Worker registration blocked")) return; // context A blocks SWs on purpose
      issues.push(`[console.${msg.type()}] ${msg.text()}`);
    });
    page.on("pageerror", (err) => issues.push(`[pageerror] ${err.message}`));
  };

  try {
    // =====================================================================
    // Context A: stubbed backend, service workers blocked
    // =====================================================================
    console.log("\n== Context A: stubbed backend ==");
    const context = await newStubbedContext(browser);
    const page = await context.newPage();
    watch(page);

    await startRound(page);
    check(await page.evaluate(() => typeof window.FeedbackQueue === "object"), "FeedbackQueue global is loaded");

    // The round's first question, kept for the dedup scenario at the end.
    const q1 = await page.evaluate(() => JSON.parse(JSON.stringify(state.roundQuestions[0])));

    // ---- 1. offline enqueue -> flush on reconnect --------------------------
    console.log("\n[1] Offline enqueue, flush on reconnect");
    await page.evaluate(() => { state.streak = 3; updateStreakBadge(false); });
    await shot(page, "quiz-with-report-btn-and-streak-badge");
    await page.evaluate(() => { state.streak = 0; updateStreakBadge(false); });

    await context.setOffline(true);
    stub.offline = true;
    await reportVia(page, page.locator("#report-btn"), "Stem is ambiguous");
    await page.waitForTimeout(300);
    let queue = await readQueue(page);
    check(queue.length === 1, "queue has 1 item after offline report", queue.length);
    check(stub.requests.length === 0, "no stub requests while offline", stub.requests.length);
    check(
      await page.evaluate(() => {
        const b = document.getElementById("report-btn");
        return b.classList.contains("reported") && b.disabled;
      }),
      "report button shows the reported state"
    );
    await shot(page, "quiz-reported-state");

    await context.setOffline(false);
    stub.offline = false;
    let sentByEvent = false;
    for (let i = 0; i < 15 && !stub.requests.length; i++) await page.waitForTimeout(100);
    if (!stub.requests.length) {
      console.log("  note: Chromium did not fire `online` on setOffline(false); dispatching it manually");
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
    } else {
      sentByEvent = true;
    }
    for (let i = 0; i < 30 && !stub.requests.length; i++) await page.waitForTimeout(100);
    await page.waitForTimeout(300);
    console.log(`  info: online event fired by Chromium: ${sentByEvent}`);
    check(stub.requests.length === 1, "exactly one PUT after reconnect", stub.requests.length);
    const put1 = stub.requests[0] || {};
    check(put1.method === "PUT" && /\/feedback\/[A-Za-z0-9_-]{22}\.json$/.test(put1.url || ""), "PUT goes to /feedback/<id>.json", put1.url);
    check(put1.body && put1.body.context === "quiz-before-answer", "context is quiz-before-answer", put1.body && put1.body.context);
    check(put1.body && put1.body.selected === "", "selected is empty before answering", put1.body && put1.body.selected);
    check(put1.body && put1.body.comment === "Stem is ambiguous", "comment is sent", put1.body && put1.body.comment);
    check(put1.body && JSON.stringify(Object.keys(put1.body).sort()) === JSON.stringify(RULES_KEYS), "wire body key set matches the rules", put1.body && Object.keys(put1.body));
    check(put1.body && JSON.stringify(put1.body.receivedAt) === '{".sv":"timestamp"}', "receivedAt is the server timestamp", put1.body && put1.body.receivedAt);
    check(put1.body && put1.body.id === put1.id, "body id equals the URL id");
    check(put1.body && put1.body.questionId === q1.id, "report is for Q1", put1.body && put1.body.questionId);
    queue = await readQueue(page);
    check(queue.length === 0, "queue is empty after the upload", queue.length);

    // ---- 2. survives reload -------------------------------------------------
    console.log("\n[2] Survives reload");
    await answer(page, 0);
    await nextQuestion(page);
    stub.mode = "fail";
    stub.requests.length = 0;
    await answer(page, 1);
    const q2Selected = await page.evaluate(() => state.answers[state.answers.length - 1].selected);
    const q2Id = await page.evaluate(() => state.answers[state.answers.length - 1].id);
    await reportVia(page, page.locator("#report-btn"), "");
    await page.waitForTimeout(300);
    queue = await readQueue(page);
    check(queue.length === 1, "queue has the Q2 report while the backend is failing", queue.length);
    await page.reload();
    await page.waitForSelector("#confirm-sheet-overlay:not(.hidden)");
    await page.click("#confirm-sheet-confirm"); // Resume
    await page.waitForSelector("#options-list .option-btn");
    queue = await readQueue(page);
    check(queue.length === 1, "queue survived the reload", queue.length);
    check(queue[0] && queue[0].report.questionId === q2Id, "surviving item is the Q2 report");
    await flushIdle(page); // the reload's startup flush ran in "fail" mode
    stub.mode = "ok";
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    for (let i = 0; i < 30 && !stub.requests.length; i++) await page.waitForTimeout(100);
    await page.waitForTimeout(300);
    check(stub.requests.length === 1, "PUT arrives after the visibilitychange trigger", stub.requests.length);
    const put2 = stub.requests[0] || {};
    check(put2.body && put2.body.selected === q2Selected, "selected equals the chosen option", put2.body && put2.body.selected);
    check(put2.body && put2.body.context === "quiz-after-answer", "context is quiz-after-answer", put2.body && put2.body.context);
    check(put2.body && put2.body.comment === "", "empty comment is allowed");
    queue = await readQueue(page);
    check(queue.length === 0, "queue is empty after the second upload", queue.length);

    // ---- 3. gameplay untouched ---------------------------------------------
    console.log("\n[3] Gameplay untouched by reporting");
    const before3 = await page.evaluate(() => ({
      index: state.currentIndex, score: state.score, streak: state.streak, answers: state.answers.length, lives: state.lives,
    }));
    await page.evaluate(() => { prefs.autoAdvance = true; });
    await page.evaluate(() => {
      const q = state.roundQuestions[state.currentIndex];
      [...document.querySelectorAll("#options-list .option-btn")].find((b) => b.dataset.option === q.answer).click();
    });
    await page.click("#report-btn"); // well inside the 1200ms auto-advance window
    await page.waitForSelector("#feedback-sheet-overlay:not(.hidden)");
    await page.waitForTimeout(2000);
    const during3 = await page.evaluate(() => ({ index: state.currentIndex, open: !document.getElementById("feedback-sheet-overlay").classList.contains("hidden") }));
    check(during3.index === before3.index, "auto-advance did not fire behind the open sheet", during3);
    check(during3.open, "sheet is still open");
    await page.click("#feedback-cancel");
    await page.waitForTimeout(1600);
    const after3 = await page.evaluate(() => ({
      index: state.currentIndex, score: state.score, streak: state.streak, answers: state.answers.length, lives: state.lives,
    }));
    check(after3.index === before3.index, "auto-advance stayed off after cancelling", after3.index);
    check(after3.score === before3.score + 1 && after3.streak === before3.streak + 1, "score/streak match a no-report baseline", { before3, after3 });
    check(after3.answers === before3.answers + 1 && after3.lives === before3.lives, "answers/lives as expected");
    await page.evaluate(() => { prefs.autoAdvance = false; });
    await nextQuestion(page);

    // ---- 4. keyboard isolation ---------------------------------------------
    console.log("\n[4] Keyboard isolation");
    const answers4 = await page.evaluate(() => state.answers.length);
    await page.click("#report-btn");
    await page.waitForSelector("#feedback-sheet-overlay:not(.hidden)");
    await page.keyboard.type("abcd 1234");
    await page.keyboard.press("Enter");
    const kb = await page.evaluate(() => ({
      answers: state.answers.length,
      nextHidden: document.getElementById("next-btn").classList.contains("layout-hidden"),
      text: document.getElementById("feedback-comment").value,
      counter: document.getElementById("feedback-counter").textContent,
    }));
    check(kb.answers === answers4, "no option was selected by typing", kb);
    check(kb.nextHidden, "Next did not fire");
    check(kb.text.startsWith("abcd 1234"), "the textarea contains the typed text", kb.text);
    check(kb.counter === `${kb.text.length}/500`, "counter tracks the text length", kb.counter);
    await shot(page, "sheet-dark");
    await page.evaluate(() => { prefs.theme = "light"; applyTheme(); });
    await shot(page, "sheet-light");
    await page.evaluate(() => { prefs.theme = "dark"; applyTheme(); });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    const esc = await page.evaluate(() => ({
      open: !document.getElementById("feedback-sheet-overlay").classList.contains("hidden"),
      focus: document.activeElement && document.activeElement.id,
      inert: document.getElementById("app").inert,
    }));
    check(!esc.open, "Escape closes the sheet", esc);
    check(esc.focus === "report-btn", "focus returns to the report button", esc.focus);
    check(esc.inert === false, "app is no longer inert");

    // ---- 5. Back button ----------------------------------------------------
    console.log("\n[5] Back button");
    await page.click("#report-btn");
    await page.waitForSelector("#feedback-sheet-overlay:not(.hidden)");
    await page.goBack();
    await page.waitForTimeout(500);
    const back = await page.evaluate(() => ({
      sheetOpen: !document.getElementById("feedback-sheet-overlay").classList.contains("hidden"),
      quizVisible: !document.getElementById("screen-quiz").classList.contains("hidden"),
      confirmOpen: !document.getElementById("confirm-sheet-overlay").classList.contains("hidden"),
      depth: history.state && history.state.depth,
    }));
    check(!back.sheetOpen, "Back closes the feedback sheet", back);
    check(back.quizVisible, "quiz screen is still showing");
    check(!back.confirmOpen, "the quit confirm did not open");
    check(back.depth === 1, "history is back on the depth-1 entry", back.depth);

    // ---- 6. results review -------------------------------------------------
    console.log("\n[6] Results review");
    await answer(page, 0);
    for (let guard = 0; guard < 20; guard++) {
      const onResults = await page.evaluate(() => !document.getElementById("screen-results").classList.contains("hidden"));
      if (onResults) break;
      await nextQuestion(page);
      const stillQuiz = await page.evaluate(() => document.getElementById("screen-results").classList.contains("hidden"));
      if (stillQuiz) await answer(page, 0);
    }
    await page.waitForSelector("#screen-results:not(.hidden)");
    await page.waitForTimeout(500);
    const review = await page.evaluate(() =>
      [...document.querySelectorAll("#results-review .review-item")].map((item) => {
        const b = item.querySelector(".report-btn");
        return b ? { reported: b.classList.contains("reported"), disabled: b.disabled } : null;
      })
    );
    check(review.length === 10, "10 review items", review.length);
    check(review.every(Boolean), "every review item has a 👎");
    check(review[0] && review[0].reported && review[1] && review[1].reported, "Q1 and Q2 show the reported state");
    check(review.slice(2).every((r) => r && !r.reported && !r.disabled), "Q3-Q10 are reportable");
    await page.locator("#results-review").scrollIntoViewIfNeeded();
    await shot(page, "results-review-buttons");

    stub.requests.length = 0;
    await reportVia(page, page.locator("#results-review .review-item").nth(4).locator(".report-btn"), "From the results screen");
    for (let i = 0; i < 30 && !stub.requests.length; i++) await page.waitForTimeout(100);
    check(stub.requests.length === 1, "one PUT for the results-screen report", stub.requests.length);
    check(stub.requests[0] && stub.requests[0].body.context === "results", "context is results", stub.requests[0] && stub.requests[0].body.context);
    check(
      stub.requests[0] && stub.requests[0].body.selected !== "" && stub.requests[0].body.options.length === 4,
      "results report carries selected and 4 options"
    );
    check(
      await page.evaluate(() => document.activeElement && document.activeElement.classList.contains("review-question")),
      "focus lands on the review question after reporting"
    );

    // ---- 7. a rejected item neither blocks the queue nor gets dropped -----
    console.log("\n[7] Rejected item doesn't block the queue");
    stub.mode = "fail";
    await reportVia(page, page.locator("#results-review .review-item").nth(6).locator(".report-btn"), "first");
    await reportVia(page, page.locator("#results-review .review-item").nth(7).locator(".report-btn"), "second");
    queue = await readQueue(page);
    check(queue.length === 2, "two reports queued", queue.length);
    const [firstId, secondId] = queue.map((it) => it.report.id);
    await flushIdle(page);
    stub.perId[firstId] = "reject";
    stub.mode = "ok";
    stub.requests.length = 0;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    for (let i = 0; i < 40 && stub.requests.length < 2; i++) await page.waitForTimeout(100);
    await page.waitForTimeout(300);
    check(stub.requests.some((r) => r.id === secondId), "the second report was sent", stub.requests.map((r) => r.id));
    check(stub.requests.some((r) => r.id === firstId), "the first report was attempted (and got a 401)");
    queue = await readQueue(page);
    check(queue.length === 1 && queue[0].report.id === firstId, "the rejected report is still queued", queue.map((it) => it.report.id));
    check(queue[0] && queue[0].attempts === 1, "attempts is 1", queue[0] && queue[0].attempts);
    check(queue[0] && queue[0].nextAttemptAt > Date.now(), "nextAttemptAt is in the future");
    check(queue[0] && queue[0].lastError === "401", "lastError records the status", queue[0] && queue[0].lastError);
    const failed = await readFailed(page);
    check(failed.length === 0, "nothing was moved to the failed log", failed.length);

    // ---- footer pending line -----------------------------------------------
    await page.click("#choose-category-btn");
    await page.waitForSelector("#screen-categories:not(.hidden)");
    const pendingText = await page.evaluate(() => {
      const p = document.getElementById("feedback-pending");
      return p.classList.contains("hidden") ? null : p.textContent;
    });
    check(pendingText === "1 report waiting to upload", "footer shows the pending line", pendingText);
    await page.locator("#feedback-pending").scrollIntoViewIfNeeded();
    await shot(page, "footer-pending-line");

    // ---- 8. dedup ------------------------------------------------------------
    console.log("\n[8] Dedup");
    // The picker remembers its selection, so don't toggle the card back off.
    if (!(await page.locator("#category-list .category-card.selected").count())) {
      await page.locator("#category-list .category-card:not([disabled])").first().click();
    }
    await page.click("#play-selected-btn");
    await page.waitForSelector("#start-round-btn");
    await page.click("#start-round-btn");
    await page.waitForSelector("#options-list .option-btn");
    const origQ = await page.evaluate(() => JSON.parse(JSON.stringify(state.roundQuestions[0])));
    await page.evaluate((q) => { state.roundQuestions[0] = q; renderQuestion(); }, q1);
    const dedup = await page.evaluate(() => {
      const b = document.getElementById("report-btn");
      return { reported: b.classList.contains("reported"), disabled: b.disabled, pressed: b.getAttribute("aria-pressed") };
    });
    check(dedup.reported && dedup.disabled && dedup.pressed === "true", "an already-reported question shows reported + disabled", dedup);
    await page.evaluate((q) => { state.roundQuestions[0] = q; renderQuestion(); }, origQ);
    const reset = await page.evaluate(() => {
      const b = document.getElementById("report-btn");
      return { reported: b.classList.contains("reported"), disabled: b.disabled, pressed: b.getAttribute("aria-pressed") };
    });
    check(!reset.reported && !reset.disabled && reset.pressed === "false", "the button resets for a different question", reset);

    // Reset Stats must not touch feedback keys.
    await page.evaluate(() => {
      localStorage.setItem("offline-trivia:feedback-reported", JSON.stringify(["x-001"]));
    });
    const keysBefore = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes("feedback")).sort());
    await page.evaluate(() => { saveStats(defaultStats()); });
    const keysAfter = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes("feedback")).sort());
    check(JSON.stringify(keysBefore) === JSON.stringify(keysAfter) && keysAfter.length >= 3, "stats reset leaves feedback keys alone", keysAfter);

    await context.close();

    // =====================================================================
    // Context B: real service worker, offline launch
    // =====================================================================
    console.log("\n== Context B: service worker, offline launch ==");
    const ctxB = await browser.newContext({ viewport: { width: 375, height: 667 } });
    await ctxB.addInitScript(() => {
      try {
        if (!localStorage.getItem("offline-trivia:prefs")) {
          localStorage.setItem("offline-trivia:prefs", JSON.stringify({ sound: false, autoAdvance: false, theme: "dark" }));
        }
      } catch (e) {}
    });
    const pageB = await ctxB.newPage();
    watch(pageB);
    await pageB.goto(BASE);
    await pageB.evaluate(() => navigator.serviceWorker.ready);
    // Wait for the precache to finish so the offline launch has every file.
    await pageB.waitForFunction(
      async () => {
        const keys = await caches.keys();
        for (const k of keys) {
          const c = await caches.open(k);
          if ((await c.keys()).length > 20 && (await c.match("feedback-queue.js"))) return true;
        }
        return false;
      },
      null,
      { timeout: 20000, polling: 300 }
    );
    await pageB.reload();
    await pageB.waitForSelector("#category-list .category-card");
    await ctxB.setOffline(true);
    await pageB.reload();
    await pageB.waitForSelector("#category-list .category-card:not([disabled])");
    check(await pageB.evaluate(() => typeof window.FeedbackQueue === "object"), "feedback-queue.js was precached (offline launch)");
    await pageB.locator("#category-list .category-card:not([disabled])").first().click();
    await pageB.click("#play-selected-btn");
    await pageB.waitForSelector("#start-round-btn");
    await pageB.click("#start-round-btn");
    await pageB.waitForSelector("#options-list .option-btn");
    await reportVia(pageB, pageB.locator("#report-btn"), "reported on a plane");
    const queueB = await readQueue(pageB);
    check(queueB.length === 1 && queueB[0].report.comment === "reported on a plane", "report queued while offline with the service worker", queueB.length);
    await ctxB.close();
  } catch (e) {
    failures.push(`script error: ${e.message}`);
    console.error(e);
  } finally {
    await browser.close();
    server.kill();
  }

  console.log("");
  if (issues.length) {
    console.log("Page issues:");
    for (const i of issues) console.log("  " + i);
  }
  if (failures.length || issues.length) {
    console.log(`\nFAILED: ${failures.length} check(s), ${issues.length} page issue(s)`);
    process.exit(1);
  }
  console.log("All feedback checks passed.");
}

main();
