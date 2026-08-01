#!/usr/bin/env node
// Validates every category's question file against the schema, checks for
// duplicate/near-duplicate questions (within and across categories), and
// flags structural quality issues. Zero dependencies, zero API calls —
// meant to be run after every batch of newly-drafted questions.
//
// Usage: node scripts/validate.js

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const CATEGORIES_FILE = path.join(DATA_DIR, "categories.json");

const REQUIRED_OPTION_COUNT = 4;
const DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const ID_PATTERN = /^[a-z0-9-]+-\d{3,}$/;
const NEAR_DUPLICATE_THRESHOLD = 0.7;
// Group size, not answer length, is what actually separates "this answer is
// just a generic reused entity" (Thomas Jefferson answers both a Declaration
// question and a Louisiana Purchase question; William Shakespeare answers a
// dozen different plays) from "this answer is genuinely specific enough that
// two questions sharing it are probably the same fact." Measured against
// this corpus: capping at 2 (an answer used exactly twice) keeps true finds
// like "Scurvy" and "Transpiration" while dropping every multi-question
// generic-entity cluster (Shakespeare, "Theoretical physics", etc.) that a
// length-only or size<=6 filter let through. Answers shared by MORE than
// this many questions are skipped entirely by findAnswerDuplicates.
const MAX_ANSWER_GROUP_SIZE = 2;
// A short length floor on top of the group-size cap — mostly to filter pure
// one-word/number answers ("Six", "Red", "1969") that can still coincidentally
// land in a group of exactly 2.
const MIN_ANSWER_DUPLICATE_LENGTH = 6;
// Floor on question-text overlap for the same-answer check below. Confirmed
// empirically across two full-corpus triage passes (2026-07-31, 2026-08-01):
// sorting same-answer pairs by this score, pairs >= 0.55 are dense with real
// duplicates, while pairs below it are almost all coincidental generic-entity
// reuse (two questions that just happen to both answer "Oxygen" or "Poland").
// Below this floor isn't a useful signal, so don't report it — a warning that
// resolves to "ignore this" on every single run trains reviewers to stop
// reading warnings at all.
const SAME_ANSWER_MIN_OVERLAP = 0.55;

let errors = [];
let warnings = [];

function err(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "what", "who", "which",
  "whose", "do", "does", "did", "in", "on", "at", "of", "to", "for",
  "and", "or", "his", "her", "their", "its", "this", "that",
]);

function wordSet(text) {
  return new Set(
    normalize(text)
      .split(" ")
      .filter((w) => w && !STOPWORDS.has(w))
  );
}

// Normalizes an answer for cross-question comparison: same lowercase/
// punctuation-stripping as normalize(), plus dropping a leading article or
// honorific so "The Beatles" and "Beatles" (or "Dr. Watson" and "Watson")
// group together.
function normalizeAnswer(text) {
  return normalize(text).replace(/^(a|an|the|mr|mrs|ms|dr)\s+/, "");
}

function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function loadJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    err(`${label}: file not found at ${filePath}`);
    return null;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (e) {
    err(`${label}: invalid JSON — ${e.message}`);
    return null;
  }
}

function validateQuestion(q, categoryId, file, seenIds) {
  const where = `${file} (${q && q.id ? q.id : "<no id>"})`;

  if (!q.id || typeof q.id !== "string") {
    err(`${where}: missing/invalid "id"`);
  } else {
    if (!ID_PATTERN.test(q.id)) {
      warn(`${where}: id "${q.id}" doesn't match expected pattern <category>-<number>`);
    }
    if (seenIds.has(q.id)) {
      err(`${where}: duplicate id "${q.id}" (already used elsewhere in the dataset)`);
    }
    seenIds.add(q.id);
  }

  if (q.category !== categoryId) {
    err(`${where}: category field "${q.category}" doesn't match containing category "${categoryId}"`);
  }

  if (!q.question || typeof q.question !== "string" || !q.question.trim()) {
    err(`${where}: missing/empty "question"`);
  } else if (q.question.length < 8 || q.question.length > 220) {
    warn(`${where}: question length (${q.question.length} chars) looks unusual — double check it`);
  }

  if (!Array.isArray(q.options)) {
    err(`${where}: "options" must be an array`);
  } else {
    if (q.options.length !== REQUIRED_OPTION_COUNT) {
      err(`${where}: expected ${REQUIRED_OPTION_COUNT} options, found ${q.options.length}`);
    }
    const seenOptions = new Set();
    for (const opt of q.options) {
      if (typeof opt !== "string" || !opt.trim()) {
        err(`${where}: found an empty/invalid option`);
        continue;
      }
      const key = opt.trim().toLowerCase();
      if (seenOptions.has(key)) {
        err(`${where}: duplicate option text "${opt}"`);
      }
      seenOptions.add(key);
    }

    if (typeof q.answer !== "string" || !q.answer.trim()) {
      err(`${where}: missing/invalid "answer"`);
    } else {
      const matches = q.options.filter((o) => o === q.answer).length;
      if (matches === 0) {
        err(`${where}: "answer" ("${q.answer}") does not exactly match any option (check punctuation/casing)`);
      } else if (matches > 1) {
        err(`${where}: "answer" matches more than one option — options must be unique`);
      }
    }
  }

  if (!q.difficulty || !DIFFICULTIES.has(q.difficulty)) {
    err(`${where}: "difficulty" must be one of ${[...DIFFICULTIES].join(", ")}`);
  }
}

