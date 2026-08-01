#!/usr/bin/env node
// Reports tracked subjects (from data/topics.json) that show up as a wrong
// answer somewhere but have never been the correct answer to any question —
// a cheap source of "genuinely fresh" angles when drafting a new batch,
// since the subject is clearly already in the corpus's orbit (someone used
// it as a distractor) but hasn't had its own question yet.
//
// Read-only, zero dependencies. Only reports on categories that have a
// topics.json entry — see README/CLAUDE.md for the caveat that these counts
// are a signal to spot-check with a real grep, not a verdict on their own.
//
// Usage: node scripts/find-gaps.js [category-id]

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const CATEGORIES_FILE = path.join(DATA_DIR, "categories.json");
const TOPICS_FILE = path.join(DATA_DIR, "topics.json");

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function reportForCategory(cat, questions, topicList) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${cat.name}  (${questions.length} questions)`);
  console.log("=".repeat(60));

  if (!topicList || !topicList.length) {
    console.log("(No topic list configured for this category in data/topics.json — skipping.)");
    return;
  }

  const patterns = topicList.map((t) =>
    t.aliases.map((a) => new RegExp(`\\b${escapeRegExp(a)}\\b`, "i"))
  );

  const asAnswer = topicList.map(() => 0);
  const asDistractor = topicList.map(() => 0);

  for (const q of questions) {
    if (!Array.isArray(q.options)) continue;
    const distractors = q.options.filter((o) => o !== q.answer).join(" | ");
    topicList.forEach((t, i) => {
      const re = patterns[i];
      if (typeof q.answer === "string" && re.some((r) => r.test(q.answer))) {
        asAnswer[i]++;
      } else if (re.some((r) => r.test(distractors))) {
        asDistractor[i]++;
      }
    });
  }

  const candidates = topicList
    .map((t, i) => ({ name: t.name, asAnswer: asAnswer[i], asDistractor: asDistractor[i] }))
    .filter((r) => r.asAnswer === 0 && r.asDistractor > 0)
    .sort((a, b) => b.asDistractor - a.asDistractor);

  if (candidates.length) {
    console.log("\nAppears only as a distractor, never the correct answer (candidate angles):");
    for (const c of candidates) {
      console.log(`  ${String(c.asDistractor).padStart(3)}x distractor  ${c.name}`);
    }
  } else {
    console.log("\nEvery tracked subject has been the correct answer at least once.");
  }
}

function main() {
  const categories = loadJson(CATEGORIES_FILE);
  const topicsByCategory = fs.existsSync(TOPICS_FILE) ? loadJson(TOPICS_FILE) : {};
  const filter = process.argv[2];

  for (const cat of categories) {
    if (filter && cat.id !== filter) continue;
    const filePath = path.join(DATA_DIR, cat.file);
    const questions = loadJson(filePath);
    reportForCategory(cat, questions, topicsByCategory[cat.id]);
  }
}

main();
