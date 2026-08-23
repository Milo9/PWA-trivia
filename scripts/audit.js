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
//   node scripts/audit.js note <id> "<note>" [--remove]
//   node scripts/audit.js backlog
//   node scripts/audit.js append-orphans [--chunk-size=50]

const fs = require("fs");
const path = require("path");
const { normalizeAnswer, MIN_ANSWER_DUPLICATE_LENGTH } = require("./validate.js");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const CATEGORIES_FILE = path.join(DATA_DIR, "categories.json");
const AUDIT_DIR = path.join(ROOT, "audit");
const PROGRESS_FILE = path.join(AUDIT_DIR, "progress.json");
const HISTORY_DIR = path.join(AUDIT_DIR, "history");
const BACKLOG_FILE = path.join(AUDIT_DIR, "backlog.json");

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
// Answer-leak-via-option-length heuristic (CLAUDE.md "Answer-leak via
// option-length/format, not text"): the correct option is a full sentence
// while distractors are short names/phrases, so the answer is visually
// identifiable without any content knowledge. Thresholds copied from the
// tuned one-off grep in CLAUDE.md that found ~100+ corpus candidates this
// way — noisy in isolation, so treat every hit as a lead, not a verdict.
const ANSWER_LEAK_MAX_DISTRACTOR_LENGTH = 22;
const ANSWER_LEAK_MIN_ANSWER_LENGTH = 45;

// CLAUDE.md "Malformed options carrying leaked drafting reasoning, not a
// hedge": the drafting agent's own self-correction ends up verbatim in an
// option string ("Diminished fifth is same but answer is Augmented fourth").
// Distinct from check-draft.js's HEDGE_PATTERNS (meta-commentary read as an
// answer, e.g. "not given a specific name") — this never runs against
// shipped content since check-draft.js only sees pre-merge drafts. A bare
// "?" catches a leaked rhetorical aside; keep this list conservative (a lead,
// not a verdict) since a false positive costs review tokens.
const LEAKED_REASONING_PATTERN = /\bbut\b|\btrick\b:|\bis same\b|\?/i;

// CLAUDE.md "Stale record-holder / superlative claims": pin "the only X" /
// "the current largest X" to a time period so it doesn't silently become
// false later. Word list matches the corpus-grep CLAUDE.md already suggests
// for a manual spot-check (`as of|currently|current|tied with|record|most
// recent|latest|newest`) plus "only", called out by name in that same
// section — deliberately narrower than a generic superlative list (no bare
// "largest"/"highest"/"most") since those are usually timeless facts
// ("largest planet") rather than record claims that can be overtaken.
const UNPINNED_SUPERLATIVE_PATTERN =
  /\bonly\b|\bcurrently\b|\bcurrent\b|\btied with\b|\brecord\b|\bmost recent\b|\blatest\b|\bnewest\b/i;
const YEAR_OR_ASOF_PIN_PATTERN = /\bas of\b/i;
const YEAR_PATTERN = /\b(19|20)\d{2}\b/;

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

// id -> note. Holds things a chunk review found that can't be resolved on
// the spot (a duplicate whose sibling hasn't been reviewed yet, a fix that
// still needs applying) — previously only recorded as CLAUDE.md prose,
// which depends on a future session re-reading it at the right moment.
// `next` prints an id's note inline whenever that id appears in a chunk;
// `backlog` lists every entry regardless of chunk status, since an id whose
// chunk is already `done` will never be handed out by `next` again.
function loadBacklog() {
  if (!fs.existsSync(BACKLOG_FILE)) return {};
  return JSON.parse(fs.readFileSync(BACKLOG_FILE, "utf8"));
}

