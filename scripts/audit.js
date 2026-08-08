#!/usr/bin/env node
// Manages a resumable, chunked accuracy-audit pass over the whole question
// corpus — factual correctness, distractor correctness, answer-leaks, stale
// superlatives, self-answering stems, etc. (the stuff validate.js/check-draft.js
// don't check, since those only catch schema and duplication).
//
// This script is pure bookkeeping: it decides what's next, hands you the
// content to review, and records what you found. It does NOT itself judge
// whether a question is accurate — that's the reviewing session's job (using
// its own knowledge and WebSearch for anything uncertain), same as every
// other judgment call in this repo.
//
// State lives in audit/progress.json (current pass) and audit/history/*.json
// (archived completed passes). Deliberately kept OUTSIDE data/ so editing it
// doesn't bump the offline cache version (stamp-version.js hashes everything
// under data/) and so it's obviously not shipped question content.
//
// Usage:
//   node scripts/audit.js status
//   node scripts/audit.js init [--chunk-size=50]
//   node scripts/audit.js next [--category=<id>] [--n=1]
//   node scripts/audit.js complete <chunkId> [--issues=N] [--notes="..."]
//   node scripts/audit.js reset <chunkId>
//   node scripts/audit.js new-pass [--chunk-size=50] [--full]

const fs = require("fs");
const path = require("path");
const { normalizeAnswer, MIN_ANSWER_DUPLICATE_LENGTH } = require("./validate.js");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const CATEGORIES_FILE = path.join(DATA_DIR, "categories.json");
const AUDIT_DIR = path.join(ROOT, "audit");
const PROGRESS_FILE = path.join(AUDIT_DIR, "progress.json");
const HISTORY_DIR = path.join(AUDIT_DIR, "history");

const DEFAULT_CHUNK_SIZE = 50;
// Front-load the riskiest content within each category's chunk sequence:
// hard-difficulty questions rest on more specific/obscure claims than easy
// ones (see CLAUDE.md "Factual-error patterns worth verifying"), so a pass
// that gets interrupted partway through still covered the highest-risk
// material first.
const DIFFICULTY_RANK = { hard: 0, medium: 1, easy: 2 };
// Cap on how many same-answer corpus hits to print per question — protects
// against a handful of genuinely generic answers (colors, round numbers)
// flooding a chunk's output if the length floor alone doesn't filter them.
const MAX_ANSWER_MATCHES_SHOWN = 5;

function todayIso() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function loadCategories() {
  return JSON.parse(fs.readFileSync(CATEGORIES_FILE, "utf8"));
}

function loadCategoryQuestions(cat) {
  const filePath = path.join(DATA_DIR, cat.file);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadProgress() {
  if (!fs.existsSync(PROGRESS_FILE)) return null;
  return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
}

function saveProgress(progress) {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2) + "\n");
}

function parseFlags(argv) {
  const flags = {};
  for (const arg of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (m) flags[m[1]] = m[2] === undefined ? true : m[2];
  }
  return flags;
}

// Every question id that was ever part of a "done" chunk in an archived
// pass — i.e. has been through at least one completed audit review.
// new-pass uses this by default so a fresh pass only covers questions that
// have NEVER been audited, instead of re-reviewing the whole corpus every
// cycle. Chunks that were only pending/in-progress when a pass got archived
// early (new-pass --force) don't count — their ids stay eligible for the
// next pass, same as before.
function buildReviewedIdSet() {
  const ids = new Set();
  if (!fs.existsSync(HISTORY_DIR)) return ids;
  for (const file of fs.readdirSync(HISTORY_DIR)) {
    if (!file.endsWith(".json")) continue;
    const archived = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, file), "utf8"));
    for (const chunk of archived.chunks) {
      if (chunk.status !== "done") continue;
      for (const id of chunk.ids) ids.add(id);
    }
  }
  return ids;
}