function findDuplicates(questions) {
  const normalizedText = new Map(); // exact-normalized -> question
  const withWordSets = questions.map((q) => ({
    q,
    words: wordSet(q.question || ""),
    norm: normalize(q.question || ""),
  }));

  for (const entry of withWordSets) {
    const existing = normalizedText.get(entry.norm);
    if (existing && entry.norm) {
      err(
        `Exact duplicate question text: "${existing.q.id}" and "${entry.q.id}" ("${entry.q.question}")`
      );
    } else {
      normalizedText.set(entry.norm, entry);
    }
  }

  for (let i = 0; i < withWordSets.length; i++) {
    for (let j = i + 1; j < withWordSets.length; j++) {
      const a = withWordSets[i];
      const b = withWordSets[j];
      if (a.norm === b.norm) continue; // already reported as exact duplicate
      const sim = jaccard(a.words, b.words);
      if (sim >= NEAR_DUPLICATE_THRESHOLD) {
        warn(
          `Possible near-duplicate (similarity ${sim.toFixed(2)}): "${a.q.id}" ("${a.q.question}") vs "${b.q.id}" ("${b.q.question}")`
        );
      }
    }
  }
}

// Catches "same fact, different wording" duplicates that findDuplicates()
// misses because the question text itself has little word overlap (e.g.
// "What weapon is Robin Hood skilled with?" -> "Bow and arrow" vs. "What is
// Robin Hood's signature skill?" -> "Archery"). Same underlying fact usually
// means the same correct answer, regardless of phrasing, so grouping by
// normalized answer surfaces candidates a text-similarity threshold can't.
//
// A general-knowledge bank reuses common answers (countries, historical
// figures, round numbers) across genuinely unrelated facts far more than a
// single-show bank reuses character names, so this only flags pairs whose
// question text is BELOW the near-duplicate threshold — pairs at or above it
// are already reported by findDuplicates(), and re-flagging them here just
// adds noise without adding a new finding.
function findAnswerDuplicates(questions) {
  const groups = new Map();
  for (const q of questions) {
    if (!q.answer || typeof q.answer !== "string") continue;
    const key = normalizeAnswer(q.answer);
    if (!key || key.length < MIN_ANSWER_DUPLICATE_LENGTH) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ q, words: wordSet(q.question || "") });
  }

  for (const group of groups.values()) {
    if (group.length < 2 || group.length > MAX_ANSWER_GROUP_SIZE) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (a.q.category !== b.q.category) continue; // cross-category match is almost always coincidence
        const sim = jaccard(a.words, b.words);
        if (sim >= NEAR_DUPLICATE_THRESHOLD) continue; // already reported by findDuplicates()
        if (sim < SAME_ANSWER_MIN_OVERLAP) continue; // below this, it's coincidental generic-entity reuse, not signal
        warn(
          `Same answer ("${a.q.answer}"), low word-overlap questions (${sim.toFixed(2)}) in "${a.q.category}" — check whether it's the same fact reworded: "${a.q.id}" ("${a.q.question}") vs "${b.q.id}" ("${b.q.question}")`
        );
      }
    }
  }
}

function main() {
  const categories = loadJson(CATEGORIES_FILE, "categories.json");
  if (!categories) {
    report();
    process.exit(1);
  }

  const seenIds = new Set();
  const allQuestions = [];
  let totalCount = 0;

  for (const cat of categories) {
    if (!cat.id || !cat.name || !cat.file) {
      err(`categories.json: entry missing id/name/file — ${JSON.stringify(cat)}`);
      continue;
    }
    const filePath = path.join(DATA_DIR, cat.file);
    const questions = loadJson(filePath, cat.file);
    if (!questions) continue;
    if (!Array.isArray(questions)) {
      err(`${cat.file}: expected an array of questions`);
      continue;
    }

    for (const q of questions) {
      validateQuestion(q, cat.id, cat.file, seenIds);
      allQuestions.push(q);
    }

    console.log(`${cat.name}: ${questions.length} questions loaded`);
    totalCount += questions.length;
  }

  findDuplicates(allQuestions);
  findAnswerDuplicates(allQuestions);

  console.log(`\nTotal questions across all categories: ${totalCount}`);
  report();

  process.exit(errors.length > 0 ? 1 : 0);
}

function report() {
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)\n`);
  if (errors.length) {
    console.log("ERRORS (must fix):");
    for (const e of errors) console.log("  ✗ " + e);
  }
  if (warnings.length) {
    console.log("\nWARNINGS (review, may be fine):");
    for (const w of warnings) console.log("  ! " + w);
  }
  if (!errors.length && !warnings.length) {
    console.log("All clear.");
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  normalize,
  wordSet,
  jaccard,
  NEAR_DUPLICATE_THRESHOLD,
  normalizeAnswer,
  MAX_ANSWER_GROUP_SIZE,
  MIN_ANSWER_DUPLICATE_LENGTH,
  SAME_ANSWER_MIN_OVERLAP,
};
