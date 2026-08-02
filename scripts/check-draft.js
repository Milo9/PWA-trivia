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
//      grepped for a few keywords. Also scores every draft question against
//      every OTHER draft question the same way (findInternalDuplicates) —
//      added after a single-file batch (FOOD-deepseek, 2026-08-02) turned out
//      to be two rewritten passes over its own topic list, and several
//      word-for-word-identical pairs shipped past the answer-index check
//      because that check assumed near-duplicate pairs were "already caught
//      elsewhere," which was only true for draft-vs-corpus, not draft-vs-draft.
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
//   node scripts/check-draft.js <path-to-draft.js> --full-answer-audit
//
// --full-answer-audit prints, for every draft answer that matches ANY
// existing corpus question's answer, the complete match list — bypassing
// MAX_ANSWER_GROUP_SIZE and SAME_ANSWER_MIN_OVERLAP entirely. Those two
// filters exist to cut noise for the *default* advisory output (a generic
// reused entity, or two questions that coincidentally share few words,
// isn't worth flagging every run) — but the same filters mean a real
// duplicate silently passes the default run once its answer already has
// 2+ corpus hits, or once reworded phrasing happens to score below 0.55
// overlap. On a 2026-08-01 batch (gemini-code-1785624420472.js) the
// default run flagged only 3 items but a manual version of this exact
// report found 40+ more real duplicates — mostly "who directed/composed/
// played X" chestnuts already asked 2-5 times under different wording.
// Use this flag for any batch you suspect leans on famous/iconic-subject
// facts (the kind of fact many different questions converge on), and
// eyeball every group it prints — it has no threshold of its own, so it
// WILL include plenty of coincidental generic-entity noise (a common
// answer like a country or a decade) alongside the real hits; that
// judgment call is still yours, this just stops you from writing the
// same throwaway node -e script from scratch each time.
//
// The draft file must be a CommonJS module exporting an array of objects
// shaped like { difficulty, question, options, answer } — no id yet, that
// gets assigned at merge time (see README "Adding a new batch"). A
// "category" field is optional here: external-agent drafts from one of
// templates/*.md include it (each prompt is already category-specific, so
// the agent just stamps a fixed value); this script doesn't read or
// validate it either way.

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

// Structural answer values ("All of the above" and friends) show up across
// completely unrelated questions purely because they're a common multiple-
// choice pattern, not because two questions test the same fact. Excluded
// from every answer-index build below so they don't masquerade as a shared-
// entity duplicate signal — this matters most for the draft-vs-draft check,
// where a small (~100-question) draft can easily have 3-4 unrelated "All of
// the above" answers stay under MAX_ANSWER_GROUP_SIZE by chance.
const GENERIC_ANSWER_KEYS = new Set([
  "all of the above",
  "none of the above",
  "both of the above",
  "neither of the above",
  "all of these",
  "none of these",
]);

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

// Draft-vs-draft near-duplicate pass — mirrors validate.js's findDuplicates(),
// but over the draft array against itself instead of the shipped corpus.
// Added 2026-08-02 after the FOOD-deepseek batch shipped-almost-shipped ~15
// internal duplicates (some word-for-word identical, e.g. two entries both
// "Butter tarts are a classic dessert from which country?") that this file's
// answer-index check (checkAnswerDuplicates) silently let through: its
// draft-vs-draft loop explicitly skips any pair scoring >= NEAR_DUPLICATE_
// THRESHOLD on the assumption "already caught by nearestMatches above" — but
// nearestMatches only ever compares a draft question against the CORPUS, so a
// near-identical pair *within the draft itself* was never checked by anything.
// This function is that missing check: every draft question against every
// other draft question, full O(n^2) pairwise question-text comparison, same
// thresholds as the corpus check. Cheap at draft-batch sizes (tested to ~700
// entries without a noticeable delay).
function findInternalDuplicates(draft) {
  const withWordSets = draft.map((q, i) => ({
    i,
    q,
    words: wordSet(q.question || ""),
    norm: normalize(q.question || ""),
  }));
  const hits = [];
  for (let i = 0; i < withWordSets.length; i++) {
    for (let j = i + 1; j < withWordSets.length; j++) {
      const a = withWordSets[i];
      const b = withWordSets[j];
      const sim = a.norm && a.norm === b.norm ? 1 : jaccard(a.words, b.words);
      if (sim >= LIKELY_DUPLICATE_THRESHOLD) {
        hits.push({ tier: "likely", a, b, sim });
      } else if (sim >= NEAR_DUPLICATE_THRESHOLD) {
        hits.push({ tier: "near", a, b, sim });
      }
    }
  }
  return hits;
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
    if (GENERIC_ANSWER_KEYS.has(key)) continue;
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
    if (sim >= NEAR_DUPLICATE_THRESHOLD) continue; // now caught by findInternalDuplicates instead
    // No SAME_ANSWER_MIN_OVERLAP floor here (unlike the corpus loop above):
    // that floor was calibrated against a ~7,000-question corpus where a
    // shared specific answer is often coincidental generic-entity reuse. A
    // single draft batch is 2-3 orders of magnitude smaller, so two entries
    // sharing a specific, non-generic answer (GENERIC_ANSWER_KEYS is already
    // filtered out above) are far more likely to be the same fact reworded —
    // confirmed against the FOOD-deepseek batch (2026-08-02): every pair this
    // floor would have suppressed here (e.g. "St Lucie cherry" at 0.36
    // overlap, "Ostrich fern" at 0.30) turned out to be a real duplicate on
    // manual review, unlike the corpus-scale case.
    hits.push(
      `draft[${i}]: shares answer "${q.answer}" with draft[${other.i}] (question overlap ${sim.toFixed(2)}) — check if it's the same fact reworded: "${other.q.question}"`
    );
  }
  return hits;
}