// Builds a fresh chunk manifest from the CURRENT corpus. Used by both init
// (pass 1, always the full corpus) and new-pass (pass N+1, which by default
// passes reviewedIds so already-audited questions are excluded — see
// buildReviewedIdSet above). Either way, questions added to data/ since the
// last pass started get swept in rather than silently skipped forever.
function buildManifest(pass, chunkSize, reviewedIds = new Set()) {
  const categories = loadCategories();
  const chunks = [];
  let totalCorpusQuestions = 0;
  let excludedAlreadyReviewed = 0;

  for (const cat of categories.sort((a, b) => a.id.localeCompare(b.id))) {
    const questions = loadCategoryQuestions(cat);
    totalCorpusQuestions += questions.length;
    const unreviewed = questions.filter((q) => {
      if (!reviewedIds.has(q.id)) return true;
      excludedAlreadyReviewed++;
      return false;
    });
    const sorted = unreviewed.sort(
      (a, b) => (DIFFICULTY_RANK[a.difficulty] ?? 1) - (DIFFICULTY_RANK[b.difficulty] ?? 1)
    );
    const ids = sorted.map((q) => q.id);
    for (let i = 0; i < ids.length; i += chunkSize) {
      const slice = ids.slice(i, i + chunkSize);
      const chunkIndex = String(chunks.filter((c) => c.category === cat.id).length).padStart(3, "0");
      chunks.push({
        chunkId: `${cat.id}-p${pass}-${chunkIndex}`,
        category: cat.id,
        ids: slice,
        status: "pending",
        startedAt: null,
        completedAt: null,
        issuesFound: null,
        notes: null,
      });
    }
  }

  return {
    pass,
    chunkSize,
    startedAt: todayIso(),
    completedAt: null,
    totalQuestions: chunks.reduce((n, c) => n + c.ids.length, 0),
    totalCorpusQuestions,
    excludedAlreadyReviewed,
    chunks,
  };
}

function cmdInit(flags) {
  const existing = loadProgress();
  if (existing && !flags.force) {
    console.error(
      `audit/progress.json already exists (pass ${existing.pass}). Use "status" to check progress, ` +
        `"new-pass" once it's fully complete, or pass --force to overwrite (loses in-progress notes).`
    );
    process.exit(1);
  }
  const chunkSize = flags["chunk-size"] ? parseInt(flags["chunk-size"], 10) : DEFAULT_CHUNK_SIZE;
  const manifest = buildManifest(1, chunkSize);
  saveProgress(manifest);
  console.log(
    `Initialized pass 1: ${manifest.chunks.length} chunks, ${manifest.totalQuestions} questions, chunk size ${chunkSize}.`
  );
  printStatus(manifest);
}

function cmdNewPass(flags) {
  const current = loadProgress();
  if (!current) {
    console.error('No active pass found. Use "init" to start pass 1.');
    process.exit(1);
  }
  const remaining = current.chunks.filter((c) => c.status !== "done");
  if (remaining.length > 0 && !flags.force) {
    console.error(
      `Pass ${current.pass} still has ${remaining.length} pending/in-progress chunk(s). ` +
        `Finish those first, or pass --force to archive it early.`
    );
    process.exit(1);
  }

  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  current.completedAt = current.completedAt || todayIso();
  fs.writeFileSync(
    path.join(HISTORY_DIR, `pass-${current.pass}.json`),
    JSON.stringify(current, null, 2) + "\n"
  );
  console.log(`Archived pass ${current.pass} to audit/history/pass-${current.pass}.json`);

  const chunkSize = flags["chunk-size"] ? parseInt(flags["chunk-size"], 10) : current.chunkSize;
  // Default: only manifest questions that have never been through a
  // completed audit chunk in any prior pass. --full opts back into a
  // complete re-audit of the whole corpus, same as the old behavior.
  const reviewedIds = flags.full ? new Set() : buildReviewedIdSet();
  const manifest = buildManifest(current.pass + 1, chunkSize, reviewedIds);
  saveProgress(manifest);
  console.log(
    `Initialized pass ${manifest.pass}: ${manifest.chunks.length} chunks, ${manifest.totalQuestions} questions, chunk size ${chunkSize}.` +
      (flags.full
        ? ""
        : ` (${manifest.excludedAlreadyReviewed} already-audited question(s) excluded — pass --full to force a complete re-audit instead.)`)
  );
  printStatus(manifest);
}

function printStatus(progress) {
  const byCategory = new Map();
  for (const c of progress.chunks) {
    if (!byCategory.has(c.category)) byCategory.set(c.category, []);
    byCategory.get(c.category).push(c);
  }

  console.log(`\nPass ${progress.pass} (started ${progress.startedAt}), chunk size ${progress.chunkSize}`);
  console.log(
    `${progress.totalQuestions} questions across ${progress.chunks.length} chunks` +
      (progress.excludedAlreadyReviewed
        ? ` (${progress.excludedAlreadyReviewed} already-audited question(s) skipped this pass)`
        : "") +
      "\n"
  );

  let totalDone = 0;
  let totalIssues = 0;
  const allCategoryIds = loadCategories()
    .map((c) => c.id)
    .sort();
  for (const category of allCategoryIds) {
    const chunks = byCategory.get(category);
    if (!chunks) {
      console.log(`  ${category.padEnd(24)}   0/0 chunks  (nothing new to review this pass)`);
      continue;
    }
    const done = chunks.filter((c) => c.status === "done").length;
    const inProgress = chunks.filter((c) => c.status === "in-progress").length;
    const issues = chunks.reduce((n, c) => n + (c.issuesFound || 0), 0);
    totalDone += done;
    totalIssues += issues;
    const flag = inProgress ? ` (${inProgress} in-progress)` : "";
    console.log(
      `  ${category.padEnd(24)} ${String(done).padStart(3)}/${chunks.length} chunks${flag}  issues found: ${issues}`
    );
  }

  if (progress.chunks.length === 0) {
    console.log(
      `\nNothing to review this pass — every question was already covered by a previous pass. ` +
        `Add more questions, or run "new-pass --full" to force a complete re-audit.`
    );
    return;
  }

  const pct = ((totalDone / progress.chunks.length) * 100).toFixed(1);
  console.log(`\nOverall: ${totalDone}/${progress.chunks.length} chunks done (${pct}%), ${totalIssues} issue(s) found this pass.`);
  if (totalDone === progress.chunks.length) {
    console.log(`Pass ${progress.pass} is complete — run "new-pass" to start pass ${progress.pass + 1}.`);
  }
}

