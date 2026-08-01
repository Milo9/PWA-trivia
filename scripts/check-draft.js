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
// Also reports (advisory, non-blocking — see the exit code logic below):
// answers that leak into the question text, options that read as full
// sentences instead of a short answer, and a drafted question sharing a
// specific correct answer with an existing (or another drafted) question at
// low text overlap — the "same fact, different wording" case duplicate-by-
// question-text-similarity misses.
//
// Usage:
//   node scripts/check-draft.js <path-to-draft.js>
//
// The draft file must be a CommonJS module exporting an array of objects
// shaped like { difficulty, question, options, answer } — no id/category
// yet, those get assigned at merge time (see README "Adding a new batch").

const fs = require("fs");
const path = require("path");
const {
  wordSet,
  jaccard,
  NEAR_DUPLICATE_THRESHOLD,
  normalizeAnswer,
  normalize,
  MAX_ANSWER_GROUP_SIZE,
  MIN_ANSWER_DUPLICATE_LENGTH,
  SAME_ANSWER_MIN_OVERLAP,
} = require("./validate.js");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const CATEGORIES_FILE = path.join(DATA_DIR, "categories.json");
const LIKELY_DUPLICATE_THRESHOLD = 0.85;
const MAX_OPTION_LENGTH = 90;
// Options this long that also look like a sentence (contains a linking verb,
// or ends in terminal punctuation) read as explanatory prose rather than a
// short noun-phrase answer — advisory only, since multi-part names ("Huey,
// Dewey, and Louie") and legitimate "why/what happens" answers trip this too.
const SENTENCE_LIKE_MIN_LENGTH = 40;
const SENTENCE_LIKE_PATTERN = /[.!?]$|\b(is|are|was|were|because)\b/i;

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

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Flags a question that states its own answer, e.g. a full episode/book/movie
// title named in the question that already contains the tested word, or a
// question that names the same entity it's asking the player to identify.
// Word-boundary matched — a naive substring check also fires on coincidental
// containment ("Ross" inside "across", "Euro" inside "European", "Ear"
// inside "hearing"), which isn't a leak at all. Advisory rather than
// blocking: even with word boundaries, some hits are a legitimate quiz
// convention rather than a bug (a Shakespeare play named after its title
// character, e.g. "Macbeth"), so this needs a human judgment call like the
// other advisory checks below.
function checkAnswerLeak(q, i) {
  const hits = [];
  if (typeof q.answer !== "string" || typeof q.question !== "string") return hits;
  const normAnswer = normalize(q.answer);
  const normQuestion = normalize(q.question);
  if (!normAnswer) return hits;
  const re = new RegExp(`\\b${escapeRegExp(normAnswer)}\\b`);
  if (re.test(normQuestion)) {
    hits.push(
      `draft[${i}]: answer "${q.answer}" appears verbatim in the question text — "${q.question}"`
    );
  }
  return hits;
}