// Prints every draft item's FULL corpus answer-match list, ignoring
// MAX_ANSWER_GROUP_SIZE and SAME_ANSWER_MIN_OVERLAP. See the usage comment
// at the top of this file for why this exists alongside the capped/
// filtered check above rather than replacing it.
function printFullAnswerAudit(draft, corpusAnswerIndex) {
  console.log(`\nFull answer-match audit (no cap, no overlap floor) — eyeball each group:\n`);
  let groupsPrinted = 0;
  draft.forEach((q, i) => {
    if (typeof q.answer !== "string") return;
    const key = normalizeAnswer(q.answer);
    if (!key || key.length < MIN_ANSWER_DUPLICATE_LENGTH) return;
    const matches = corpusAnswerIndex.get(key) || [];
    if (matches.length === 0) return;
    groupsPrinted++;
    console.log(`draft[${i}] "${q.answer}" -> ${matches.length} corpus match(es):`);
    console.log(`    draft: "${q.question}"`);
    for (const m of matches) {
      console.log(`    ${m.id}: "${m.question}"`);
    }
  });
  console.log(`\n${groupsPrinted} draft answer(s) with at least one existing corpus match.`);
}

function main() {
  const draftPath = process.argv[2];
  const fullAnswerAudit = process.argv.includes("--full-answer-audit");
  if (!draftPath) {
    console.error("Usage: node scripts/check-draft.js <path-to-draft.js> [--full-answer-audit]");
    process.exit(1);
  }

  const draft = loadDraft(draftPath);
  const corpus = loadCorpus();
  const corpusAnswerIndex = buildAnswerIndex(corpus);
  const draftAnswerIndex = buildAnswerIndex(draft.map((q, i) => ({ ...q, __i: i })));

  if (fullAnswerAudit) {
    printFullAnswerAudit(draft, corpusAnswerIndex);
    return;
  }

  console.log(`Checking ${draft.length} draft question(s) against ${corpus.length} existing questions...\n`);

  let schemaProblems = 0;
  let likelyDupes = 0;
  let nearDupes = 0;
  let advisories = 0;

  const internalHits = findInternalDuplicates(draft);
  for (const hit of internalHits) {
    if (hit.tier === "likely") {
      likelyDupes++;
      console.log(
        `  ✗ draft[${hit.a.i}] LIKELY DUPLICATE (${hit.sim.toFixed(2)}) of draft[${hit.b.i}] (same draft, not the corpus): "${hit.b.q.question}"`
      );
      console.log(`      draft[${hit.a.i}]: "${hit.a.q.question}"`);
    } else {
      nearDupes++;
      console.log(
        `  ! draft[${hit.a.i}] near-duplicate (${hit.sim.toFixed(2)}) of draft[${hit.b.i}] (same draft, not the corpus): "${hit.b.q.question}"`
      );
      console.log(`      draft[${hit.a.i}]: "${hit.a.q.question}"`);
    }
  }

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
