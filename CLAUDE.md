# CLAUDE.md

Instructions for Claude working in this repo. For schema, project layout,
and the full add-a-batch workflow, **read README.md first** — this file
only covers what the README doesn't (behavioral rules and hard-won
lessons, not documentation, and not a batch-by-batch changelog — that's
what `git log` is for).

## Always ship after making changes — once per batch, not per edit

Once a logical unit of work is done — a whole batch merge, a whole audit
session covering however many chunks fit in one sitting — run:

```
npm run ship -- "commit message"
```

**Ship once at the end of that unit of work, not after each individual
file edit, fix, or chunk within it.** Shipping is not free (it bumps the
build number and the offline cache version, and creates a commit+push)
— running it multiple times for what's really one session of work
creates version churn and commit noise the user explicitly doesn't want
(confirmed 2026-08-05 after an audit session shipped once for a single
question fix and again just to record chunk-completion bookkeeping —
two commits for one chunk's worth of work). Accumulate changes — data
fixes, `audit/progress.json` updates, whatever else — and let one `ship`
call at the end pick up everything via its `git add -A`.

Do not leave changes staged/uncommitted at the *end* of a session, and
do not run `git add` / `git commit` / `git push` manually — `ship`
bundles validate → bump version → stamp cache → add → commit → push in
the right order, and skipping steps (e.g. committing without stamping)
means phones won't pick up new content. Write the commit message yourself based on the
actual diff; `ship` won't do that part for you.

If `npm run validate` fails, fix the reported errors before shipping —
don't bypass it.

**`ship` runs `git add -A`, which stages the *entire* working tree, not
just the files you changed.** Before running `ship`, run `git status`
yourself and check for any pre-existing untracked/modified files that
aren't part of your current change — `ship` will silently sweep them
into the same commit otherwise. (This has already happened once: a
misplaced draft batch sitting in `templates/` got swept into an
unrelated commit and needed a follow-up fix.) If you find stray files
like this, deal with them (move, delete, or otherwise resolve) *before*
shipping your actual change, not after.

## Prefer token-efficient sequential work over parallelized speed

The user prioritizes token efficiency over wall-clock speed in this
repo. Default to doing multi-step work (drafting, classifying,
reviewing, deduping) as a single sequential pass — inline, or with one
`advisor()` check before committing to an approach — rather than
fanning out across multiple parallel subagents or forks. Parallelizing
trades more total tokens for less wall-clock time: each additional
fresh agent re-derives context from scratch (no cache sharing), and
even forks (which do share cache) add their own reasoning/output
overhead plus a merge/reconciliation step the sequential version
doesn't need.

Only reach for parallelism when something *other* than speed
specifically requires it — e.g. independent, no-shared-context agents
classifying the same content into categories, so no single agent's
choices bias the next. Even then, use the minimum parallelism that gets
that specific benefit, and only while there's no established rule set
yet to apply sequentially — once tie-break rules for a classification
task are written down, a single sequential pass can usually apply them
just as cleanly as N parallel agents could. See "Large batches
parallelized via fork agents need one merge-gate, not many" below for
how to parallelize *safely* when wall-clock speed genuinely is the
binding constraint — that's the exception, not the default.

## Adding question batches

- Follow the exact schema and process in README.md ("Adding a new batch
  of questions"). Don't re-derive it from scratch each session.
- IDs must be unique **across the whole dataset**, not just the file —
  check the highest existing number in that category (`npm run
  validate`'s per-category counts, or grep the file) before picking the
  next batch's range. IDs have gaps from past dedup passes (deleted
  entries were not renumbered) — check the highest number, not the
  file's entry count.
- **`general`-derived categories have two ID namespaces per file, and
  that's fine.** The 2026-08-01 split of `general` moved existing
  `general-NNNN` questions into new category files (`history.json`,
  `geography.json`, etc.) *without* renumbering them — those entries
  kept their original `general-NNNN` id even though `category` now says
  `history`/`geography`/etc. `id` prefix matching `category` is a
  convention, not something `validate.js` enforces (`ID_PATTERN` only
  requires `<letters/digits/hyphens>-<3+ digits>`, globally unique).
  **New** questions drafted for one of these categories get a fresh,
  category-prefixed sequence starting at `<category>-001` — don't
  continue the old `general-` numbering, and don't be confused by
  `analyze.js`'s `nextId()` suggesting something odd for these files (it
  just takes the max trailing digits in the file regardless of prefix,
  so a file mixing `general-1867` and `history-004` will suggest
  `history-1868` — ignore the number, keep the category prefix and pick
  the next number after the highest ID that *already* uses that prefix
  in that file). Every `general`-derived category also carries a
  `"dupeGroup": "general"` in `categories.json` — see "Duplicate
  detection: what the tools catch and what they miss" below for why
  that matters.
- Warnings from `validate` about near-duplicate questions are judgment
  calls, not automatic failures — only fix ones that are actually the
  same question reworded.
- Before merging any drafted batch into `data/`, run `npm run
  check-draft -- <path-to-draft.js>` on it, **and** `... --
  --full-answer-audit` (see README and the tools section below — the
  default pass alone reliably misses a large fraction of real
  duplicates). See README for the draft file format and full workflow.
- **Check that an inbox file actually parses before running
  check-draft on it.** An external agent's draft can contain invalid
  JS/JSON (e.g. unescaped quotes inside a `question` string) that makes
  `require()` throw — that failure looks identical to "no file yet" at
  a glance, so confirm it loads before concluding there's nothing to
  process.

## External-agent drafting: avoiding convergent duplicate topics

`templates/` holds one fully self-contained, ready-to-copy-paste prompt
file per category (`templates/<slug>.md`), for handing batch-drafting to
an AI agent with no context of this repo. **Each category file is
copy-paste content only — it has no instructions aimed at the user or at
Claude, just the prompt itself.** (`templates/README.md` is the one
exception — it's an index with picking instructions, not a prompt.)
Claude maintains the per-category files directly; the user never edits
them or assembles a prompt from pieces — they pick a category's file
and copy the whole code block as-is.

External agents draw on roughly the same slice of general/training
knowledge any other agent — or a memory-only Claude draft — would, so
different agents (and repeat runs of the same one) tend to converge on
the same well-known chestnuts. Drafts should self-declare a `"category"`
field matching `data/categories.json` (every current template's prompt
already requires this); `id` stays excluded since that depends on the
current max ID at merge time, which the external agent can't know.

**Don't front-load the prompt with the full corpus or a guessed topic
list** — expensive in tokens for a payoff that's mostly speculation
before you've seen what an external agent actually collides on. Instead,
each category's prompt has its own `AVOID THESE ANGLES` list baked in,
maintained iteratively, and **that list — inside `templates/<slug>.md`
itself — is the single copy.** Don't duplicate it here or anywhere else:

1. After reviewing an inbox batch (i.e. after running `check-draft.js`
   and `validate` against it), note the **topic/angle** — not the
   literal question wording — behind every confirmed duplicate (e.g.
   "chemical symbol for tungsten," not the exact phrasing of the
   question that asked it).
2. Edit that category's `AVOID THESE ANGLES` list directly, in place, in
   `templates/<slug>.md`. Don't touch other categories' files.
3. If a category's list grows past ~30–40 entries, prune it: drop angles
   too specific to plausibly recur, and keep the ones that show up
   repeatedly across batches (e.g. "SI unit of X," "chemical symbol for
   Y" — categories of chestnut, not just one-off facts).

### Duplicate patterns the automated checks routinely miss

Every inbox batch processed so far has needed a manual read on top of
`check-draft.js`, because these patterns don't reliably trip its
thresholds. Observed duplicate rates across batches have ranged from
~3% to ~48% depending on how chestnut-heavy the category and how
generic the drafting angle — **a clean `check-draft.js` pass is not
proof of a clean batch**, especially for categories built mostly of
superlatives or "most famous work by X" framings (geography, film-tv,
arts-literature have all hit this hardest). Watch for:

- **Same fact, reworded past the text/answer-overlap thresholds.** The
  existing corpus often phrases a fact with an added epithet ("the
  dystopian novel," "the elongated canine tooth") that keeps both
  question-text overlap and answer-text overlap just under the
  automatic cutoffs. A targeted corpus grep for the draft's distinctive
  nouns (species names, work titles, place names) catches these when
  `--full-answer-audit` doesn't. **This isn't just an entity-heavy-category
  problem** (film-tv, arts-literature, mythology) — a plain "general
  facts" category (unit conversions, board-/card-game rules, scale
  definitions) hits it just as hard, often worse, since these facts have
  no distinctive proper noun for `--full-answer-audit`'s answer-matching
  to key off and default to near-zero question-text overlap purely from
  short, generic phrasing ("How many X are in a Y?"). Confirmed
  2026-08-07: a `general` batch's own check-draft pass flagged ~30
  likely/near-duplicates, but a follow-up grep for distinctive terms
  (firkin, hogshead, jigger, troy ounce, smoot, Boggle, doubling cube,
  mondegreen, ...) surfaced ~20 *additional* confirmed duplicates that
  check-draft never flagged at all — for a category this saturated,
  budget for a manual grep pass even after a clean-looking check-draft
  run, not just for categories built on famous names/titles.
- **Same fact restated with a different specific number or unit**
  (e.g. "over 240 mph" vs. "320 km/h / 200 mph" for the same "fastest
  diving bird" record) — still one duplicate, not two complementary
  facts, unless the specific number is itself what's being tested.
- **Reversed-direction duplicates**: an existing question describes an
  ingredient/process and asks for the name, while a new question names
  the thing and asks for the ingredient/process (or vice versa — same
  pattern as the README's Robin Hood/archery example). These can't be
  linked by answer-text matching at all, since the answer text differs
  completely in each direction.
- **Premise-reveals-the-answer duplicates**: an existing question's own
  wording already states a fact as background while asking about
  something else — a *new* question that asks for that background fact
  directly is redundant even though the two nominally test different
  things (e.g. an existing question names "Jack Woltz" while asking
  about the horse's head; a new question asking who wakes up with the
  horse's head is answered by the first question's premise).
- **Shared answer isn't always a duplicate signal, and lack of a shared
  answer isn't always safety.** A shared *artist/author* alone is not a
  duplicate (Picasso, Michelangelo, etc. can correctly have many
  distinct questions about different named works) — only a shared
  *specific named work* is. Conversely, two facts about the *same named
  entity* that are genuinely different quantities (SI unit of magnetic
  flux vs. flux density; who developed C vs. C#) are not duplicates
  despite the surface pattern match.
- **Draft-vs-draft duplication within a single batch**, including
  outright identical questions from a drafting agent doing two rewritten
  passes over the same topics. `check-draft.js` catches exact/near
  question-text repeats via `findInternalDuplicates` by default now
  (see tools section below), but near-identical-but-not-identical answer
  strings ("Acadia" vs. "Acadians") still need a manual read.
- **Cross-category duplicates that straddle a shallow "general-ish"
  category and a deep dedicated one.** Both `check-draft.js` and
  `validate.js` compare within `dupeGroup ?? category`, which is correct
  for avoiding false positives on coincidental cross-category answer
  reuse — but means a genuine duplicate straddling e.g. `film-tv` and
  `big-bang-theory` (or `mythology-religion`) won't surface
  automatically. Check by hand whenever a general-category draft touches
  Friends/Big Bang Theory characters or a mythology/legend fact that has
  its own dedicated category.
- **Multi-file merges need one union pass, not one check-draft run per
  file.** See "Large batches parallelized via fork agents" below.

Even after all of the above, budget for a residual duplicate rate
(~5% on one large multi-file merge) that only surfaces by reading
question+answer pairs side by side — the checks narrow the problem,
they don't finish it. Dumping a draft as one `index | answer | question`
line per entry is the cheapest way to eyeball a single file for internal
repetition:

```
node -e "require('<path-to-draft.js>').forEach((q,i)=>console.log(i,'|',q.answer,'|',q.question))"
```

### Factual-error patterns worth verifying, not just deduping

Several inbox batches have shipped confident-sounding but wrong facts
that duplication checks can't catch — verify via `WebSearch` rather than
trusting recall, especially for "hard"-difficulty/obscure specifics
(exact incorporation years, discontinuation dates, record holders):

- **Distractor-correctness bugs**: a "wrong" option that's secretly also
  true (e.g. a scientific-name synonym offered as the incorrect answer;
  two options that are both currently-active/both-true at once, like two
  "current" Mars rovers or two spacecraft that both returned asteroid
  samples).
- **Genuine real-world ambiguity, not just obscurity** — a sub-flavor of
  the above worth checking for separately, since it isn't about digging
  harder into one suspicious option: some questions have more than one
  common-knowledge-correct answer among their own options, and different
  drafting sessions independently pick different ones as "the" answer.
  Confirmed 2026-08-07: a drafted "which small country borders both
  France and Germany?" marked Switzerland correct with Luxembourg as a
  distractor — but Luxembourg *also* genuinely borders both, and the
  already-shipped corpus has a nearly identical question with Luxembourg
  marked correct instead. Neither question is "wrong" in isolation; the
  bug is that the option set doesn't uniquely determine an answer. Cut
  rather than pick a side, unless the option set can be narrowed to
  exclude all-but-one true answer.
- **Malformed options carrying leaked drafting reasoning, not a hedge.**
  Distinct from the hedge/meta-answer pattern check-draft.js's regex
  already catches (`not (a|given|shown|part of|really|actually)`) — this
  is the drafting agent's own self-correction or chain-of-thought ending
  up verbatim in an option string instead of a clean answer, e.g.
  `"Diminished fifth is same but answer is Augmented fourth"` or
  `"Alto is not lowest? Contralto is lower than alto in classical"` used
  as a distractor. Confirmed 2026-08-07 (3 instances in one `music`
  batch, none caught by check-draft's hedge regex). A quick signal: an
  option containing " but ", "trick:", "is same", or a `?` is almost
  always this pattern, not a real answer — fix by replacing it with a
  clean wrong option (don't try to salvage the leaked reasoning).
- **Named-thing confusion**: probe vs. mission name, one entity's
  attribute wrongly generalized to a whole category (e.g. calling a
  layer "outermost" when a further layer exists), or an anachronistic
  detail (a product name applied before it actually existed).
- **Stale record-holder / superlative claims**: "the only president to
  serve non-consecutive terms," "the current largest X" — pin these to a
  time period ("as of the mid-2020s," "the first," rather than "the
  only") so they don't silently become false later. A corpus grep for
  `as of|currently|current|tied with|record|most recent|latest|newest`
  is a cheap way to spot-check a category for unpinned claims.
- **Self-answering / tautological questions**: a question whose only
  in-universe answer is a name already given in the question stem —
  unfixable without changing the underlying fact, so cut rather than
  reword.
- **Fill-in-the-blank sentence fragments instead of real questions.**
  Every question in this corpus is phrased as a direct interrogative
  ending in `?` — reformat rather than ship or cut a batch that uses a
  different style.
- **Answer-leak via option-length/format, not text.** The correct
  option is a full explanatory sentence while the distractors are short
  names/phrases (e.g. answer "Northern harrier uses facial disk like
  owl" next to distractors "Bald eagle" | "Vulture" | "Kite") — the
  answer is visually identifiable from formatting alone, without any
  content knowledge. Neither `validate.js` nor `check-draft.js` checks
  option-length balance. Fix by trimming the correct option down to the
  same style/brevity as the distractors (move any extra explanatory
  detail into nothing — just cut it, don't relocate it into the
  question stem unless the stem was actually wrong, per the animals-nature
  case below). Confirmed 2026-08-05 in animals-nature (9 instances,
  IDs 6xx-7xx, one drafting batch) during an audit chunk; a corpus-wide
  length-ratio grep afterward found ~100+ more candidates spread across
  world-cultures, big-bang-theory, friends, business-brands, and
  general, meaning this isn't isolated to one batch — it's a systemic,
  never-checked pattern worth a dedicated pass. Rough finder (tune the
  ratio/length cutoffs — noisy at default settings, needs a manual read
  per hit since a long correct answer isn't inherently wrong, only a
  long answer next to conspicuously short distractors is):
  ```
  node -e "
  const fs=require('fs'),path='data/questions';
  for(const f of fs.readdirSync(path)){
    const qs=JSON.parse(fs.readFileSync(path+'/'+f));
    for(const q of qs){
      if(!q.options) continue;
      const a=q.answer.length, others=q.options.filter(o=>o!==q.answer).map(o=>o.length);
      if(others.length && Math.max(...others)<=22 && a>=45) console.log(f, q.id, '|', q.answer);
    }
  }"
  ```

After merging, **always re-run `npm run validate` before shipping**,
even after a careful manual review pass — it's free, and it catches
cases where a planned cut didn't actually make it into the executed
merge. **This includes after rewording a question to fix an answer-leak
or malformed option** — a rewrite is new text that has never been
checked against the corpus, and can coincidentally collide with existing
phrasing even though the original leaky draft didn't. Confirmed
2026-08-07: a leak-fix rewording ("What key is Mozart's Symphony No. 40
written in?") landed as a near-verbatim duplicate of an existing
question ("...K. 550, composed in?") that the original draft's check
never flagged, because the leaky original was phrased differently.

**When scanning `validate`'s output, don't just grep for the error
count and stop** — `0 error(s)` only means nothing is schema-broken.
The `! Same answer (...), low word-overlap` and `! Possible
near-duplicate` warning lines are real signal for exactly the
same-fact-reworded pattern this whole section is about, and a
freshly-introduced one is easy to miss inside a few hundred pre-existing
warnings if you only check the summary line. The Mozart duplicate above
was actually printed by `validate` (at 0.56 overlap) on the same run
that reported `0 error(s)` — it surfaced only because the full output
happened to get read anyway, not because the workflow called for
reading it. Prefer grepping the fresh warning output for your batch's
new ID range (or the specific answer/entity you just touched) over
grepping only for `error(s)`.

## Duplicate detection: what the tools catch and what they miss

- **`validate.js` and `check-draft.js` group questions by normalized
  correct answer**, not just question-text overlap — this is what
  catches "same fact, different wording" pairs (the Robin Hood/archery
  case). The discriminator that separates signal from noise is **how
  many questions share that exact answer**: `MAX_ANSWER_GROUP_SIZE = 2`
  means an answer shared by more than 2 questions is treated as a
  generic reused entity (Shakespeare, Thomas Jefferson) and skipped
  entirely, even if some of those questions genuinely are duplicates of
  each other. `SAME_ANSWER_MIN_OVERLAP = 0.55` additionally requires
  some minimum text overlap before flagging a same-answer pair, to
  suppress coincidental generic-entity reuse. **Known consequence:** a
  narrow, specific answer that happens to be drafted 3+ times across
  separate sessions will never get flagged by this check — this is a
  real gap in the group-size cap, not a bug to "fix" by lowering the
  cap (that would reintroduce generic-entity noise). Treat a
  suspiciously popular specific answer as worth a manual grep regardless
  of what `validate` reports.
- **The same-answer grouping keys off exact normalized answer text, so a
  trivial singular/plural (or other superficial wording) mismatch
  between two otherwise-identical answers hides the pair from the check
  entirely** — not just an edge case of the group-size-cap gap above,
  but a separate, more basic miss. Confirmed 2026-08-07 in
  civics-law-economics audit pass 1: `civics-law-economics-081`
  ("non-excludable and non-rivalrous... national defense or street
  lighting" → "Public goods") and `civics-law-economics-216`
  ("non-excludable and non-rivalrous... national defense" → "Public
  good") are the same fact with the same example, but "Public goods" vs
  "Public good" never matched as the same answer. Worth a manual eye
  whenever a question's answer is a common noun that could plausibly be
  drafted singular in one pass and plural in another (goods/services,
  effects, laws, etc.), since this class of near-miss won't show up in
  `validate`'s or `check-draft.js`'s output at all.
- **"Where is [org] headquartered?" questions are a concentrated,
  recurring instance of the group-size-cap gap above, specific to
  civics-law-economics.** A city that hosts many international
  organizations (Geneva, Vienna, Paris, Brussels) legitimately racks up
  a large same-answer group of genuinely distinct questions — but the
  same real-world clustering also means the *same* organization's
  headquarters gets independently redrafted 2-6 times across different
  sessions/chunks, and each redraft's group lands well past
  `MAX_ANSWER_GROUP_SIZE = 2` (so `validate` never flags it) while also
  varying enough in phrasing/option-order to dodge the near-duplicate
  text check. Confirmed 2026-08-07 in audit chunk p1-012: a single
  corpus-wide grep grouping by exact answer text (see snippet below)
  turned up UNESCO-in-Paris asked 6 separate times, Arab League-in-Cairo
  4 times, ICJ-at-The-Hague 4 times, FAO-in-Rome and BIS-in-Basel 3
  times each, OECD-in-Paris twice — an 18-question cluster nobody had
  caught across several already-completed audit chunks. The same
  grouping also caught a handful of generic legal-term duplicates by the
  same mechanism (Tort defined 3x, Bail defined 3x). When keeping one
  survivor from a cluster like this, prefer the version with a genuinely
  distinctive extra detail (e.g. "at the Peace Palace," "the Y-shaped
  building at Place de Fontenoy") over the plainest phrasing — it's
  better trivia, not just a tie-break. Any chunk in this category that
  touches an IO-headquarters or common-noun-legal-term question is worth
  a proactive full-corpus regroup, not just a same-chunk check:
  ```
  node -e "
  const qs = require('./data/questions/civics-law-economics.json');
  const map = {};
  for (const q of qs) (map[q.answer.trim().toLowerCase()] ??= []).push(q);
  for (const k in map) if (map[k].length >= 3) {
    console.log('===', k, '('+map[k].length+')');
    map[k].forEach(q => console.log(' ', q.id, '|', q.question));
  }"
  ```
  Read every group's questions before cutting — a shared city/answer is
  only a duplicate when it's also the *same organization or concept*
  (Geneva hosting seven different named agencies is not a duplicate
  cluster; Paris hosting UNESCO six separate times is).
- **`dupeGroup` (in `categories.json`) widens the same-answer check
  beyond a single category.** Every `general`-derived category carries
  `"dupeGroup": "general"`, so the whole former-`general` bucket is
  still checked against itself as one group even though its questions
  now live in separate category files — without this, a same-answer
  pair that used to both be `general` and got split across e.g.
  `history` and `geography` would silently stop being checked at all.
- **`check-draft.js`'s draft-vs-draft pass (`findInternalDuplicates`)**
  runs by default against a single draft file's own contents (not just
  draft-vs-corpus) — this exists because a drafting agent doing two
  rewritten passes over the same topics can ship exact duplicates that a
  draft-vs-corpus-only check would never see. Its answer-index check
  also drops the `SAME_ANSWER_MIN_OVERLAP` floor specifically for
  draft-vs-draft comparisons (unlike the draft-vs-corpus branch, which
  keeps it) — at single-batch scale, a shared specific answer is a much
  stronger duplicate signal than at whole-corpus scale, since there's
  far less opportunity for coincidental reuse. `GENERIC_ANSWER_KEYS`
  (e.g. "all of the above") is excluded from this so dropping the floor
  doesn't make every unrelated generic-answer pair look linked. This
  pass still only compares a single file against itself — see "one
  merge-gate, not many" below for multi-file merges.
- **`--full-answer-audit`** (`npm run check-draft -- <file>
  --full-answer-audit`) prints every draft answer's complete corpus
  match list with no threshold applied, for manual eyeballing. Use it
  whenever a batch leans on well-known/iconic subjects, since the
  default check's thresholds are specifically what let ~41% of one such
  batch (generic "who directed/played/composed famous-film-X" chestnuts)
  through undetected.

## Large batches parallelized via fork agents need one merge-gate, not many

When splitting a big batch across multiple forks on disjoint topic
buckets, forks can't see each other's drafts, so cross-fork duplication
(not fork-vs-existing-corpus) becomes the real risk. Fix: each fork
writes to its own scratch file with a non-colliding placeholder ID
range, and `check-draft.js`'s dedup/validation gate runs exactly once
against the concatenated union of all forks' output before anything
gets real IDs and gets merged — not once per fork.

**The same principle applies to sequentially processing multiple
pre-existing files, not just parallel forks.** Build one union draft
(each entry tagged with source file + original index) and run
`check-draft.js` against that union — running it once per file still
leaves cross-file duplication uncaught, since each run only sees its own
file against the corpus.

**Cross-file merges concentrate reversed-direction duplicates
specifically, because each source file tends to be internally consistent
in phrasing direction.** A single drafting agent asked for "who
wrote/painted X" questions will phrase (almost) all 100 of them that way;
a different agent — or the same one on a separate run — asked for
"which [author]'s work is X" will phrase all of *its* 100 the other way.
Where both files happen to draft the same famous work, that's a real
duplicate, but the two questions' answers are completely different
strings (an author's name vs. a work's title), so `check-draft.js`'s
union run — even with `--full-answer-audit` — can't catch it; only a
manual read of the full union dump (per-entry `index | answer |
question`) does. On one two-file arts-literature merge, this pattern
alone accounted for more cuts (8) than the union check's own same-answer
advisories caught (3) — budget for a full manual read on every
multi-file merge, not just single-file batches leaning on iconic
subjects.

**This union-pass requirement is specifically for multiple files landing
in the *same* category.** A batch of multiple inbox files for
*different* categories doesn't need a union draft — process them
sequentially, one file fully checked-and-merged into `data/` before the
next file's `check-draft` run starts. `check-draft.js` always reads the
live on-disk corpus, so merging file N before checking file N+1 is what
makes `dupeGroup`-scoped cross-category duplication (see below) get
caught correctly; checking all N files against the corpus in parallel
first and merging after would miss duplicates *between* those inbox
files the same way a same-category union problem would. Confirmed
2026-08-07 processing 5 different-category inbox files (arts-literature,
general, geography, music, mythology-religion, all sharing
`dupeGroup: "general"`) sequentially this way — no cross-file leakage
found on the final `validate` pass.

## Auditing existing questions for accuracy

Separate from dedup (covered above): a resumable, chunked pass over the
*whole shipped corpus* checking for hallucinated facts, wrong distractors,
answer-leaks, and the other patterns in "Factual-error patterns worth
verifying, not just deduping" above — nothing in the normal add-a-batch
flow ever re-checks a question's factual correctness once it's merged.
Tracked by `scripts/audit.js` (see README's "Auditing existing questions
for accuracy" for the command reference). Rules specific to running a
chunk:

- **Always pull work via `node scripts/audit.js next`, not by picking
  questions yourself.** The tracking state is only meaningful if it's the
  single source of truth for what's been reviewed.
- **Review every question in the chunk, including ones that look
  obviously fine.** The entire value of this system is exhaustive
  coverage over many sessions — spot-checking defeats the point and
  produces a false sense of a "clean" pass.
- **For every question, explicitly check the three wrong options, not
  just the marked answer.** Confirming "yes, the stored answer is
  correct" is the cheap 80% of a read-through and will happen by
  default; confirming "and none of the three distractors are *also*
  defensible" takes deliberately asking the question per option and
  won't happen unless you make it its own step. This is the single
  highest-value check per CLAUDE.md's "Factual-error patterns worth
  verifying" list (distractor-correctness bugs) precisely because it's
  the one a passive read skips.
- Beyond that, apply the rest of the same checklist a pre-merge draft
  gets ("Factual-error patterns worth verifying, not just deduping"
  above): named-thing confusion, stale record-holder claims,
  self-answering stems, plus (new for already-shipped content, since it
  didn't go through `check-draft.js`) answer-leak and duplicate checks
  too — a chunk can surface things a pre-merge check would have caught
  if the batch predates that check being added.
- **`next` auto-prints same-answer corpus matches under each question**
  (`^ same answer also used by <id>: "…"`) — a whole-corpus, no-cap,
  no-overlap-floor answer-text index (mirrors `check-draft.js`'s
  `--full-answer-audit`, deliberately looser than `validate.js`'s own
  same-answer check, which is calibrated to suppress noise and — as a
  documented tradeoff — misses real duplicates once phrasing differs
  enough; confirmed 2026-08-05 on a real pair, "general-2907"/
  "animals-nature-163", both answering "A .22 caliber bullet" for the
  same mantis-shrimp fact, that scored only 0.22 question-text overlap
  against a 0.55 floor). Treat every line it prints as a lead to check,
  not an automatic verdict — most will be coincidental reuse of a common
  answer (a country, a number), and it only catches *identical* answer
  text, not a reversed-direction or same-fact-different-wording
  duplicate (e.g. "Radial sesamoid" vs "An enlarged wrist bone" for the
  same panda pseudothumb fact) — those still need your own judgment,
  same as always.
- **When you confirm a duplicate, grep the whole corpus for the shared
  distinctive term/entity before fixing, not just the pair you found.**
  `validate.js`'s own same-answer check caps out at group size 2 and
  skips anything bigger — a specific answer independently drafted 3+
  times is invisible to every automated check, including the one above
  (its per-question loop still only ever compares one question at a
  time against the rest of the corpus, so it won't itself notice that
  two of its own hits are ALSO duplicates of each other). Confirmed
  2026-08-05: an incidental match while reviewing an unrelated question
  turned up three separate near-identical "first country to grant women
  the right to vote" questions (`general-061`, `general-1883`,
  `history-056`), all answering "New Zealand" — a real triplicate that
  had been sitting undetected. A plain grep for the shared term across
  every category file is cheap (no LLM reasoning needed) and catches
  this class of gap directly.
- **Convergent-duplicate chestnuts aren't just a drafting-time risk
  (see "External-agent drafting" above) — they show up between chunks
  of the SAME already-shipped category too**, when two different
  drafting sessions independently reached for the same viral/listicle
  fact. `animals-nature` hit this hard in pass 1: "immortal jellyfish
  reverts to a polyp," "aye-aye taps wood to find grubs," "panda's
  pseudothumb is an enlarged wrist bone," "mantis shrimp punch ≈ a .22
  bullet," and "beaver teeth are orange from iron" each showed up twice,
  usually in reversed direction (cause↔effect) or with different
  specificity, which is exactly what dodges both `validate.js`'s
  same-answer check and the near-duplicate text check. Categories built
  from "surprising/hard fact" style drafting (nature, science, space)
  are the likeliest place to hit this again — extra vigilance there,
  specifically for whether a question's core *fact* (not just its
  wording) rings a bell from an earlier chunk in the same category.
- Default to judgment/memory; reach for `WebSearch` only for genuinely
  uncertain or hard-difficulty specific claims. Verifying all ~14,000
  questions via search would be prohibitively expensive and isn't the
  point — most questions are obviously fine on a read-through.
- Fix directly in `data/questions/<category>.json` (or cut, per the
  existing "unfixable without changing the underlying fact" guidance).
  Run `npm run validate` after each chunk's fixes to catch problems
  early, but **don't `ship` per chunk** — see "Always ship after making
  changes" above. Call `audit.js complete <chunkId> --issues=N
  --notes="…"` right after finishing each chunk (it only edits
  `audit/progress.json` locally, no commit/push), then keep going to the
  next chunk.
- **Ship once at the end of the session**, after however many chunks got
  reviewed — one `npm run ship -- "…"` picks up every fixed question
  plus every chunk's `audit/progress.json` update in a single commit.
  Summarize what the session covered (chunk ids, issue counts) in the
  commit message.
- If a chunk is too big to finish in one sitting, just stop mid-review —
  it stays `in-progress` and the next `next` call re-surfaces the same
  chunk rather than skipping ahead to a fresh one.
- A pass's chunk membership is frozen at `init`/`new-pass` time (sorted
  hard-difficulty-first per category, then split into fixed-size
  chunks). Don't try to "rebalance" chunks mid-pass by hand-editing
  `audit/progress.json` — if chunk size turns out wrong for a category,
  fix it going forward via `--chunk-size` on the *next* pass rather than
  reshaping the current one.

## Known backlog / do-not-re-flag

Settled judgment calls — don't re-litigate these as bugs if they
resurface at the top of a future near-duplicate or same-answer sort:

- `general-492`/`general-1857` (largest vs. second-largest country by
  land area), `general-1375`/`general-2046` (rugby union vs. rugby
  league try point value), `friends-184`/`friends-627` (Ross's marriage
  count vs. divorce count — both three, a real running joke),
  `big-bang-theory-122`/`big-bang-theory-532` (different actors playing
  young vs. adult Mary Cooper) — high text/answer similarity, genuinely
  different facts.

Open items for a future dedicated pass:

- **Magellan 4-way cluster**: `general-465`, `general-750`,
  `general-1038`, `general-1882` are four near-identical circumvavigation
  questions all answering "Ferdinand Magellan." None of the pairwise
  combinations reach the near-duplicate threshold and the group-size cap
  (see above) skips groups of this size — a real gap, not something a
  routine `validate` run will ever surface. Needs a manual pick of the
  best-worded survivor.
- `general-2045` ("most men's major championship victories in golf
  history" → Jack Nicklaus) is pinned to "as of the mid-2020s" but was
  never re-verified against a live source — confirm before treating it
  as settled.
- **Palindrome-definition 4-way cluster** (found during `general-p1-000`,
  2026-08-09): `general-736`, `general-1251`, `general-2314`, and
  `general-2708` all ask "what is the term for a word that reads the
  same forwards and backwards" with only superficial rewording, all
  answering "Palindrome." Same group-size-cap gap as the Magellan
  cluster above — needs a manual pick of the best-worded survivor in a
  future dedicated pass.
- `general-3067`/`general-4477` (bridge grand-slam trick count vs. total
  tricks in a bridge hand — both 13, essentially the same underlying
  fact from two framings) found during `general-p1-000` — left uncut
  since neither is reviewed yet.
- Four more same-answer/near-duplicate pairs found during `general-p1-001`
  (2026-08-09), all left uncut (neither sibling reviewed yet):
  `general-3478`/`arts-literature-894` (kenning, the "whale-road"
  example — a cross-category duplicate straddling `general` and
  `arts-literature`), `general-3481`/`general-4096` (litotes, "not bad"
  understatement), `general-3489`/`general-4094` (shibboleth
  definition), `general-3497`/`general-3951` (UK beer firkin = 9
  imperial gallons).
- More same-answer pairs found during `general-p1-002` (2026-08-09), left
  uncut (neither sibling reviewed yet): `general-3649`/`general-4070`
  (dagger † symbol name), `general-3650`/`general-4071` (double dagger ‡
  symbol name), `general-3684`/`general-4041` (bushel = 4 pecks). Also
  flagged for future verification, not just dedup: `general-3660`
  (biological tautonym, Gorilla gorilla) shares its answer text
  "Tautonym" with `general-3963` ("bonbon") and `general-4093`
  ("murmur"/"tartar") — those two look like they're actually asking about
  linguistic reduplication (a different, unrelated concept usually called
  "reduplicative"), not genus/species tautonyms, so this may be a
  mislabeled-answer bug in `general-3963`/`4093` rather than a true
  same-answer duplicate. Needs a read (and possibly WebSearch) when
  either of those IDs' chunk comes up.
- More same-answer pairs found during `general-p1-003` (2026-08-09), left
  uncut (neither sibling reviewed yet): `general-1253`/`general-1751`
  (homophones definition), `general-3005`/`arts-literature-897`
  (spoonerism, cross-category), `general-3006`/`arts-literature-896`
  (malapropism, cross-category), `general-3062`/`general-3192` (Full
  House's position in the poker hand-ranking hierarchy, described via
  two different specific relationships but the same underlying fact).
- Chunk `general-p1-004` (2026-08-11): cut `general-3127` (Lego's Danish
  "leg godt" = "play well") as a cross-category duplicate of
  already-reviewed `business-brands-024` (same fact), per the
  already-reviewed-sibling policy. Everything else in the chunk checked
  out. New 3-way near-duplicate cluster found, left uncut (neither
  `general-2722` nor `science-technology-851` has been reviewed —
  `science-technology-851` isn't in any pass chunk at all, same
  out-of-pass gap as the friends 179 orphans noted below):
  `general-3076` ("credited with inventing the QWERTY keyboard layout"),
  `general-2722` ("first practical typewriter patented in the 1860s by
  which American inventor"), and `science-technology-851` ("patented the
  QWERTY keyboard layout in 1868 and sold it in 1873") — all three
  answer Christopher Latham Sholes and are the same underlying
  fact/event reworded three ways.
- Chunk `general-p1-006` (2026-08-11): cut 4 cross-chunk duplicates of
  already-reviewed `general-p1-005` wordplay-term definitions (per the
  already-reviewed-sibling policy) — `general-3320`/`general-3207`
  (capitonym), `general-3321`/`general-3168` (aptronym, reversed
  direction), `general-3322`/`general-3232` (backronym, reversed
  direction), `general-3326`/`general-3230` (tautology). Cut
  `general-3346` as an in-chunk duplicate of `general-3313` (nautical
  mile = 1,852 meters). Cut `general-3390` (Mexican Train dominoes
  tiles-per-player, 4 players/double-12 set) for genuine real-world
  ambiguity — published rule sets disagree (Wikipedia's own rules table
  lists 11, 12, or 14 depending on publisher), and the drafted
  distractor "12" is itself a valid answer under other rule sets, not
  just an obscure alternative. New same-answer/duplicate pairs surfaced
  but left uncut since the sibling ID falls in a not-yet-reviewed chunk
  (`general-p1-014`, still pending): `general-3319`/`general-3224`
  (eponym, reversed direction), `general-3290`/`general-3381` (full
  house = three of a kind + a pair, reversed direction),
  `general-3345`/`general-3198` (ream of paper = 500 sheets).
  `general-3313`/`general-4219` (nautical mile) also left uncut —
  `general-4219` isn't in any pass chunk at all (an out-of-pass orphan,
  same gap as the friends 179 orphans noted below).
- Chunk `general-p1-007` (2026-08-11): cut `general-3457` ("in checkers,
  which color moves first?" → "Black") for genuine real-world ambiguity
  — sources conflict on whether red or black moves first in standard
  American checkers (depends on which color scheme/ruleset is cited),
  and both "Black" and "Red" were offered as options with no way to
  narrow to one true answer. Cut 6 cross-chunk duplicates of
  already-reviewed questions from earlier `general` chunks (per the
  already-reviewed-sibling policy): `general-3393`/`general-3082`
  (ampersand = ligature of "et"), `general-3417`/`general-3151`
  (limelight = heated calcium oxide), `general-3491`/`general-3230`
  (tautology definition, reversed direction), `general-3494`/
  `general-3307` (fathom = 6 feet), `general-3502`/`general-3684`
  (bushel = 4 pecks), `general-3509`/`general-3181` (score = 20 years,
  Gettysburg Address). New same-answer pairs left uncut — sibling is an
  out-of-pass orphan not in any chunk, same gap as `general-4219` above:
  `general-3402`/`general-4480` (ampersand etymology vs. "common name
  for &", different-enough facts but coincidentally same answer text),
  `general-3480`/`general-4097` (chiasmus, reversed direction),
  `general-3492`/`general-3948` (synecdoche "wheels"=car, reversed
  direction).
- Chunk `general-p1-008` (2026-08-11, idiom origins + board/card game
  rules): fixed a misspelled distractor name, `general-3521`'s "Robert
  Gascoyne-Cecel" → "Robert Gascoyne-Cecil". Fixed `general-3526`
  ("jump on the bandwagon" origin) — WebSearch showed the phrase's
  origin is credited to circus performer Dan Rice transporting
  politicians on his circus wagon in 1848, and P.T. Barnum, despite
  popularizing the word "bandwagon" in his own memoir, wasn't
  responsible for the phrase itself; reworded the question/answer from
  the specific-person framing ("P.T. Barnum's circus") to the general,
  defensible "Traveling circus parade wagons" rather than naming the
  wrong specific person. Cut `general-3549` ("throw caution to the
  wind" nautical origin) — WebSearch found this specific nautical
  explanation explicitly described as unconfirmed speculation, not an
  established etymology like the batch's other idiom-origin questions.
  Cut `general-3568` ("cheapest Monopoly property" → Mediterranean
  Avenue) for a genuine tie: Mediterranean Avenue and Baltic Avenue are
  both $60 on the standard US board, and Baltic Avenue was offered as a
  distractor option — same class of bug as `general-p1-006`'s Mexican
  Train and `general-p1-007`'s checkers cuts (the option set doesn't
  uniquely determine an answer). New same-answer pair left uncut
  (neither sibling reviewed yet): `general-3578`/`general-3965`
  (Carcassonne named directly vs. "which game introduced the term
  'meeple' in 2000" — both about Carcassonne's meeples, close enough to
  flag though phrased as different specific facts).
- Chunk `general-p1-009` (2026-08-11, board/card game rules + symbol
  and typography names): every question verified accurate (WebSearch
  confirmed the standard jigger is 1.5 fl oz and standard Pandemic has
  48 cities; the "/" solidus-vs-virgule question was left as-is despite
  some real ambiguity between typography sources, since Unicode's own
  standard officially names the U+002F character "solidus," making it
  the more authoritative answer). Zero fixes/cuts. Five new same-answer
  pairs surfaced, all left uncut per the both-unreviewed policy:
  `general-3637`/`general-3938` (octothorpe, "#"), `general-3638`/
  `general-4082` (solidus, "/"), `general-3639`/`general-4084`
  (backslash, "\"), `general-3651`/`general-4069` (section sign, "§"),
  and a 3-way cluster `general-3678`/`general-4055`/`general-4236`
  (carat = 200 milligrams) — the latter is exactly the
  independently-drafted-3+-times gap the group-size-cap note above
  describes, worth a manual pick of the best-worded survivor whenever
  any of the three's chunk comes up.
- Chunk `general-p1-010` (2026-08-11, D&D dice, idiom origins/meanings,
  eponyms, board/card game terms): cut 4 cross-chunk duplicates of
  questions already reviewed/fixed in `general-p1-008`, per the
  already-reviewed-sibling policy — `general-3732` (bury the hatchet,
  dup of `general-3527`), `general-3767` (throw in the towel's boxing
  mechanism, dup of `general-3530`'s "which sport does it originate
  from" — judged close enough to count, same idiom just more granular),
  `general-3791` (barking up the wrong tree, dup of `general-3537`),
  `general-3820` (caught red-handed, dup of `general-3520`). Found a
  3rd sibling in this same "throw in the towel" cluster,
  `general-3731` ("what does 'throw in the towel' mean and where does
  it originate?" → boxing corner throwing towel to concede) — it's a
  duplicate of both `general-3530` and the just-cut `general-3767`, but
  it isn't part of this chunk (a different, not-yet-reached chunk owns
  it) so it was left untouched; the same-answer tool never flagged it
  because all three questions use different literal answer text for
  the same fact. Whoever's chunk includes `general-3731` should cut it
  as an already-reviewed-sibling duplicate. Everything else in the
  chunk verified accurate. Four new same-answer NATO-alphabet pairs
  surfaced, all left uncut (siblings unreviewed): `general-3785`/
  `general-4288` (Q=Quebec), `general-3786`/`general-4296` (Y=Yankee),
  `general-3787`/`general-4294` (W=Whiskey), `general-3788`/
  `general-4284` (L=Lima) — worth checking whether the whole NATO
  alphabet got redrafted letter-by-letter twice across two sessions,
  same pattern as the Trivial Pursuit color and Catan resource question
  sets. Also left uncut (sibling unreviewed): `general-1273`/
  `general-2738`, two different clue-framings ("board game with
  Boardwalk and Park Place" vs. "board game invented by Elizabeth Magie
  as The Landlord's Game") both identifying Monopoly.
- The 12 categories split out of `general` don't have `data/topics.json`
  entries yet, so `analyze.js`/`find-gaps.js` report "no topic list
  configured" for them. Category-level question counts (`npm run
  validate`'s header, or `data/categories.json`) are the current signal
  for which is thinnest. Adding per-category subject lists (the way
  `friends`/`big-bang-theory` track individual characters) would sharpen
  this but hasn't been done.
- **`friends.json` has a systemic answer-cluster duplicate problem,
  confirmed 2026-08-08 during chunk `friends-p1-003`.** A one-off
  corpus-wide grep grouping every question by exact normalized answer
  (see the civics-law-economics snippet above, same technique) turned up
  17 clusters of 2-3 questions asking the identical fact, sitting well
  outside that chunk (so left uncut per the "only touch what the chunk
  actually covers" rule — cutting them would mark unreviewed questions
  in other not-yet-audited chunks as "no longer exists," corrupting
  `audit/progress.json`'s exhaustive-coverage guarantee). Needs a
  dedicated pass, not incidental chunk cleanup: `friends-098`/`557`/`960`
  (instrument Phoebe plays — guitar), `friends-128`/`585`/`935`
  (actress who plays Judy Geller — Christina Pickles), `friends-131`/
  `635`/`972` (actress who plays Charlie Wheeler — Aisha Tyler),
  `friends-197`/`837`/`539` (how many sisters Joey has — seven),
  `friends-347`/`471`/`653` (name of Rachel's Ralph Lauren assistant she
  dates — Tag Jones; `653` has the fullest/best distractor names if
  picking a survivor), `friends-146`/`236` (which friend Gunther's
  secretly in love with — Rachel), `friends-116`/`227` (which friend
  briefly dates Ursula, confusing the twins — Ross), `friends-156`/`854`
  (who manages Central Perk — Gunther), `friends-202`/`933` (Chandler's
  on-and-off relationship with Janice), `friends-044`/`595` (Ugly Naked
  Guy nickname), `friends-365`/`463` (which season Emma is born —
  Season 8), `friends-942`/`958` (Monica's apartment number before the
  continuity fix — 5). `friends-405`/`459` is the same pair but also a
  misquote, not just a duplicate — the verified line is "I'm not so good
  with the advice" (`405`); `459`'s "I'm not great at the advice" is the
  one to cut, not keep. **Six more pairs surfaced 2026-08-08 during
  chunk `friends-p1-004`**, this time via the audit tool's own
  same-answer printout rather than a dedicated grep (see "`next`
  auto-prints same-answer corpus matches" below) — same policy, left
  uncut: `friends-036`/`560` (Phoebe's husband — Mike Hannigan),
  `friends-056`/`580` (Phoebe's fake alter-ego name — Regina Phalange),
  `friends-061`/`298` (Rachel's finale line — both also had the same
  misattribution bug, fixed in place: it's Rachel who says "I got off
  the plane" at Ross's apartment door, not Ross who says it at the
  airport), `friends-067`/`637` (Richard Burke's profession —
  ophthalmologist), `friends-091`/`938` (Chandler's middle name —
  Muriel), `friends-115`/`226` (Ursula's occupation when introduced —
  waitress). The corpus-wide regroup-by-answer snippet (see the
  civics-law-economics IO-headquarters entry above) is the tool for
  the eventual dedicated pass across all of these. Separately,
  `friends-039` (Ross's novelty-sound-effects keyboard, self-answering
  stem) was cut outright rather than added to this list, in favor of
  `friends-491` which already covers the same fact — but `491`'s own
  premise ("Rachel discovers Ross secretly used to do this as a kid")
  wasn't itself verified and reads as a possible fabrication. Whoever
  audits `491`'s chunk should fix/reword rather than cut it, or the
  keyboard fact disappears from the corpus entirely with nothing left
  to cover it. **Two more pairs surfaced 2026-08-08 during chunk
  `friends-p1-005`**, same policy, left uncut: `friends-132`/`973`
  (Charlie Wheeler's profession — paleontology professor), `friends-212`/
  `936` (where Jack and Judy Geller live — Long Island). Also from that
  chunk: `friends-141`/`232` (names of Phoebe's surrogate triplets) was
  an in-chunk duplicate and got cut (kept `141`, the more detailed
  wording); its third sibling `friends-829` is still out there and still
  needs folding into this list's eventual dedicated pass. Also fixed in
  place: `friends-143` wrongly credited "Phoebe and Frank Jr." with
  naming the triplet Chandler — it's Phoebe alone, per Alice's on-screen
  line giving her the naming honor; `friends-195` wrongly described
  Chandler's proposal as "rose petals spelling out a message" — the
  actual episode has Monica decorate the apartment with ~1,000 candles
  and attempt to propose to Chandler first, breaking down in tears
  before he proposes back; `friends-199` claimed Monica's Italian
  restaurant job was "early in the series," but the named restaurant
  (Alessandro's) is actually her season 4-9 head-chef job — her actual
  early-series restaurant (Iridium, seasons 1-2) wasn't Italian and
  wasn't offered as an option, so the question was reworded to drop the
  "early in the series" framing instead. `friends-154`/`245` both
  conflated two separate reveals (Carol coming out as gay/leaving Ross,
  and — episode 2, later — revealing she was pregnant) into one event;
  `154` was fixed to only claim the (correct, backstory) coming-out
  reveal and `245` was cut as the duplicate. `friends-135`/`220` (Barry
  Farber ending up with Mindy) was an in-chunk duplicate; kept `135`
  (more specific — names the endpoint relationship), cut `220`.
- **Chunk `friends-p1-006` (2026-08-08) hit a new variant worth naming
  explicitly: a duplicate where one sibling was already reviewed/fixed in
  an earlier chunk, not just "both unreviewed."** The "leave uncut,
  log it" rule above is specifically for pairs where *both* members are
  unaudited (cutting one would falsely mark a not-yet-reviewed question
  as handled). That doesn't apply once one sibling has already passed
  through the audit itself — at that point the surviving, vetted version
  is the known-good one, so the newly-encountered duplicate in the
  current chunk gets cut immediately rather than added to the backlog.
  Four were cut this way: `friends-249` (dup of already-fixed
  `friends-160`, Emily's ultimatum), `friends-250` (dup of already-fixed
  `friends-162`, Ross/Emily marriage ending), `friends-253` (dup of
  already-reviewed `friends-163`, Mike Hannigan's career change),
  `friends-271` (dup of already-reviewed `friends-170`, Courteney Cox /
  Cougar Town) — all four originals were fixed/reviewed one chunk
  earlier, in `friends-p1-005`. Also from this chunk: `friends-247`
  ("Yankee swap" Christmas gift exchange) was cut outright as an
  apparently fabricated plot detail — multiple targeted searches for a
  Friends Christmas episode involving a Yankee Swap/white-elephant gift
  game turned up nothing, and no real episode plot matched. Fixed in
  place: `friends-276` claimed Monica worked "as a chef" at the Moondance
  Diner; she's actually a waitress there (in a blonde wig and roller
  skates) — her chef jobs are Iridium (seasons 1-2, earlier) and later
  Alessandro's/Javu — reworded to "waitress" rather than picking a
  different (unlisted) restaurant.
- **Chunk `friends-p1-007` (2026-08-08)**: `friends-354` was a
  distractor-correctness bug, not a duplicate — "Which two friends track
  down Chandler and talk him out of his wedding-day panic?" had "Phoebe
  and Rachel" marked correct while the actually-correct "Ross and
  Phoebe" was sitting right there as one of the other three options.
  Verified via the episode plot (S7's "The One with Monica and
  Chandler's Wedding"): Rachel stays behind to stall Monica; it's Ross
  and Phoebe who search for and find runaway Chandler. Note this is a
  distinct event from `friends-289`'s "nearly runs away" moment — that
  one is Chandler's *proposal*-night panic (S6), a separate incident
  from his actual wedding-day panic a season later; don't merge them if
  either resurfaces. `friends-404` (Rachel's parents' divorce) was cut
  as a cross-chunk duplicate of already-fixed `friends-224`, per the
  p1-006 policy above. `friends-402` ("mascot handing out advertising
  flyers" as one of Joey's odd jobs) was cut as apparently fabricated —
  several searches for exhaustive lists of Joey's temp jobs (cologne
  spritzer, Christmas tree seller, museum tour guide, sperm donor,
  acting teacher, etc.) never surfaced a flyer-mascot job.
- **179 of `friends.json`'s 920 questions (as of 2026-08-08) belong to
  no chunk in the current audit pass at all**, discovered while
  investigating why `friends-938` (used in the duplicate pair above)
  never turned up in a `next` chunk. Per "A pass's chunk membership is
  frozen at `init`/`new-pass` time" below, this means these ~179
  questions were added to the file after the current friends pass was
  initialized, so they will never get audited under this pass no matter
  how many chunks get completed. Needs a fresh pass (or an appended set
  of chunks) covering just the uncovered IDs before the current pass is
  considered a full sweep of the file.
- **Chunks `friends-p1-008`/`friends-p1-009` (2026-08-08, IDs friends-411
  through friends-538) had a much higher fabrication density than any
  prior friends chunk** — 18 issues across 94 questions, roughly double
  the typical rate, and unlike earlier chunks (mostly cross-chunk
  duplicates) most of these were invented or conflated plot specifics:
  a fabricated "Yankee swap"-style detail (`448`'s Ugly Naked Guy estate
  sale — real fact is Ross bonding naked with him for the sublet),
  `466`'s Joey-moves-to-LA premise (visibly uncertain even in its own
  drafting — "Las Vegas... no, to Los Angeles" leaked into the stem, and
  no episode matches it), `473`'s "Underdog float catch" game (the real
  Thanksgiving football tradition, the Geller Bowl, wasn't even offered
  as an option), `483`'s boss-heart-attack framing (real fact: Chandler
  is offered an unwanted data-processing promotion, no heart attack),
  `485`'s leather-jacket gift (no matching episode found), and several
  right-fact-wrong-character mix-ups: `474` attributed a real S4 trivia
  quote ("Big Fat Goalie") to an unrelated S5 Thanksgiving-flashback
  insult (the real line is Chandler calling Monica "your fat sister"),
  `480`/`481` had Phoebe (not Joey) getting ordained online and an
  invented NY-license problem (real crisis: Joey running late from a
  film shoot), `489` had Rachel finding Ross's pro/con list "while
  packing" (it actually surfaces via a coffee-house printer), `496`
  invented a character "Andrew" introducing Ross and Emily (it's
  Rachel, asking Ross to entertain Emily so she can date Joshua), and
  `497` gave Chandler a fabricated cousin-of-Emily's named "Denise" to
  romance at the wedding (it's Joey kissing an unnamed bridesmaid).
  Also cut as unfixable: `495` (Emily's profession is never established
  on-screen, and the question also claimed they meet in London when
  they actually meet in New York). All were fixed in place (preserving
  the real underlying fact) rather than cut, except `495`/`448`/`466`/
  `473`/`483`/`485` per the usual unfixable-without-changing-the-fact
  cut policy — see the `friends-p1-008`/`009` commit for the full list.
  **If later chunks in the `friends-411`–`friends-538`-ish range (or
  any range that turns out to share a drafting batch with it) keep
  showing this same conflated-plot-detail pattern, budget extra
  WebSearch verification there rather than defaulting to judgment/
  memory** — this range appears to come from a drafting pass with
  noticeably weaker factual grounding than the rest of the corpus.
- **Chunks `friends-p1-010`/`friends-p1-011` (2026-08-08, IDs friends-539
  through friends-697)**: cut `friends-541` (invented "Just How Mad Am I"
  finger-counting game — no matching scene in 'The One Where No One's
  Ready'), `friends-544` (fabricated finale detail — no one is shown
  taking over Monica/Chandler's apartment after they move out),
  `friends-547` (fabricated/conflated — the real embarrassing
  high-school-reputation reveal is Will Colbert's rumor in 'The One
  with the Rumor', not something Rachel's mother does), `friends-548`
  (unverifiable Monica-almost-named-differently premise, no matching
  episode found), and `friends-549` (backwards premise — Pete Becker
  was already a software millionaire *before* opening a restaurant for
  Monica, not a restaurant-chain owner before his wealth). Also cut as
  cross-chunk duplicates of already-fixed originals (per the
  already-reviewed-sibling policy above): `friends-559` (dup of
  `friends-115`/`friends-226`, Ursula's waitress job), `friends-610`
  (dup of `friends-514`, Chandler kissing Kathy), `friends-629` (dup of
  `friends-160`, Emily's ultimatum to cut off contact with Rachel).
  Fixed in place: `friends-642` (real reason Monica is fired is
  accepting a kickback of steaks/an eggplant from a food supplier, not
  "bribes from a food critic to serve better food" — verified via 'The
  One with Five Steaks and an Eggplant') and `friends-648` (Chandler
  proposes in the candle-filled apartment, no rose petals — verified via
  'The One with the Proposal: Part 2', the same fabrication already
  removed from `friends-195`). Two new same-answer duplicate pairs
  surfaced and were left uncut per the standard both-unreviewed policy:
  `friends-050`/`friends-603` (Fat Monica nickname) and
  `friends-583`/`friends-584` vs `friends-900`/`friends-901` (Nora Bing
  / Morgan Fairchild) — the latter pair falls inside the 179
  out-of-pass questions noted below, so it will need the same fresh
  pass/appended chunks that block covers, not just a normal future
  audit chunk.
- **Chunk `friends-p1-012` (2026-08-08, IDs friends-699 through
  friends-786, mostly behind-the-scenes/actor trivia)**: cut three
  cross-chunk duplicates of already-reviewed originals, per the
  already-reviewed-sibling policy above — `friends-779` (dup of
  `friends-574`, Barry marrying Mindy), `friends-783` (dup of
  `friends-622`, Ross sleeping with Chloe from the copy place during
  the break), `friends-784` (dup of `friends-649`, Chandler's Tulsa
  transfer). Fixed `friends-712`: multiple sources (Television Academy,
  Yardbarker, Collider) consistently rank the Friends finale's 52.5
  million viewers *fourth*-most-watched series finale in U.S. TV
  history (behind M\*A\*S\*H, Cheers, Seinfeld) — the drafted answer
  "Fifth" was wrong, changed to "Fourth". Everything else in this
  chunk (guest-actor casting, production trivia, in-show plot facts)
  was individually verified via WebSearch and confirmed accurate — this
  chunk leaned heavily on specific, checkable claims (real actor names,
  filming-time figures, behind-the-scenes anecdotes) that turned out to
  be unusually well-grounded compared to `friends-p1-008`/`009`'s
  fabrication-heavy range. New same-answer pair left uncut (both
  unreviewed): `friends-767`/`friends-596` (Ross's fictional employer,
  the Museum of Prehistoric History).
- **Chunk `friends-p1-013` (2026-08-08, low-numbered IDs friends-001
  through friends-152 plus two hard-difficulty stragglers friends-788/
  789)**: every question in this chunk checked out factually (including
  the two mediums, Drake Ramoray's brain-donor character Jessica
  Lockhart and Joey's baby-powder leather-pants suggestion, both
  verified via WebSearch), so zero fixes/cuts. Six new same-answer
  duplicate pairs surfaced, all left uncut per the both-unreviewed
  policy (three pair with questions in already-scheduled future chunks,
  three pair with questions among the 179 out-of-pass IDs noted below):
  `friends-002`/`friends-940` ("What is Ross's profession?" is a bare
  duplicate of "What is Ross Geller's profession?"), `friends-007`/
  `friends-962` (same pattern for Phoebe's masseuse job), `friends-114`/
  `friends-844` (who plays both Phoebe and Ursula — Lisa Kudrow),
  `friends-018`/`friends-258` (the orange couch as Central Perk's
  iconic furniture), `friends-059`/`friends-570` (Rachel working for
  Ralph Lauren), `friends-082`/`friends-248` (Emily Waltham's British
  nationality). The latter three's sibling IDs already sit in scheduled
  chunks `friends-p1-014`/`friends-p1-015` — when those chunks come up,
  cut the newly-encountered side immediately as a dup of this
  already-reviewed `friends-p1-013` chunk, per the
  already-reviewed-sibling policy above, rather than re-logging them.
- **Chunk `friends-p1-014` (2026-08-09, IDs friends-153 through
  friends-553, 4 IDs already removed by earlier dedup)**: cut two
  cross-chunk duplicates flagged in advance by the `friends-p1-013`
  note above -- `friends-248` (dup of already-reviewed `friends-082`,
  Emily Waltham's British nationality) and `friends-258` (dup of
  already-reviewed `friends-018`, Central Perk's orange couch) -- per
  the already-reviewed-sibling policy. `friends-059`/`friends-570`
  (Rachel and Ralph Lauren), the third pair `friends-p1-013` flagged,
  is still pending since neither ID fell in this chunk. Every other
  question checked out factually clean, including two verified via
  WebSearch (Cole Sprouse was the only Sprouse twin cast as Ben
  Geller -- Dylan never played the role -- and Phoebe's "lobster"
  soulmate line originally refers to Ross and Rachel, from 'The One
  with the Prom Video'). Two new same-answer duplicate pairs surfaced,
  left uncut per the both-unreviewed policy: `friends-553`/`friends-977`
  (Cole Sprouse plays Ben Geller as both young child and teen) and
  `friends-201`/`friends-927` (Janice's "Oh. My. God." catchphrase).
- **Chunk `friends-p1-015` (2026-08-09, IDs friends-555 through
  friends-749, 2 IDs already removed by earlier dedup)**: cut three
  cross-chunk duplicates of already-reviewed originals per the
  already-reviewed-sibling policy -- `friends-570` (dup of
  `friends-059`, Rachel working for Ralph Lauren -- this pair was
  flagged in advance by the `friends-p1-013` note above), `friends-586`
  (dup of `friends-127`, actor playing Jack Geller), and `friends-749`
  (dup of `friends-266`, the 2021 HBO Max reunion special's title).
  Everything else verified accurate. One new same-answer pair surfaced,
  left uncut per the both-unreviewed policy: `friends-600`/`friends-952`
  (Joey's "How you doin'?" catchphrase).

## Memory-only drafting exhausts per category

`friends`, `big-bang-theory`, and `general` have all crossed the point
where drafting purely from a model's training-data memory stops working
well — most well-known facts are already asked, so new drafts either
duplicate something existing or rest on facts the model isn't actually
sure of. Any other category that gets similarly deep (a few hundred+
questions) will hit the same wall. See README's "Sourcing facts for a
heavily-populated category" for the wiki/reference-sourcing workflow
this calls for — fetching source material fixes *accuracy*, it doesn't
fix *duplication*, so still run `check-draft.js` against the full corpus
for every candidate fact regardless of where it came from.

## What not to do

- Don't add a build step, framework, or bundler — this is intentionally
  plain HTML/CSS/JS with no build step.
- Don't hand-edit `version.json` — `ship`/`stamp-version.js` owns it.