function saveBacklog(backlog) {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  const sorted = {};
  for (const id of Object.keys(backlog).sort()) sorted[id] = backlog[id];
  fs.writeFileSync(BACKLOG_FILE, JSON.stringify(sorted, null, 2) + "\n");
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

// Orphans: corpus ids that belong to no chunk in the CURRENT pass (any
// status — pending, in-progress, or done) and were never part of a `done`
// chunk in an archived pass either. This happens when a question is added
// to data/ after that category's pass manifest was frozen at init/new-pass
// time — see CLAUDE.md "Structural gaps in the audit passes". No `next`
// call will ever surface these on its own.
function computeOrphans(progress) {
  const categories = loadCategories();
  const reviewedIds = buildReviewedIdSet();
  const chunkIds = new Set();
  for (const c of progress.chunks) for (const id of c.ids) chunkIds.add(id);

  const byCategory = new Map();
  let total = 0;
  for (const cat of categories) {
    const orphanQs = loadCategoryQuestions(cat).filter(
      (q) => !chunkIds.has(q.id) && !reviewedIds.has(q.id)
    );
    if (orphanQs.length > 0) byCategory.set(cat.id, orphanQs);
    total += orphanQs.length;
  }
  return { total, byCategory };
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

  // Computed (and printed, below) before the empty-chunks early return: a
  // pass with 0 remaining chunks is exactly the state where a user is most
  // likely to add new questions next, which is exactly what creates
  // orphans — so this is the one status view that must not skip it.
  const orphans = computeOrphans(progress);
  const printOrphans = () => {
    if (orphans.total === 0) return;
    console.log(
      `\n${orphans.total} corpus question(s) are in no chunk of this pass and were never reviewed in ` +
        `a prior pass (added after this pass was initialized) — run "append-orphans" to fold them in.`
    );
    for (const [category, qs] of orphans.byCategory) {
      console.log(`  ${category.padEnd(24)} ${qs.length} orphan(s)`);
    }
  };

  if (progress.chunks.length === 0) {
    console.log(
      `\nNothing to review this pass — every question was already covered by a previous pass. ` +
        `Add more questions, or run "new-pass --full" to force a complete re-audit.`
    );
    printOrphans();
    return;
  }

  const pct = ((totalDone / progress.chunks.length) * 100).toFixed(1);
  console.log(`\nOverall: ${totalDone}/${progress.chunks.length} chunks done (${pct}%), ${totalIssues} issue(s) found this pass.`);
  if (totalDone === progress.chunks.length) {
    console.log(`Pass ${progress.pass} is complete — run "new-pass" to start pass ${progress.pass + 1}.`);
  }

  printOrphans();
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

// Same normalization validate.js uses (article/honorific stripping), plus
// one extra step specific to this audit index: strip a single trailing "s"
// (but not off a double-s ending like "glass") so a trivial singular/plural
// mismatch doesn't hide an otherwise-identical answer from the check.
// Confirmed 2026-08-07: "Public goods" (civics-law-economics-081) vs.
// "Public good" (civics-law-economics-216) are the same fact but never
// matched. Deliberately kept local to audit.js rather than changed in
// validate.js's own normalizeAnswer — that function is calibrated for a
// whole-corpus check with a group-size cap and overlap floor, where a looser
// key would reintroduce generic-entity noise; this index has neither cap
// (see below), so it can afford to be looser.
// Routing (global vs. per-category) is decided on the PRE-strip length, not
// the stripped key's length — an exactly-6-char answer ending in a
// strippable "s" ("Athens", "Naples") would otherwise drop from 6 to 5
// chars and get silently demoted from whole-corpus to per-category
// matching, losing legitimate cross-category matches (e.g. "Athens" in
// `geography` vs. `history`). buildAnswerIndexes and printAnswerMatches
// both call this and must route the same way, or a question's own lookup
// won't agree with how it was indexed.
function auditAnswerKey(text) {
  const base = normalizeAnswer(text);
  const key = base.replace(/(?<!s)s$/, "");
  return { key, isShort: base.length < MIN_ANSWER_DUPLICATE_LENGTH };
}

// Whole-corpus index keyed by the answer key above, no group-size cap and no
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
//
// Answers shorter than MIN_ANSWER_DUPLICATE_LENGTH are excluded from the
// global index (too generic whole-corpus — "Lima", "Ross", "5" would flood
// it with coincidental matches) but are still worth matching WITHIN a single
// category, where the false-positive rate is much lower. Those go in a
// separate per-category index instead of being dropped entirely (confirmed
// 2026-08-11: several backlog pairs — general-3788/general-4284 "Lima",
// friends-116/friends-227 "Ross" — exist only because the whole-corpus floor
// hid them).
function buildAnswerIndexes() {
  const categories = loadCategories();
  const global = new Map();
  const shortByCategory = new Map();
  for (const cat of categories) {
    for (const q of loadCategoryQuestions(cat)) {
      if (typeof q.answer !== "string") continue;
      const { key, isShort } = auditAnswerKey(q.answer);
      if (!key) continue;
      if (!isShort) {
        if (!global.has(key)) global.set(key, []);
        global.get(key).push(q);
      } else {
        const shortKey = `${q.category}::${key}`;
        if (!shortByCategory.has(shortKey)) shortByCategory.set(shortKey, []);
        shortByCategory.get(shortKey).push(q);
      }
    }
  }
  return { global, shortByCategory };
}

function printAnswerMatches(q, indexes) {
  if (!q || typeof q.answer !== "string") return;
  const { key, isShort } = auditAnswerKey(q.answer);
  if (!key) return;
  const group = isShort
    ? indexes.shortByCategory.get(`${q.category}::${key}`) || []
    : indexes.global.get(key) || [];
  const others = group.filter((other) => other.id !== q.id);
  if (others.length === 0) return;
  const shown = others.slice(0, MAX_ANSWER_MATCHES_SHOWN);
  for (const other of shown) {
    console.log(`    ^ same answer also used by ${other.id}: "${other.question}"`);
  }
  if (others.length > shown.length) {
    console.log(`    ^ ...and ${others.length - shown.length} more with the same answer (likely a generic/common one).`);
  }
}

// CLAUDE.md "Answer-leak via option-length/format, not text": the correct
// option reads as a full sentence while the distractors are short
// names/phrases, so the answer is identifiable from formatting alone. Prints
// a lead, not a verdict — a long correct answer next to short-but-plausible
// distractors isn't inherently wrong.
function printAnswerLeakWarning(q) {
  if (!q || !Array.isArray(q.options) || typeof q.answer !== "string") return;
  const distractorLengths = q.options.filter((o) => o !== q.answer).map((o) => o.length);
  if (distractorLengths.length === 0) return;
  const maxDistractor = Math.max(...distractorLengths);
  if (maxDistractor <= ANSWER_LEAK_MAX_DISTRACTOR_LENGTH && q.answer.length >= ANSWER_LEAK_MIN_ANSWER_LENGTH) {
    console.log(
      `    ! possible answer-leak: answer is ${q.answer.length} chars vs. longest distractor ${maxDistractor} chars`
    );
  }
}

// Same treat-as-a-lead framing as printAnswerLeakWarning: flags every option
// (including the correct answer) matching the leaked-reasoning pattern, since
// the leak can land in a distractor or the answer itself.
function printLeakedReasoningWarning(q) {
  if (!q || !Array.isArray(q.options)) return;
  for (const opt of q.options) {
    if (LEAKED_REASONING_PATTERN.test(opt)) {
      console.log(`    ! possible leaked reasoning in option: "${opt}"`);
    }
  }
}

// Flags a question+answer containing an unpinned superlative/exclusivity
// claim ("the only director to...", "the current record holder") with no
// "as of"/year anywhere to pin it to a point in time. Deliberately scoped to
// just the question stem and the correct answer, NOT the distractors — a
// wrong option is allowed to say things that aren't true/pinned ("Golden
// Record", "Only Charon locked" both fired false positives here during
// testing purely from incidental word choice in a distractor). A lead, not
// a verdict — plenty of hits will be fine on inspection (a historical
// "only" that's permanently true, e.g. "the only planet known to support
// life").
function printUnpinnedSuperlativeWarning(q) {
  if (!q || typeof q.question !== "string" || typeof q.answer !== "string") return;
  const haystack = `${q.question} ${q.answer}`;
  if (!UNPINNED_SUPERLATIVE_PATTERN.test(haystack)) return;
  if (YEAR_OR_ASOF_PIN_PATTERN.test(haystack) || YEAR_PATTERN.test(haystack)) return;
  console.log(`    ! possible unpinned superlative claim — check whether it needs an "as of"/year pin`);
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
  const answerIndexes = buildAnswerIndexes();
  const backlog = loadBacklog();
  const backlogReverseIndex = buildBacklogReverseIndex(backlog);

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
        printAnswerMatches(q, answerIndexes);
        printAnswerLeakWarning(q);
        printLeakedReasoningWarning(q);
        printUnpinnedSuperlativeWarning(q);
        if (backlog[id]) console.log(`    ! BACKLOG: ${backlog[id]}`);
        for (const { keyId, note } of backlogReverseIndex.get(id) || []) {
          console.log(`    ! BACKLOG (referenced by ${keyId}): ${note}`);
        }
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

function cmdNote(id, note, flags) {
  if (!id || (!flags.remove && !note)) {
    console.error('Usage: node scripts/audit.js note <id> "<note>"  (or --remove to delete an entry)');
    process.exit(1);
  }
  const backlog = loadBacklog();
  if (flags.remove) {
    if (!(id in backlog)) {
      console.error(`No backlog entry for "${id}".`);
      process.exit(1);
    }
    delete backlog[id];
    saveBacklog(backlog);
    console.log(`Removed backlog entry for ${id}.`);
    return;
  }
  backlog[id] = note;
  saveBacklog(backlog);
  console.log(`Saved backlog note for ${id}.`);
}

// The id a backlog note is filed under is always the ALREADY-REVIEWED
// survivor — that's inherent to when a note gets written (mid-review of
// that question, per CLAUDE.md "park a note with `node scripts/audit.js
// note <id> ..."), so its own chunk is done by construction and reporting
// that fact back is a no-op. What's actually useful is whether the
// *unreviewed sibling(s)* the note text talks about are reachable yet —
// so this pulls id-shaped tokens back out of the free-text note (they're
// always named in it, e.g. "duplicate of orphan space-astronomy-977").
// Deliberately does NOT filter by corpus membership here — callers need to
// tell "still in the corpus" apart from "already cut" (a token that no
// longer resolves to a real question means the note is likely resolved,
// not that there's nothing to check), so that check belongs at the call
// site, not baked into extraction.
function extractReferencedIds(noteText, keyId) {
  const matches = noteText.match(/\b[a-z][a-z0-9-]*-\d{3,}\b/gi) || [];
  const found = new Set();
  for (const m of matches) {
    const id = m.toLowerCase();
    if (id !== keyId) found.add(id);
  }
  return [...found];
}

// Reverse index: sibling id -> backlog notes that mention it. A note is
// filed under its (already-reviewed) key id, so `next` printing only on an
// exact key match (see cmdNext) means the note never resurfaces when the
// *sibling* it's actually about finally comes up in its own chunk — exactly
// the reversed-direction/duplicate case these notes exist to track. This
// lets `next` print the note under the sibling's own listing instead.
function buildBacklogReverseIndex(backlog) {
  const index = new Map();
  for (const keyId of Object.keys(backlog)) {
    const note = backlog[keyId];
    for (const refId of extractReferencedIds(note, keyId)) {
      if (!index.has(refId)) index.set(refId, []);
      index.get(refId).push({ keyId, note });
    }
  }
  return index;
}

// Same self-resolves-vs-needs-action distinction as printAnswerMatches'
// caller comment: a sibling in a pending/in-progress chunk will surface on
// its own via `next`'s same-answer auto-print when that chunk comes up; a
// sibling that's done, reviewed-but-unchunked, or a true orphan won't.
function classifyId(id, progress, reviewedIds) {
  const chunk = progress ? progress.chunks.find((c) => c.ids.includes(id)) : null;
  if (chunk) {
    if (chunk.status === "done") return `${id}: needs manual action (chunk ${chunk.chunkId} already done)`;
    return `${id}: will resurface via chunk ${chunk.chunkId} (${chunk.status})`;
  }
  if (reviewedIds.has(id)) return `${id}: needs manual action (reviewed in an earlier pass, no longer chunked)`;
  return `${id}: needs manual action (orphan — no chunk in any pass)`;
}

function buildAllCorpusIdSet() {
  const ids = new Set();
  for (const cat of loadCategories()) {
    for (const q of loadCategoryQuestions(cat)) ids.add(q.id);
  }
  return ids;
}

function cmdBacklog() {
  const backlog = loadBacklog();
  const ids = Object.keys(backlog);
  if (ids.length === 0) {
    console.log("Backlog is empty.");
    return;
  }
  // Loaded even with no active pass (progress stays null, classify still
  // works) so this command never hard-fails — it's meant to be safe to run
  // any time.
  const progress = loadProgress();
  const reviewedIds = buildReviewedIdSet();
  const allCorpusIds = buildAllCorpusIdSet();
  for (const id of ids) {
    console.log(`${id}: ${backlog[id]}`);
    const referenced = extractReferencedIds(backlog[id], id);
    if (referenced.length === 0) {
      console.log(`    [no other id token found in note text — read the note to see what still needs checking]`);
      continue;
    }
    for (const refId of referenced) {
      if (!allCorpusIds.has(refId)) {
        console.log(
          `    [${refId}: no longer in corpus (already cut) — remove with ` +
            `"node scripts/audit.js note ${id} --remove" after confirming no other sibling in this note still needs tracking]`
        );
      } else {
        console.log(`    [${classifyId(refId, progress, reviewedIds)}]`);
      }
    }
  }
  console.log(`\n${ids.length} backlog entr${ids.length === 1 ? "y" : "ies"}.`);
}

function cmdAppendOrphans(flags) {
  const progress = loadProgress();
  if (!progress) {
    console.error("No active audit pass.");
    process.exit(1);
  }
  const { total, byCategory } = computeOrphans(progress);
  if (total === 0) {
    console.log("No orphaned questions to append.");
    return;
  }
  const chunkSize = flags["chunk-size"] ? parseInt(flags["chunk-size"], 10) : progress.chunkSize;

  let appended = 0;
  for (const [category, qs] of byCategory) {
    const sorted = qs
      .slice()
      .sort((a, b) => (DIFFICULTY_RANK[a.difficulty] ?? 1) - (DIFFICULTY_RANK[b.difficulty] ?? 1));
    const existingCount = progress.chunks.filter((c) => c.category === category).length;
    for (let i = 0; i < sorted.length; i += chunkSize) {
      const slice = sorted.slice(i, i + chunkSize).map((q) => q.id);
      const chunkIndex = String(existingCount + Math.floor(i / chunkSize)).padStart(3, "0");
      progress.chunks.push({
        chunkId: `${category}-p${progress.pass}-${chunkIndex}`,
        category,
        ids: slice,
        status: "pending",
        startedAt: null,
        completedAt: null,
        issuesFound: null,
        notes: null,
      });
      appended += slice.length;
    }
  }
  progress.totalQuestions += appended;
  progress.totalCorpusQuestions = (progress.totalCorpusQuestions || 0) + appended;
  saveProgress(progress);
  console.log(
    `Appended ${appended} orphaned question(s) across ${byCategory.size} categor${byCategory.size === 1 ? "y" : "ies"} as new pending chunks.`
  );
  printStatus(progress);
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
    case "note":
      cmdNote(positional[0], positional[1], flags);
      break;
    case "backlog":
      cmdBacklog();
      break;
    case "append-orphans":
      cmdAppendOrphans(flags);
      break;
    default:
      console.error(
        "Usage:\n" +
          "  node scripts/audit.js status\n" +
          "  node scripts/audit.js init [--chunk-size=50]\n" +
          "  node scripts/audit.js next [--category=<id>] [--n=1]\n" +
          '  node scripts/audit.js complete <chunkId> [--issues=N] [--notes="..."]\n' +
          "  node scripts/audit.js reset <chunkId>\n" +
          "  node scripts/audit.js new-pass [--chunk-size=50] [--full]\n" +
          '  node scripts/audit.js note <id> "<note>" [--remove]\n' +
          "  node scripts/audit.js backlog\n" +
          "  node scripts/audit.js append-orphans [--chunk-size=50]"
      );
      process.exit(command ? 1 : 0);
  }
}

main();