// Advisory: options that read as full sentences instead of short noun
// phrases. Not blocking (see SENTENCE_LIKE_PATTERN comment above) — printed
// separately for a human skim, not counted toward the merge-blocking total.
function checkSentenceLikeAnswer(q, i) {
  const hits = [];
  if (!Array.isArray(q.options)) return hits;
  for (const opt of q.options) {
    if (typeof opt !== "string") continue;
    if (opt.length >= SENTENCE_LIKE_MIN_LENGTH && SENTENCE_LIKE_PATTERN.test(opt)) {
      hits.push(`draft[${i}]: option reads like a sentence, not a short answer — "${opt}"`);
    }
  }
  return hits;
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

// Groups questions by normalized answer, for the "same fact, low word
// overlap" check below. checkAnswerDuplicates applies validate.js's
// MAX_ANSWER_GROUP_SIZE cap at lookup time (skip a corpus match if that
// answer is already common enough there to be a generic reused entity
// rather than a specific duplicate signal) — see validate.js for why group
// size, not answer length, is the right discriminator.
function buildAnswerIndex(questions) {
  const index = new Map();
  for (const q of questions) {
    if (typeof q.answer !== "string") continue;
    const key = normalizeAnswer(q.answer);
    if (!key || key.length < MIN_ANSWER_DUPLICATE_LENGTH) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(q);
  }
  return index;
}

// Catches the same "same fact, different wording" case as validate.js's
// findAnswerDuplicates, scoped to draft-vs-corpus and draft-vs-draft instead
// of whole-corpus self-comparison. draftMatches is the same-key draft items
// (excluding q itself), pre-filtered by the caller.
function checkAnswerDuplicates(q, i, corpusIndex, draftMatches) {
  const hits = [];
  if (typeof q.answer !== "string") return hits;
  const key = normalizeAnswer(q.answer);
  if (!key || key.length < MIN_ANSWER_DUPLICATE_LENGTH) return hits;

  const draftWords = wordSet(q.question || "");
  const corpusMatches = corpusIndex.get(key) || [];
  if (corpusMatches.length <= MAX_ANSWER_GROUP_SIZE) {
    for (const match of corpusMatches) {
      const sim = jaccard(draftWords, wordSet(match.question || ""));
      if (sim >= NEAR_DUPLICATE_THRESHOLD) continue; // already caught by nearestMatches above
      if (sim < SAME_ANSWER_MIN_OVERLAP) continue; // below this, it's coincidental generic-entity reuse, not signal
      hits.push(
        `draft[${i}]: shares answer "${q.answer}" with existing ${match.id} (question overlap ${sim.toFixed(2)}) — check if it's the same fact reworded: "${match.question}"`
      );
    }
  }
  for (const other of draftMatches) {
    const sim = jaccard(draftWords, wordSet(other.q.question || ""));
    if (sim >= NEAR_DUPLICATE_THRESHOLD) continue;
    if (sim < SAME_ANSWER_MIN_OVERLAP) continue;
    hits.push(
      `draft[${i}]: shares answer "${q.answer}" with draft[${other.i}] (question overlap ${sim.toFixed(2)}) — check if it's the same fact reworded: "${other.q.question}"`
    );
  }
  return hits;
}

function main() {
  const draftPath = process.argv[2];
  if (!draftPath) {
    console.error("Usage: node scripts/check-draft.js <path-to-draft.js>");
    process.exit(1);
  }

  const draft = loadDraft(draftPath);
  const corpus = loadCorpus();
  const corpusAnswerIndex = buildAnswerIndex(corpus);
  const draftAnswerIndex = buildAnswerIndex(draft.map((q, i) => ({ ...q, __i: i })));

  console.log(`Checking ${draft.length} draft question(s) against ${corpus.length} existing questions...\n`);

  let schemaProblems = 0;
  let likelyDupes = 0;
  let nearDupes = 0;
  let advisories = 0;

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

    const leakHits = checkAnswerLeak(q, i);
    const sentenceHits = checkSentenceLikeAnswer(q, i);
    const draftKey = typeof q.answer === "string" ? normalizeAnswer(q.answer) : "";
    const draftMatches = (draftAnswerIndex.get(draftKey) || [])
      .filter((other) => other.__i !== i)
      .map((other) => ({ q: other, i: other.__i }));
    const answerDupHits = checkAnswerDuplicates(q, i, corpusAnswerIndex, draftMatches);
    const allAdvisories = [...leakHits, ...sentenceHits, ...answerDupHits];
    advisories += allAdvisories.length;
    for (const h of allAdvisories) console.log("  ? " + h);
  });

  console.log(`\n${draft.length} drafted, ${schemaProblems} schema/hedge problem(s), ${likelyDupes} likely duplicate(s), ${nearDupes} near-duplicate warning(s), ${advisories} advisory note(s) (answer leak/reuse/sentence-like — judgment calls).`);
  console.log(
    schemaProblems === 0 && likelyDupes === 0
      ? "Clear to merge (review near-duplicate warnings, if any, as judgment calls)."
      : "Fix the above before merging."
  );

  process.exit(schemaProblems > 0 || likelyDupes > 0 ? 1 : 0);
}

main();