function cmdStatus() {
  const progress = loadProgress();
  if (!progress) {
    console.log('No active audit pass. Run "node scripts/audit.js init" to start pass 1.');
    return;
  }
  printStatus(progress);
}

function formatQuestionLine(q) {
  if (!q) return null;
  const opts = q.options
    .map((o, idx) => `${String.fromCharCode(65 + idx)}:${o}${o === q.answer ? "*" : ""}`)
    .join(" | ");
  return `${q.id} [${q.difficulty}] Q: ${q.question}  OPTIONS: ${opts}`;
}

// Whole-corpus index keyed by normalized answer, no group-size cap and no
// text-overlap floor — deliberately looser than validate.js's own same-answer
// check (MAX_ANSWER_GROUP_SIZE / SAME_ANSWER_MIN_OVERLAP), which is calibrated
// to suppress noise across the WHOLE corpus and, as a documented side effect,
// silently misses real duplicates once phrasing differs enough (confirmed
// 2026-08-05: a real duplicate pair — "general-2907"/"animals-nature-163",
// both answering "A .22 caliber bullet" for the same mantis-shrimp-punch fact
// — scored only 0.22 question-text overlap, well under validate.js's 0.55
// floor, so it was never flagged there). check-draft.js's --full-answer-audit
// already takes this looser no-cap/no-floor approach for drafts; this mirrors
// it for already-shipped content during an audit chunk. Still answer-text
// matching only — it catches "identical answer, different phrasing" but NOT
// reversed-direction or semantically-same-fact-different-wording duplicates
// (e.g. "Radial sesamoid" vs "An enlarged wrist bone") — those need the
// reviewing session's own judgment, same as always.
function buildGlobalAnswerIndex() {
  const categories = loadCategories();
  const index = new Map();
  for (const cat of categories) {
    for (const q of loadCategoryQuestions(cat)) {
      if (typeof q.answer !== "string") continue;
      const key = normalizeAnswer(q.answer);
      if (!key || key.length < MIN_ANSWER_DUPLICATE_LENGTH) continue;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(q);
    }
  }
  return index;
}

function printAnswerMatches(q, answerIndex) {
  if (!q || typeof q.answer !== "string") return;
  const key = normalizeAnswer(q.answer);
  if (!key || key.length < MIN_ANSWER_DUPLICATE_LENGTH) return;
  const group = (answerIndex.get(key) || []).filter((other) => other.id !== q.id);
  if (group.length === 0) return;
  const shown = group.slice(0, MAX_ANSWER_MATCHES_SHOWN);
  for (const other of shown) {
    console.log(`    ^ same answer also used by ${other.id}: "${other.question}"`);
  }
  if (group.length > shown.length) {
    console.log(`    ^ ...and ${group.length - shown.length} more with the same answer (likely a generic/common one).`);
  }
}

