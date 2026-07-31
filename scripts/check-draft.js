#!/usr/bin/env node
// Pre-merge checker for a batch of drafted-but-not-yet-merged questions.
// Run this on a draft file BEFORE adding it to data/questions/*.json.
//
// Catches the two failure modes that shipped bad questions in past batches:
//   1. Schema/shape bugs (answer text not matching an option, wrong option
//      count, duplicate option text) — easy to introduce by hand, easy to
//      miss on read-through.
//   2. Duplicate content — scores every draft question against the ENTIRE
//      existing corpus using the same fuzzy-match function validate.js uses,
//      so "have we already asked this?" is a number, not a memory of having
//      grepped for a few keywords.
//   3. Hedge/meta options ("This isn't a real plot point", "not given a
//      specific name...") — these read as answers while drafting but are
//      unplayable as multiple-choice options. Flagged mechanically because
//      self-review missed them repeatedly in practice.
//
// Usage:
//   node scripts/check-draft.js <path-to-draft.js>
//
// The draft file must be a CommonJS module exporting an array of objects
// shaped like { difficulty, question, options, answer } — no id/category
// yet, those get assigned at merge time (see README "Adding a new batch").

const fs = require("fs");
const path = require("path");
const { wordSet, jaccard, NEAR_DUPLICATE_THRESHOLD } = require("./validate.js");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const CATEGORIES_FILE = path.join(DATA_DIR, "categories.json");
const LIKELY_DUPLICATE_THRESHOLD = 0.85;
const MAX_OPTION_LENGTH = 90;

// Options/questions matching these patterns read as hedges or meta-commentary
// rather than answers a player could actually pick — e.g. "This isn't a real
// plot point on the show" or "It is not given a specific name". Reject on sight.
const HEDGE_PATTERNS = [
  /\bnot (a|given|shown|part of|really|actually)\b/i,
  /\bisn'?t\b/i,
  /\bnever given\b/i,
  /\bactually,/i,
  /\bthe show (frames|doesn'?t|never)/i,
  /\bnot (a )?real (plot|storyline|episode)/i,
  /\bthis (is|isn'?t) not\b/i,
];

function loadDraft(draftPath) {
  const resolved = path.resolve(draftPath);
  if (!fs.existsSync(resolved)) {
    console.error(`Draft file not found: ${resolved}`);
    process.exit(1);
  }
  delete require.cache[resolved];
  const draft = require(resolved);
  if (!Array.isArray(draft)) {
    console.error("Draft file must export an array of question objects.");
    process.exit(1);
  }
  return draft;
}

function loadCorpus() {
  const categories = JSON.parse(fs.readFileSync(CATEGORIES_FILE, "utf8"));
  const all = [];
  for (const cat of categories) {
    const filePath = path.join(DATA_DIR, cat.file);
    const questions = JSON.parse(fs.readFileSync(filePath, "utf8"));
    for (const q of questions) all.push(q);
  }
  return all;
}

function checkSchema(q, i) {
  const problems = [];
  const where = `draft[${i}]`;

  if (!q.question || typeof q.question !== "string" || !q.question.trim()) {
    problems.push(`${where}: missing/empty question`);
  }
  if (!["easy", "medium", "hard"].includes(q.difficulty)) {
    problems.push(`${where}: difficulty "${q.difficulty}" not in easy/medium/hard`);
  }
  if (!Array.isArray(q.options) || q.options.length !== 4) {
    problems.push(`${where}: expected 4 options, found ${Array.isArray(q.options) ? q.options.length : "none"}`);
  } else {
    const seen = new Set();
    for (const opt of q.options) {
      if (typeof opt !== "string" || !opt.trim()) {
        problems.push(`${where}: empty/invalid option`);
        continue;
      }
      const key = opt.trim().toLowerCase();
      if (seen.has(key)) problems.push(`${where}: duplicate option text "${opt}"`);
      seen.add(key);
      if (opt.length > MAX_OPTION_LENGTH) {
        problems.push(`${where}: option too long (${opt.length} chars) — "${opt.slice(0, 50)}..."`);
      }
    }
    if (typeof q.answer !== "string" || !q.options.includes(q.answer)) {
      problems.push(`${where}: answer "${q.answer}" does not exactly match any option`);
    }
  }
  return problems;
}

function checkHedges(q, i) {
  const problems = [];
  const where = `draft[${i}]`;
  const texts = [q.question || "", ...(Array.isArray(q.options) ? q.options : [])];
  for (const text of texts) {
    if (text.includes("...")) {
      problems.push(`${where}: contains "..." — likely a self-correcting/hedged phrasing: "${text}"`);
    }
    for (const pattern of HEDGE_PATTERNS) {
      if (pattern.test(text)) {
        problems.push(`${where}: hedge/meta language matched ${pattern} — "${text}"`);
        break;
      }
    }
  }
  return problems;
}

function nearestMatches(draftQ, corpus, topN) {
  const draftWords = wordSet(draftQ.question || "");
  const scored = corpus.map((c) => ({
    id: c.id,
    question: c.question,
    score: jaccard(draftWords, wordSet(c.question || "")),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

function main() {
  const draftPath = process.argv[2];
  if (!draftPath) {
    console.error("Usage: node scripts/check-draft.js <path-to-draft.js>");
    process.exit(1);
  }

  const draft = loadDraft(draftPath);
  const corpus = loadCorpus();

  console.log(`Checking ${draft.length} draft question(s) against ${corpus.length} existing questions...\n`);

  let schemaProblems = 0;
  let likelyDupes = 0;
  let nearDupes = 0;

  draft.forEach((q, i) => {
    const problems = [...checkSchema(q, i), ...checkHedges(q, i)];
    schemaProblems += problems.length;
    if (problems.length) {
      for (const p of problems) console.log("  ✗ " + p);
    }

    const matches = nearestMatches(q, corpus, 3);
    const top = matches[0];
    if (top && top.score >= LIKELY_DUPLICATE_THRESHOLD) {
      likelyDupes++;
      console.log(`  ✗ draft[${i}] LIKELY DUPLICATE (${top.score.toFixed(2)}) of ${top.id}: "${top.question}"`);
      console.log(`      draft: "${q.question}"`);
    } else if (top && top.score >= NEAR_DUPLICATE_THRESHOLD) {
      nearDupes++;
      console.log(`  ! draft[${i}] near-duplicate (${top.score.toFixed(2)}) of ${top.id}: "${top.question}"`);
      console.log(`      draft: "${q.question}"`);
    }
  });

  console.log(`\n${draft.length} drafted, ${schemaProblems} schema/hedge problem(s), ${likelyDupes} likely duplicate(s), ${nearDupes} near-duplicate warning(s).`);
  console.log(
    schemaProblems === 0 && likelyDupes === 0
      ? "Clear to merge (review near-duplicate warnings, if any, as judgment calls)."
      : "Fix the above before merging."
  );

  process.exit(schemaProblems > 0 || likelyDupes > 0 ? 1 : 0);
}

main();
