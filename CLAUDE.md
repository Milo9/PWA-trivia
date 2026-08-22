# CLAUDE.md

Instructions for Claude working in this repo. For schema, project layout,
and the full add-a-batch workflow, **read README.md first** — this file
only covers what the README doesn't (behavioral rules and hard-won
lessons, not documentation, and not a batch-by-batch changelog — that's
what `git log` is for).

## Verifying UI changes: check for tooling before claiming you can't

**Before telling the user there's no way to test a UI change in a browser,
check `package.json`'s `devDependencies` and `node_modules` first.**
`playwright` is already installed here, with a Chromium binary already
cached on this machine — confirmed 2026-08-12 when a session shipped six
UI features (confetti, streak tiers, auto-advance, an in-theme confirm
sheet, a 50/50 lifeline, a sound toggle) with only `node --check` and a
manual code read, explicitly telling the user it couldn't browser-test
because "no browser automation tool is available" — without ever checking
whether one was already sitting in the repo. It was. Only surfaced when the
user asked "can you just install what you need?" and prompted an actual
check.

Use `npm run visual-check` (see README's "Automated visual check") for a
full walkthrough with screenshots, or drive `playwright`'s `chromium`
directly via a one-off Bash-run Node script for something narrower. Actually
look at the resulting screenshots (via `Read`) rather than just checking
the script exited 0 — a run with zero console errors can still render
visibly wrong (an animation-timing artifact caught this same session: a
screenshot taken immediately after a `.hidden` class toggle can catch the
CSS fade-in at opacity 0, looking like a blank page, even though the DOM
state and console are both perfectly fine — add a short `waitForTimeout`
after any screen transition before capturing).

If a genuinely different repo really has no headless browser available,
say so — but say it after checking, not by default.

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

**For a multi-line commit message, don't pass it as an inline `npm run
ship -- "..."` argument — write it to a file and use `--file` instead:**

```
npm run ship -- --file <path-to-message-file>
```

Root cause (confirmed 2026-08-22): on Windows, `npm run` relaunches the
underlying script through `cmd.exe`, and cmd.exe's command-line parsing
truncates at the first raw newline inside a quoted argument — everything
after the first line silently vanishes before `ship.js` ever sees it.
This isn't a `ship.js` or git bug (a multi-line string handed to
`execFileSync` passes through to git untouched); it's specifically the
`npm run ... -- "..."` shell hop on this machine, confirmed by
reproducing it with a throwaway argv-dumping script both via plain
`node` (survives intact) and via `npm run` (truncated to the first
line). Put the message file **outside this repo** — e.g. the scratchpad
directory — since `ship` runs `git add -A` and would otherwise sweep a
same-repo message file into the commit it describes. A single-line
message can still be passed inline as before.

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
  against a 0.55 floor). The index also strips a trailing "s" before
  matching (so "Public goods" vs. "Public good" matches — confirmed
  2026-08-07 in civics-law-economics, see below) and, for answers under
  the 6-character floor, matches within the same category instead of
  dropping them entirely (so "Lima"/"Ross"/"5"-style short answers still
  get checked, just scoped to one category to avoid whole-corpus noise).
  Treat every line it prints as a lead to check, not an automatic
  verdict — most will be coincidental reuse of a common answer (a
  country, a number), and it only catches *identical* answer text (after
  that normalization), not a reversed-direction or same-fact-different-
  wording duplicate (e.g. "Radial sesamoid" vs "An enlarged wrist bone"
  for the same panda pseudothumb fact) — those still need your own
  judgment, same as always.
- **`next` also auto-prints an answer-leak warning**
  (`! possible answer-leak: answer is N chars vs. longest distractor M
  chars`) when the correct option is much longer than every distractor —
  see "Answer-leak via option-length/format" below for why that alone can
  give the answer away. Same treat-as-a-lead caveat as above: a long
  correct answer next to short-but-plausible distractors isn't
  inherently wrong.
- **If a duplicate's sibling hasn't been reviewed yet, leave it uncut and
  park a note with `node scripts/audit.js note <id> "…"` — don't cut it
  just because it looks obviously redundant.** Cutting an unreviewed
  question marks it "no longer exists" in `audit/progress.json` without
  ever actually reviewing it, corrupting the pass's exhaustive-coverage
  guarantee. The note lands in `audit/backlog.json` and `next` prints it
  inline (`! BACKLOG: …`) whenever that id's chunk comes up again, so
  there's no need to remember it or re-check this file. **But only log
  pairs that can't resolve themselves.** The same-answer auto-print above
  will automatically re-show a pair the next time *either* sibling's own
  chunk is reached, as long as that sibling isn't permanently
  unreachable — so most matching-answer-text pairs (including same-
  category short answers now, per the index change above) don't need a
  manual note; they'll surface again on their own. Log a pair only when:
  the answer text differs enough that the auto-print can't match it
  (reversed direction, different wording), the matched answer text is
  short AND the pair straddles two different categories (the per-
  category short-answer index above only catches same-category pairs),
  or every sibling has either already finished its chunk or belongs to
  no chunk at all (an "orphan" — see "Structural gaps" below for what
  that means) — i.e. there's no future `next` call left that could ever
  show the match again. Since a note attached to an already-`done` or
  orphaned id will never surface via `next`, run
  `node scripts/audit.js backlog` periodically (or whenever `status`
  shows a category is fully done) to see everything parked that needs
  acting on directly instead of waiting.
- **Once one sibling of a duplicate pair has already been
  reviewed/fixed in an earlier chunk, the rule above doesn't apply —
  cut the newly-found duplicate immediately instead of logging it.**
  The already-vetted survivor is the known-good version; there's no
  unreviewed question at risk of being wrongly marked handled.
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
  young vs. adult Mary Cooper), `general-3660` (biological tautonym,
  e.g. "Gorilla gorilla") vs. `general-3963` (linguistic tautonym, a
  word of two identical parts like "bonbon" — a real second sense of
  the same word, confirmed via WebSearch 2026-08-13, not a mislabeled
  answer) — high text/answer similarity, genuinely different facts.

### Structural gaps in the audit passes

An **orphan** here means an ID that `audit/progress.json` has no chunk
for at all — added to the file after that category's pass was
initialized, so no `next` call will ever surface it (see "A pass's
chunk membership is frozen" above). `node scripts/audit.js status`
reports the current orphan count per category; `node scripts/audit.js
append-orphans` folds them into new pending chunks so they eventually get
reviewed. To check a single id by hand: `node -e "const p=
require('./audit/progress.json'); console.log(p.chunks.some(c=>
c.ids.includes('<id>')))"`.

- **`friends.json`'s pass 1 is fully complete for its in-pass coverage
  (16/16 chunks `done`), but 179 of its 920 questions (as of
  2026-08-08) are orphans** — discovered investigating why `friends-938`
  never turned up in a `next` chunk. No further `next` call will touch
  either the orphans or the 741 already-`done` questions under this
  pass. Needs a fresh pass (or chunks appended for just the orphan IDs)
  before this file counts as a full sweep.
- **`general.json` has the same gap, much larger: 660 of its 1518
  questions (43%, checked 2026-08-11) are orphans, including the
  entire `general-4xxx` ID range (482 of 482, 100%)** plus 178 more
  scattered through `general-3xxx`. The general pass itself is still
  active (7 of 18 chunks pending as of 2026-08-11), so most same-answer
  pairs found so far that involve only in-pass IDs will self-resolve
  once the relevant chunk is reached without needing to be logged
  anywhere — see `audit/backlog.json` (via `node scripts/audit.js
  backlog`) for the ones that won't. This pattern isn't `general`/
  `friends`-specific
  either — e.g. `arts-literature-894`/`-896`/`-897` are also orphans —
  so treat "one sibling of a pair has no chunk at all" as a live
  possibility in any category.
- The 12 categories split out of `general` don't have `data/topics.json`
  entries yet, so `analyze.js`/`find-gaps.js` report "no topic list
  configured" for them. Category-level question counts (`npm run
  validate`'s header, or `data/categories.json`) are the current signal
  for which is thinnest.
- **`friends-411`–`friends-538` (chunks `friends-p1-008`/`009`) had
  roughly double the fabrication rate of any other friends chunk** —
  mostly invented or conflated plot specifics rather than simple
  duplicates. If a future pass revisits this range, budget extra
  WebSearch verification rather than defaulting to judgment/memory.

### Duplicate pairs that need explicit tracking

This used to be an inline list here; it's now `audit/backlog.json`
(`node scripts/audit.js note <id> "…"` to add, `node scripts/audit.js
backlog` to list everything regardless of chunk status) so `next` can
print each note automatically instead of depending on a future session
re-reading this file at the right moment — see "If a duplicate's sibling
hasn't been reviewed yet" above for when to log a pair there at all.
Don't add per-id duplicate-tracking prose back here; keep
`audit/backlog.json` the single copy, same principle as the
per-category `AVOID THESE ANGLES` lists under "External-agent drafting"
above.

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
