#!/usr/bin/env node
// Drives a real (headless by default) Chromium through the app's core
// screens and interactions, using the `playwright` devDependency that's
// already installed in node_modules — no extra setup needed. Boots its own
// copy of scripts/serve.js on a scratch port so it doesn't collide with a
// `npm run serve` you might already have running.
//
// This exists so UI/CSS/JS changes get an actual browser check instead of a
// claim of "can't test this" — see CLAUDE.md for why that claim was wrong.
//
// Usage:
//   node scripts/visual-check.js [--headed] [--out <dir>]
//   npm run visual-check -- --headed
//
// Walks: categories screen -> prefs toggle -> settings screen -> a full
// 10-question round (answering every question correctly, so the streak
// badge, milestone flash, auto-advance, and 50/50 lifeline all get
// exercised) -> results screen (confetti fires on this browser's first-ever
// "game") -> back to categories with stats now showing -> the reset-stats
// confirm sheet, confirmed. Screenshots land in --out (default
// dev-screenshots/, gitignored); any page console error/warning or
// uncaught exception is printed and makes the script exit non-zero.

const { chromium } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

const ROOT = path.join(__dirname, "..");
const PORT = 8099; // distinct from npm run serve's default 8080
const args = process.argv.slice(2);
const headed = args.includes("--headed");
const outIdx = args.indexOf("--out");
const OUT_DIR = outIdx !== -1 && args[outIdx + 1] ? path.resolve(args[outIdx + 1]) : path.join(ROOT, "dev-screenshots");

fs.mkdirSync(OUT_DIR, { recursive: true });
let shotCount = 0;
async function shot(page, name) {
  shotCount += 1;
  const file = path.join(OUT_DIR, `${String(shotCount).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file });
  const scrollY = await page.evaluate(() => window.scrollY);
  console.log("  screenshot:", path.relative(ROOT, file), `(scrollY=${scrollY})`);
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

// Waits until either the results screen is showing, or a fresh (all
// buttons enabled) question has rendered — i.e. until it's safe to act on
// #screen-quiz or #screen-results again after an answer/auto-advance.
async function waitForNextQuestionOrResults(page) {
  await page.waitForFunction(
    () => {
      const results = document.getElementById("screen-results");
      if (results && !results.classList.contains("hidden")) return true;
      const opts = document.querySelectorAll("#options-list .option-btn");
      return opts.length > 0 && [...opts].every((b) => !b.disabled);
    },
    { timeout: 6000 }
  );
}

async function main() {
  const server = spawn(process.execPath, [path.join(ROOT, "scripts", "serve.js"), String(PORT)], { cwd: ROOT });
  server.stderr.on("data", (d) => process.stderr.write(String(d)));
  await waitForServer(PORT);

  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } }); // iPhone-ish

  const issues = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") issues.push(`[console.${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => issues.push(`[pageerror] ${err.message}`));

  try {
    console.log("Loading app...");
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForSelector("#category-list .category-card");
    await shot(page, "categories");

    // Sound/auto-advance prefs toggle (footer)
    await page.click("#sound-toggle-btn");
    await shot(page, "sound-toggled-off");
    await page.click("#sound-toggle-btn"); // back on

    // Select two playable categories, open settings
    const cardCount = await page.locator("#category-list .category-card:not([disabled])").count();
    for (let i = 0; i < Math.min(2, cardCount); i++) {
      await page.locator("#category-list .category-card:not([disabled])").nth(i).click();
    }
    await page.click("#play-selected-btn");
    await page.waitForSelector("#screen-settings:not(.hidden)");
    await page.waitForTimeout(350); // let the .screen-in fade/slide finish before capturing
    await shot(page, "settings");

    await page.click("#start-round-btn");
    await page.waitForSelector("#screen-quiz:not(.hidden)");
    await page.waitForTimeout(350);
    await shot(page, "quiz-question-1");

    // Exercise the 50/50 lifeline on the first question, if it's visible
    if (await page.locator("#lifeline-btn:not(.hidden)").count()) {
      await page.click("#lifeline-btn");
      await shot(page, "quiz-lifeline-used");
    }

    // Answer every question correctly (reads the correct answer straight
    // off the page's own `state`, same realm as app.js's top-level const)
    // to walk a full perfect round: streak tiers, milestone flash,
    // auto-advance, and the confetti-on-perfect-score trigger.
    let qNum = 1;
    while (true) {
      const resultsShown = await page
        .locator("#screen-results:not(.hidden)")
        .count()
        .then((n) => n > 0);
      if (resultsShown) break;
      if (qNum > 40) throw new Error("round didn't finish after 40 questions — auto-advance likely stuck");

      const answer = await page.evaluate(() => state.roundQuestions[state.currentIndex].answer);
      await page.evaluate((ans) => {
        const btn = [...document.querySelectorAll("#options-list .option-btn")].find((b) => b.dataset.option === ans);
        btn.click();
      }, answer);

      const streak = await page.evaluate(() => state.streak);
      if (streak === 5 || streak === 10) {
        await page.waitForTimeout(150); // let the pop/flash animation classes apply
        await shot(page, `quiz-streak-${streak}`);
      }

      await waitForNextQuestionOrResults(page);
      qNum += 1;
    }

    await page.waitForTimeout(400); // let confetti actually draw a few frames
    await shot(page, "results-confetti");

    await page.click("#choose-category-btn");
    await page.waitForSelector("#screen-categories:not(.hidden)");
    await page.waitForSelector("#stats-summary:not(.hidden)");
    await page.waitForTimeout(350); // let the .screen-in fade/slide finish before capturing
    await shot(page, "categories-with-stats");

    await page.click("#reset-stats-btn");
    await page.waitForSelector("#confirm-sheet-overlay:not(.hidden)");
    await page.waitForTimeout(300); // let the sheet's slide-up animation finish
    await shot(page, "reset-confirm-sheet");
    await page.click("#confirm-sheet-confirm");
    await page.waitForSelector("#stats-summary.hidden", { state: "attached" });
    await shot(page, "categories-stats-reset");
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`\n${shotCount} screenshots written to ${path.relative(ROOT, OUT_DIR)}/`);
  if (issues.length) {
    console.log("\nConsole/page issues detected:");
    for (const line of issues) console.log(" ", line);
    process.exitCode = 1;
  } else {
    console.log("No console errors or warnings.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