function cmdNext(flags) {
  const progress = loadProgress();
  if (!progress) {
    console.error('No active audit pass. Run "node scripts/audit.js init" first.');
    process.exit(1);
  }
  const n = flags.n ? parseInt(flags.n, 10) : 1;
  const categoryFilter = flags.category;

  // In-progress chunks (started in an earlier session but not completed —
  // e.g. it was too large to finish in one sitting) come first, so resuming
  // "next" naturally re-surfaces unfinished work instead of orphaning it and
  // drifting on to fresh pending chunks.
  const inProgress = progress.chunks.filter(
    (c) => c.status === "in-progress" && (!categoryFilter || c.category === categoryFilter)
  );
  const pending = progress.chunks.filter(
    (c) => c.status === "pending" && (!categoryFilter || c.category === categoryFilter)
  );
  const candidates = [...inProgress, ...pending];
  if (candidates.length === 0) {
    console.log(
      categoryFilter
        ? `No pending chunks left for category "${categoryFilter}".`
        : `No pending chunks left in pass ${progress.pass} — run "status" to confirm, then "new-pass".`
    );
    return;
  }

  const picked = candidates.slice(0, n);
  const categories = loadCategories();
  const questionsByCategory = new Map();
  const answerIndex = buildGlobalAnswerIndex();

  for (const chunk of picked) {
    chunk.status = "in-progress";
    chunk.startedAt = chunk.startedAt || todayIso();

    if (!questionsByCategory.has(chunk.category)) {
      const cat = categories.find((c) => c.id === chunk.category);
      const byId = new Map(loadCategoryQuestions(cat).map((q) => [q.id, q]));
      questionsByCategory.set(chunk.category, byId);
    }
    const byId = questionsByCategory.get(chunk.category);

    console.log(`\n=== ${chunk.chunkId} (category: ${chunk.category}, ${chunk.ids.length} questions) ===`);
    let missing = 0;
    for (const id of chunk.ids) {
      const q = byId.get(id);
      const line = formatQuestionLine(q);
      if (line) {
        console.log(line);
        printAnswerMatches(q, answerIndex);
      } else {
        missing++;
      }
    }
    if (missing > 0) {
      console.log(`  (${missing} id(s) from this chunk no longer exist in the corpus — already removed, e.g. by a dedup pass. Skip them.)`);
    }
  }

  saveProgress(progress);
  console.log(
    `\nWhen review is done, mark each chunk complete:\n  node scripts/audit.js complete <chunkId> --issues=<N> --notes="<summary>"`
  );
}

function cmdComplete(chunkId, flags) {
  if (!chunkId) {
    console.error("Usage: node scripts/audit.js complete <chunkId> [--issues=N] [--notes=\"...\"]");
    process.exit(1);
  }
  const progress = loadProgress();
  if (!progress) {
    console.error("No active audit pass.");
    process.exit(1);
  }
  const chunk = progress.chunks.find((c) => c.chunkId === chunkId);
  if (!chunk) {
    console.error(`No chunk "${chunkId}" in pass ${progress.pass}.`);
    process.exit(1);
  }
  chunk.status = "done";
  chunk.completedAt = todayIso();
  chunk.issuesFound = flags.issues !== undefined ? parseInt(flags.issues, 10) : 0;
  chunk.notes = flags.notes || null;
  saveProgress(progress);
  console.log(`Marked ${chunkId} done (${chunk.issuesFound} issue(s) found).`);

  const remaining = progress.chunks.filter((c) => c.status !== "done").length;
  if (remaining === 0) {
    console.log(`Pass ${progress.pass} is now fully complete — run "new-pass" when ready to start pass ${progress.pass + 1}.`);
  }
}

function cmdReset(chunkId) {
  if (!chunkId) {
    console.error("Usage: node scripts/audit.js reset <chunkId>");
    process.exit(1);
  }
  const progress = loadProgress();
  if (!progress) {
    console.error("No active audit pass.");
    process.exit(1);
  }
  const chunk = progress.chunks.find((c) => c.chunkId === chunkId);
  if (!chunk) {
    console.error(`No chunk "${chunkId}" in pass ${progress.pass}.`);
    process.exit(1);
  }
  chunk.status = "pending";
  chunk.startedAt = null;
  chunk.completedAt = null;
  chunk.issuesFound = null;
  chunk.notes = null;
  saveProgress(progress);
  console.log(`Reset ${chunkId} to pending.`);
}

function main() {
  const [, , command, ...rest] = process.argv;
  const flags = parseFlags(rest);
  const positional = rest.filter((a) => !a.startsWith("--"));

  switch (command) {
    case "status":
      cmdStatus();
      break;
    case "init":
      cmdInit(flags);
      break;
    case "new-pass":
      cmdNewPass(flags);
      break;
    case "next":
      cmdNext(flags);
      break;
    case "complete":
      cmdComplete(positional[0], flags);
      break;
    case "reset":
      cmdReset(positional[0]);
      break;
    default:
      console.error(
        "Usage:\n" +
          "  node scripts/audit.js status\n" +
          "  node scripts/audit.js init [--chunk-size=50]\n" +
          "  node scripts/audit.js next [--category=<id>] [--n=1]\n" +
          '  node scripts/audit.js complete <chunkId> [--issues=N] [--notes="..."]\n' +
          "  node scripts/audit.js reset <chunkId>\n" +
          "  node scripts/audit.js new-pass [--chunk-size=50] [--full]"
      );
      process.exit(command ? 1 : 0);
  }
}

main();
