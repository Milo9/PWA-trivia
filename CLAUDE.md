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
- **`sports` has a casual-audience bar, not just a dedup bar.** A
  2026-09-01 pass cut 338 of 598 sports questions (record-holders, career/
  season stat recall, "as of 20XX" record framing, draft/roster/jersey/
  nickname trivia, rule-spec measurements, obscure "first/only player to
  X" history) after the user — explicitly not a sports fan, and drafting
  for a household that isn't either — asked for the category to stay
  answerable by non-fans. The full rule (and what still counts as fair
  game — basic rules/scoring, terminology, major event outcomes, athletes
  famous enough to be pop culture) lives in `templates/sports.md`'s
  CASUAL-AUDIENCE RULE — that's the single copy; check it before drafting
  or auditing sports questions, don't re-derive the bar from memory.
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
- **When Claude drafts a batch itself directly into a scratch file (as
  opposed to using one of the `templates/` prompts handed to an external
  agent), explicitly shuffle each question's option order before running
  check-draft — don't rely on writing them in a "natural" order.**
  Confirmed 2026-09-03 drafting a 233-question science-technology batch:
  every single question had the correct answer sitting in `options[0]`,
  because that's the order it's natural to write them in when composing
  a question and its distractors together, and nothing catches this
  automatically — neither `check-draft.js` nor `validate.js` checks
  answer-position distribution at all (the external-agent templates tell
  the drafting agent to vary position themselves, but a Claude-authored
  scratch draft has no equivalent reminder anywhere in this workflow).
  Caught only by a one-off manual check
  (`options.indexOf(answer)` tallied across the draft) run on a hunch
  after merging felt too easy — this would have shipped 233 questions
  where the answer was always "A" if that check hadn't happened. Fix by
  shuffling `options` per-question (a seeded shuffle is fine, keeps the
  run reproducible) right before the check-draft pass, then re-running
  check-draft afterward to confirm the shuffle didn't introduce anything
  new (it can't logically, since `answer` is matched by string not
  position, but it's a free confirmation).
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
   Y" — categories of chestnut, not just one-off facts). **Once a
   category is broad enough to have natural sub-domains, restructuring
   into labeled sections is a better fix than flat pruning** — pruning
   loses coverage a future drafter still needs, where grouping just
   makes the same coverage skimmable. `templates/science-technology.md`
   did this first (PHYSICS/CHEMISTRY/BIOLOGY/etc. sections with a
   MAINTENANCE NOTE); `templates/animals-nature.md` followed the same
   pattern 2026-09-03 when a 202-question concept-heavy batch pushed its
   flat list well past guideline size for a second time. Prune *within*
   a section once that section alone gets unwieldy, not the whole list.

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
  **`science-technology` surfaced both known gaps at once in a single
  2026-09-03 batch** (found via `check-draft.js --full-answer-audit`,
  read in full — none of these were caught by the default run). Three
  were the group-size-cap/overlap-floor gap described above, not a
  dupeGroup issue at all: `geography` and `history` both share
  `dupeGroup: "general"` with `science-technology`, so a Mount Fuji
  stratovolcano fact and a metric-system-origin fact were *checked*
  against those categories, just phrased differently enough (longer,
  reworded stems) to score under `SAME_ANSWER_MIN_OVERLAP` and slip past
  the default advisory output despite an obvious shared answer. The
  fourth was a genuine dupeGroup-boundary miss like the Friends/Big Bang
  Theory case above: `business-brands` carries no `dupeGroup` at all
  (fully isolated, not folded into `"general"`), so a QR-code-inventor
  fact overlapping it was invisible to any same-dupeGroup check by
  construction, full-answer-audit included in principle — it only
  surfaced because full-answer-audit actually scans the *entire* corpus
  regardless of dupeGroup, not just the draft's own group. (A fifth
  candidate, an infrasound fact overlapping `animals-nature` — same
  dupeGroup, same overlap-floor story as the first two — was also
  caught this way.) Net lesson: for a category this saturated, treat
  `--full-answer-audit`'s full output as required reading, not a
  fallback for when the default run looks suspicious — the default run
  gave no signal at all on any of these four.
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
- **Logically-incoherent stems for sequence/hierarchy questions** — a
  distinct bug from a wrong *fact*: the question's premise is unanswerable
  or self-contradictory given the sequence it names, independent of which
  option is marked correct. Confirmed 2026-09-03: a drafted question asked
  "which taxonomic rank sits directly between 'class' and 'order'" — but
  class and order are *adjacent* ranks in the standard seven-rank
  hierarchy (kingdom-phylum-class-order-family-genus-species), so nothing
  sits between them; the question was unanswerable as written regardless
  of which option got marked correct. Caught only by manually re-deriving
  the actual sequence while reading the draft, since every automated
  check (schema, dedup, answer-leak) only inspects the option/answer
  strings, never whether the stem's own claim about a named sequence,
  ranking, or ordering is internally consistent. Any question of the
  form "what comes between X and Y" or "what rank/step is directly
  before/after Z" needs the namer to actually count the sequence, not
  just recall that X and Y are both real steps in it.
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
- **Knowledge-cutoff trap on real-world events that happened between the
  model's training cutoff and today's actual date.** Confirmed 2026-09-03
  drafting a sports batch: the session's cutoff was January 2026, but the
  session date was September 2026 — meaning the Milan-Cortina 2026 Winter
  Olympics (February 2026) and the FIFA World Cup 2026 (June-July 2026)
  had both already happened, with results the model has no memory of.
  Asking "which city will host X" or "which country hosted X" for an
  event whose host was locked in and announced years earlier (Milan-
  Cortina's host cities, the 2026 World Cup's three co-hosts) is still
  safe — that fact predates the cutoff. Asking who *won* anything at
  either event is not — a plausible-sounding guess would be a fabricated
  result with total confidence behind it, exactly the kind of error
  duplication checks can't catch. Before drafting any question about a
  recent or upcoming real-world competition, check today's actual date
  (not the training cutoff) against the event date, and if the event
  falls in the gap between them, restrict facts to whatever was already
  fixed/announced before the cutoff (host, format, participants) and
  skip anything that depends on the event's outcome — verify via
  `WebSearch` instead of guessing, or don't ask it at all.
- **Near-synonym option sets in vocabulary/slang questions are the same
  bug in a different costume.** A "what's the term for X" question whose
  distractors are close synonyms of the correct answer (e.g. "British
  slang for nonsense" with Codswallop as answer and Balderdash/Poppycock/
  Tommyrot as distractors — all four genuinely mean the same thing) isn't
  obscure, it's ambiguous the same way the France/Germany border case is:
  more than one option is a defensible correct answer for the stem as
  written. Confirmed 2026-08-28 in a `general` chunk built from obscure-
  vocabulary chestnuts (nonsense synonyms, commotion synonyms, dawdling
  synonyms, a poker "wheel"/"bicycle" pair, a "frivolous talkative
  person" set) — five questions in one 50-question chunk had this bug.
  Prefer narrowing the **option set** over the stem: swap the also-true
  distractors for same-register words that don't fit the definition,
  rather than inventing a disputed-etymology stem to pin down the
  "correct" synonym (etymology for slang terms is often folk/unverified
  — don't assert it as fact just to rescue a question). Only reach for a
  stem-level pin when there's a *verified, specific* fact that narrows
  it (e.g. gobbledygook's documented 1944 Maury Maverick coinage, used to
  exclude bafflegab, a near-perfect dictionary synonym, without touching
  the options). Check every replacement distractor against the stem
  before shipping it — a swapped-in word that also happens to satisfy
  the definition just recreates the same bug.
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
- **Answer-leak via a discriminating word in the stem, not the full answer
  string.** `check-draft.js`'s leak check only matches the *complete*
  answer text appearing verbatim in the question — it misses a single
  word from the answer (or a close variant of one) showing up in the
  stem while being absent from every distractor, which still tips off
  the answer without requiring any real knowledge (e.g. a stem
  mentioning "resembling a grid" when the answer is "The gridiron," or
  "seven players per side" when the answer is "Rugby sevens"). Only a
  manual read catches this reliably. Confirmed 2026-09-02: a
  self-drafted 150-question sports batch that passed both
  `check-draft.js` passes clean still had ~15 of these on a manual
  re-read, plus one outright tautological stem (quoting the answer's
  nickname directly: "several skills are officially named 'The Biles' —
  after which gymnast?"). Fix by rewording the stem to describe the
  concept without reusing the answer's distinctive word (a synonym, or
  drop the clause entirely) — same principle as not leaking the literal
  answer, just at word-substring granularity instead of full-string.

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
- **`--full-answer-audit` silently drops any answer shorter than
  `MIN_ANSWER_DUPLICATE_LENGTH` (6 characters, defined in `validate.js`)
  — the same floor `validate.js`'s own same-answer check and
  `check-draft.js`'s default pass already apply, but the docs describe
  `--full-answer-audit` as "no threshold," which is only true above that
  floor.** Short proper nouns — god names ("Tyr," "Set," "Nut," "Om"),
  single-word answers, numbers — are exactly what short-answer mythology/
  trivia questions produce, so this gap hits name-heavy categories hard
  and gives zero signal, not a false "clean." `scripts/audit.js`'s `next`
  command already works around this for already-shipped content (falls
  back to a same-category match for short answers, per "Auditing
  existing questions" below) — `check-draft.js` has no equivalent
  fallback for a not-yet-merged draft. Confirmed 2026-09-03 drafting a
  mythology-religion batch: a clean `check-draft.js` run (0 duplicates,
  including a clean `--full-answer-audit`) still had 16 more real
  duplicates sitting in short answers ("Tyr," "Set," "Isis," "Horus,"
  "Zeus," "Mars," "Janus," ...) that only surfaced from a manual
  `answer.length < 6` filter run against the *full* corpus by hand. Two
  of those (a Mars/March and a Janus/January god-gives-the-month-its-name
  fact) were sitting in `general.json` under `general-NNNN` ids that were
  never migrated into `mythology-religion.json` during the 2026-08-01
  split — i.e. genuinely new `general` content added after that split,
  not just historical entries — so even a check scoped to
  "target-category-file plus the historical general-NNNN entries already
  inside it" would have missed them; only a full-corpus scan catches
  this. **For any batch with short (<6 char) answers, after check-draft
  passes clean, run one more manual pass:** filter the draft to answers
  under 6 letters, dump every existing question across the *entire*
  corpus (not just the target category or its `dupeGroup`) that shares
  that exact normalized answer text, and read each match's stem by hand.
- **Generic concept/definition questions are a distinct `--full-answer-
  audit` risk from "iconic subject" batches, and need the same treatment
  even when nothing about the batch looks iconic.** A question that
  defines a general term ("what's the term for X") rather than asking
  about a specific named animal/species/place is exactly as likely to
  already exist in a *different* dupeGroup-shared category as in the
  target one, because the fact isn't inherently tied to the target
  category's subject matter — a biology/chemistry/physics definition
  could plausibly have been drafted into `science-technology` OR
  `animals-nature` OR `general` with nobody noticing the overlap until
  audit time. Confirmed 2026-09-03 drafting a 202-question
  animals-nature batch built mostly around ecology/evolution/genetics
  *concepts* (a sub-domain picked specifically because plain species-fact
  drafting was exhausted, per "Memory-only drafting exhausts" below):
  6 of 208 drafted questions were exact-concept duplicates already
  sitting in `science-technology` or `general` (condensation as a phase
  change, Gregor Mendel/pea-plant genetics, phenotype's definition,
  Mauritius as the dodo's home island, phloem's definition, circadian
  rhythm's definition) — none of these were caught by grepping the
  *target* category beforehand (the whole point of drafting concept
  questions was that animals-nature itself had zero prior coverage of
  them), and none scored high enough on text overlap for the default
  check to flag, since the two phrasings of the same definition rarely
  share much wording. `--full-answer-audit` caught all 6 because it
  compares the *answer* against the whole corpus with no threshold,
  regardless of dupeGroup. Treat any batch built on stem-format
  "what's the term for X" / "what do you call Y" definitional questions
  as inherently iconic-subject-risk-level, not just batches about
  famous named entities.

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
- **`next` also auto-prints two more mechanical leads, both added
  2026-08-23 to catch patterns that used to depend on the reviewer
  remembering to look for them:** a leaked-drafting-reasoning warning
  (`! possible leaked reasoning in option: "…"`) when an option contains
  the word "but", "trick:", "is same", or any "?" (checked per-option,
  correct answer included, since a leak can land in either) — see
  "Malformed options carrying leaked drafting reasoning" below; and an
  unpinned-superlative warning (`! possible unpinned superlative claim
  …`) when the question stem or the correct answer (distractors are
  deliberately excluded — testing found they fire false positives from
  incidental word choice in a wrong option) contain "only"/"current(ly)"/
  "tied with"/"record"/"most recent"/"latest"/"newest" with no "as of"
  phrase or 4-digit year anywhere in that same text to pin it — see
  "Stale record-holder / superlative claims"
  below. Both are deliberately conservative pattern matches (leads, not
  verdicts, same as the answer-leak warning) — expect some hits that are
  fine on inspection (a permanently-true "only," a distractor that
  happens to contain "but").
- **If a duplicate's sibling hasn't been reviewed yet, leave it uncut and
  park a note with `node scripts/audit.js note <id> "…"` — don't cut it
  just because it looks obviously redundant.** Cutting an unreviewed
  question marks it "no longer exists" in `audit/progress.json` without
  ever actually reviewing it, corrupting the pass's exhaustive-coverage
  guarantee. The note lands in `audit/backlog.json` and `next` prints it
  inline both when the note's own (already-reviewed) key id reappears
  in a chunk (`! BACKLOG: …`) and — since that key id's chunk is done
  by construction and so effectively never recurs — when any *sibling*
  id named in the note's text comes up in its own chunk instead
  (`! BACKLOG (referenced by <keyId>): …`), so there's no need to
  remember it or re-check this file. **But only log
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
  point — most questions are obviously fine on a read-through. When a
  chunk has multiple claims worth checking about the same entity (e.g.
  three different space-mission facts about the same probe), batch them
  into one search instead of one per question — cheaper, and the search
  results usually cover all of them at once anyway.
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

- **Orphan counts are large and span every category, not just one or
  two** — check current per-category counts with `node scripts/audit.js
  status` rather than trusting a hardcoded number written here, since a
  count captured on one date has gone stale by roughly 10x within a few
  weeks before (confirmed 2026-08-23: earlier versions of this section
  cited counts for `friends`/`general` only, captured 2026-08-08/
  2026-08-11; a `status` check on 2026-08-23 showed 7,434 orphans spread
  across all 17 categories). This is expected, not a sign the tooling is
  failing: `new-pass` builds its next manifest from every id that was
  *not* part of a `done` chunk in a completed pass (see
  `buildReviewedIdSet` in `scripts/audit.js`), so an orphan gets folded
  in automatically once the current pass finishes and `new-pass` runs —
  `append-orphans` is only for pulling orphans into the *current* pass
  early, not required for them to eventually get covered.
- Most same-answer pairs found mid-pass that involve only in-pass IDs
  will self-resolve once the relevant chunk is reached, without needing
  to be logged anywhere — see `audit/backlog.json` (via `node
  scripts/audit.js backlog`, which labels each entry with whether its
  referenced sibling id will resurface on its own via a pending/
  in-progress chunk or needs direct action now) for the ones that won't.
- Treat "one sibling of a duplicate pair has no chunk at all" as a live
  possibility in any category, at any time — it showed up first in
  `friends`/`general` only because those were checked first, not
  because it's confined to them.
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

**For `sports` specifically, the wall shows up earlier and differently**
because the casual-audience rule (see "Adding question batches" above)
removes most of the fact space a mined-out category would normally fall
back on (records, stats, obscure firsts) — so straightforward "what do
you call X" terminology runs dry well before whole-corpus dedup alone
would flag it. Confirmed 2026-09-03: after the 368-517 batch covered
terminology across nearly every mainstream sport, a follow-up batch found
that lane mostly exhausted and instead drew on **adjacent angles that stay
within the casual rule but aren't pure terminology**: which sport a
famous movie depicts, which sport an everyday idiom comes from (verify
via `WebSearch`, phrase as "comes from the sport of X" rather than
asserting a specific etymology story when the exact origin is disputed —
same principle as "Near-synonym option sets" below), historical
event outcomes (Olympic/World Cup host cities and one-time results, not
career stats), and pop-culture-famous non-stat moments (Zidane's
headbutt, the Tyson-Holyfield ear bite, Kerri Strug's vault) rather than
more terminology. This pivot is worth reaching for on any future
category that combines "a few hundred+ questions" with its own
audience-scoping rule that shrinks the usable fact space faster than raw
volume would suggest.

**`science-technology` crossed this same wall by 2026-09-03**, at 1,168
questions before that session's 202-question batch (now ~1,370) — deeper
than `friends` (852) or `big-bang-theory` (861) were when they were
first flagged, and `templates/science-technology.md`'s own AVOID list
had already grown past the ~30-40 entry guideline without ever being
pruned (see that file's MAINTENANCE NOTE). What worked at this depth:
dump every existing answer in the category to a scratch file and read
it (`node -e "require('./data/questions/science-technology.json').forEach(q=>console.log(q.answer))"`,
piped to a file — cheap, ~1,100 lines) to see which sub-domains were
visibly thin, rather than guessing from memory or the AVOID list alone;
pick specific under-covered sub-domains (that session: pharmacology
history, materials-science manufacturing processes, famous experiments,
meteorology/disaster scales, genetics/biotech Nobel-prize facts, nuclear
particle-physics basics, computing history/security incidents) instead
of drafting generally; batch `WebSearch` verification by entity/topic
before drafting rather than after, for every specific
date/attribution/number claim; and over-draft by ~15% (210 drafted, 201
survived to merge — most cuts came from `--full-answer-audit`, not the
default check, see the "Cross-category duplicates" note above).

**A second science-technology session on 2026-09-03 (same day, ~1,370
questions going in, ~1,600 coming out) got a much lower cut rate — 233
drafted, only 2 cut — by picking sub-domains genuinely adjacent to, but
outside, everything the AVOID list already names**, rather than
continuing to mine the same well-covered territory harder: batteries/
energy-storage history, forensic-science techniques, medical devices/
diagnostics (as opposed to imaging history, which was already covered),
electricity/circuit fundamentals (diode, resistor, transformer, relay —
components that had shown up only as *distractors* in existing
questions, never a correct answer), robotics/automation history, optics/
acoustics beyond what was covered, polymers/ceramics/composites,
aviation/aerospace engineering, immunology/vaccine-technology types
(inactivated/subunit/toxoid/conjugate — again, terms already floating
around the corpus only as distractors), renewable-energy mechanics, and
general chemistry fundamentals (titration, buffer, molar mass). The one
confirmed duplicate (a robot-word-etymology fact) was a cross-category
hit against `world-cultures`, not against `science-technology` itself.
Two takeaways: (1) "memory-only drafting is exhausted" describes the
*angles already drafted*, not the category's whole fact space — a
category can still have plenty of clean, memory-confident material left
once you stop re-approaching the same chestnut-dense corners (unit
lookups, famous scientists, famous experiments, computing acronyms) and
instead ask "what adjacent sub-domain has never been touched at all,"
the same way `find-gaps.js` surfaces answers that only ever show up as
wrong options; (2) grepping the corpus for a candidate term (e.g.
`grep -i "diode"`) and confirming it never appears as an `"answer"`
value, only in `"options"`, is a cheap, high-confidence green light
before drafting that specific fact — cheaper than a WebSearch and a
stronger signal than eyeballing the AVOID list.

**`animals-nature` crossed this same wall by 2026-09-03**, at 1,169
questions before that session's 202-question batch (now ~1,371), with
`templates/animals-nature.md`'s own AVOID list at 118 entries — already
past guideline size, same situation science-technology was in (see
above; both got the section-restructure treatment rather than a flat
prune). The species/quirk-fact angles that dominate the existing corpus
(a surprising fact about a specific named animal or plant) were
genuinely mined out — a dump-and-read of every existing answer plus
targeted greps for ~80 candidate terms across a dozen candidate
sub-domains kept turning up "already covered," often in a form the
AVOID list didn't even list explicitly (e.g. cuckoo/cowbird brood
parasitism, mangrove salt filtration, four-chambered crocodilian
hearts — all fully covered but easy to almost re-draft from memory
without checking). **What actually worked was a different *kind* of
sub-domain, not just a different topic**: this category had ~1,169
questions of concrete species facts but had never touched abstract
ecology/evolution/genetics/taxonomy/conservation *vocabulary and
concepts* at all (niche, trophic level, homologous vs. analogous
structures, allopatric vs. sympatric speciation, IUCN Red List
categories, codominance, etc.) — a completely different axis from "which
species hasn't been asked about yet," and one `find-gaps.js` can't
surface since it's keyed to a curated subject list, not abstract terms.
Grepping ~80 candidate concept terms against the corpus before drafting
(all either zero hits or hits that were clearly a different, unrelated
fact) let the batch go to 202 survivors on 208 drafted — a ~3% cut rate,
all 6 cuts caught by `--full-answer-audit` finding the same concept
already defined in a *different* dupeGroup-shared category (see
"Generic concept/definition questions" under "Duplicate detection"
above), not by anything the pre-drafting greps could have caught, since
those greps only checked the target category. Lesson for any other deep
category: when species/entity-fact drafting dries up, check whether the
category's own *abstract vocabulary* (the concepts and terminology
underpinning its subject, as opposed to facts about specific instances
of it) has been drafted at all before concluding the category is
exhausted — it usually hasn't, because concept questions don't fit the
"surprising fact about X" mold most drafting sessions default to.

## Accessibility-constrained drafting hits the corpus's most-mined layer

A request for a batch of only broadly accessible/casual-difficulty
questions (asked with no category preference, "not niche, answerable by
an average intelligent person") is a fundamentally different drafting
constraint than the default "avoid the obvious, favor lesser-known"
instruction baked into every `templates/<category>.md` prompt — and it
routinely collides *harder* with the existing corpus than a normal
batch would, not easier, because "accessible" facts are exactly the
ones a fact-hungry corpus with 20,000+ questions has been mining hardest
for years. Confirmed 2026-09-03 drafting 200 such questions
(music-942–1022, world-cultures-1535–1622, sports-668–702, chosen after
ruling out history/geography/space-astronomy/food-drink/general — their
own `templates/*.md` AVOID lists were already wall-to-wall chestnuts,
the opposite signal from what an accessible-only batch needs): the
default `check-draft.js` pass alone cut ~15-20% of each category's
draft, and `--full-answer-audit` plus a manual read caught a further
similar-sized slice — total cut rates of 24% (music, 92→70 before a
top-up), 15% (world-cultures, 89→76 before a top-up), and 33% (sports,
46→31 before a small top-up), before topping each back up toward the
200 target. Sports was the extreme case: the casual-audience rule's own
"basic rules and terminology" lane is *also* the most heavily pre-mined
lane in that category (see `templates/sports.md`'s 2026-09-03 addition),
so aiming for "accessible" and aiming for "not yet asked" pointed at
almost the same exhausted territory.

**Before picking categories for a request like this, spot-check each
candidate's own template file, not just its question count.** A
template whose AVOID list already reads as a list of *famous, obvious*
facts (not obscure ones) is a signal the category's accessible band is
thin, regardless of how "deep" or "shallow" the category looks by raw
count — geography's AVOID list is longer than almost any other category
specifically because capital-city and superlative lookups (the most
accessible geography angles there are) have been drafted over and over.
Categories whose AVOID lists lean toward specific/niche items (music,
world-cultures at the time of this session) are a better bet than ones
whose AVOID lists are dominated by "first/only/largest X" or "how many Y
per Z" — those are already-mined accessible chestnuts.

**Once drafting, over-draft by more than the usual ~15%** for this
constraint specifically — 20-25% is safer, since the duplicate rate runs
higher than a normal batch. A same-day top-up round (drafting a smaller
second pass once the real cut rate is known, targeting sub-domains that
scored zero collisions in the first pass — e.g. world-cultures'
dress/textile/dwelling angles and music's instrument-family angles both
came back completely clean while "famous musician" and "famous
custom/festival" facts got hit hardest) is a cheap way to close the gap
without redrafting the whole batch from scratch.

**A second accessible-difficulty session (2026-09-03, same constraint,
no category preference) confirmed the pattern above and added three more
lessons.** Every category already touched that day (music, world-cultures,
sports) was off the table to avoid same-day re-collision with the batch
just shipped, and a fresh AVOID-list read ruled out `civics-law-economics`
and `film-tv` outright — both had explicit saturation notes at the *bottom*
of otherwise-plausible-looking AVOID lists (civics: "~32-58% duplicate
rate across recent batches... the term-glossary format is essentially
exhausted for anything short of genuinely obscure terms" — the opposite
of what "accessible" needs; film-tv: wall-to-wall famous-fact entries top
to bottom, same signal as geography). **Read the entire AVOID list before
picking a category, not just the first screen of it** — a list can look
fine for 30 lines and hit a saturation warning at line 140. That left
`mythology-religion` (609 questions, one of the two smallest categories)
as the only viable pick; per the "don't hunt for a second category"
call, the whole 200-question ask ended up drafted into that one category
across two waves, landing at 163 net new questions (609→772) rather than
the requested 200 — a deliberate quality-over-target-count tradeoff once
every other candidate category was confirmed unworkable, not an oversight.

1. **Every single duplicate in wave 1 (46 of 148 drafted, 31%) was a bare
   "who/what is [major entity]" identity fact — not a narrative detail, a
   symbol, a number, or a comparative fact.** Wave 2, drafted with an
   explicit rule to *skip bare identity facts entirely* and favor
   second-tier narrative/detail facts instead (a myth's specific plot
   point, a numbered detail, a distinguishing attribute, a comparative
   fact between two traditions), cut at under 3% (2 of 79) from the
   default `check-draft.js` pass and only 1 more from `--full-answer-audit`
   — the short-answer manual pass (see the `--full-answer-audit` length-
   floor gap under "Duplicate detection" above) caught one further
   duplicate that both tools missed. For any well-established `general`-
   derived category, treat "who/what is [X]" as the single most
   over-mined stem shape and design around it from the first draft, not
   as a category to discover via check-draft.
2. **The pre-draft green-light check (dumping the target category's
   answers and grepping candidate terms, from the first accessible
   session) needs two corrections to actually work:** dump and grep the
   *entire* corpus, not just the target category (a `general`-derived
   category's easy chestnuts often live in `general.json`'s own new
   content, not just the historically-migrated `general-NNNN` entries
   sitting inside the target file — see the length-floor gap note under
   "Duplicate detection" for how this hid two real duplicates from every
   automated check at once); and read the *matched question's stem*, not
   just the hit count. A count of "1" on a major entity reads as "room to
   draft," but if that one hit is the bare identity fact, the room is an
   illusion — the identity fact is exactly what a fresh draft reaches for
   first. `grep`ing ~30 candidate sub-angles (not just entity names) drawn
   from a specific list of narrative/detail facts per tradition — not
   "which gods haven't been asked about" — is what actually finds open
   territory at this depth.
3. **Merge and validate each wave before drafting the next, rather than
   batching two waves through check-draft together.** Wave 2's
   check-draft run saw wave 1 through the live corpus once it was merged,
   so cross-wave duplication was caught for free with no separate union
   pass — the same principle as "process sequentially, one file fully
   checked-and-merged before the next's check-draft run starts" under
   "Large batches parallelized via fork agents," just applied within a
   single category across same-session waves instead of across files.

**A third accessible-difficulty session (2026-09-03, same constraint, no
category preference) picked categories by grepping candidate lanes
against the full corpus *before* drafting, rather than by reading AVOID
lists alone — and confirmed even "second-tier" facts are more pre-mined
than they look.** With every category touched earlier that same day
(mythology-religion, music, world-cultures, sports, animals-nature,
science-technology) off the table, and `general`/space-astronomy/
arts-literature/geography/civics/film-tv already flagged elsewhere in
this file as saturated or exhausted, the remaining field was
`business-brands`, `food-drink`, and `history`. Per-lane grepping (8-10
concrete angles per candidate — parent-company ownership, brand
country-of-origin, mascot real names, cooking-technique vocabulary,
cocktail base spirits — each checked against **all 17 files**, not just
the target category) picked `business-brands` (no `dupeGroup` at all,
so fully isolated from cross-category collision) and `food-drink`
(cooking technique/cocktail/cheese-origin lanes scored clean on the
pre-draft grep) over `history` (not grepped further once two viable
categories were found — "don't hunt for a second category" once two
are confirmed workable, same call as the second accessible session).

1. **The pre-draft grep still under-caught real collisions — full
   verification only happens post-draft.** ~90-100 questions were
   drafted per category on facts that scored zero or low hits during
   lane-selection grepping; `check-draft.js`'s default pass plus
   `--full-answer-audit` still caught 10-13 real duplicates per category
   afterward (business-brands: Bounty/Verizon/Skittles/Trix/Lay's
   slogans, Bubble Wrap, M&M's founders, Barbie's full name, Starbucks'
   name origin, eBay's first sale, Red Bull's inspiration, Blockbuster/
   Netflix, Snap-Crackle-Pop, all already covered; food-drink: Gruyère/
   Roquefort/Halloumi/Cognac country-of-origin, mise en place, Vitamin D
   from sunlight, beer's barley base, vanilla's orchid origin, fortune
   cookies' US origin, Worcestershire's anchovies, "fond," umami, the
   Sazerac's rye base, sourdough's lactic acid bacteria, and nachos'
   inventor nickname — see `templates/food-drink.md`'s new "hidden
   mini-series" note on cheese/wine/spirit country-of-origin facts
   specifically). Lane-level grepping (does this *category of fact*
   have open territory) is a filter for picking a category, not a
   substitute for per-fact verification once drafting starts — budget
   for the full check-draft pipeline regardless of how clean the
   pre-draft grep looked.
2. **Business trivia's "second-tier" layer (mascot real names, slogan
   origin stories, acquisition prices, invention-accident stories) is
   *not* meaningfully less mined than the "bare identity fact" layer
   the mythology-religion session warned about** — it's just a
   differently-shaped chestnut. `business-brands` had already
   independently covered nearly every one of the slogans/mascots/origin
   stories this session reached for from general knowledge (M&M's
   slogan, Bounty's slogan, Barbie's full name, Starbucks' name origin,
   eBay's first sale), because those are exactly the same "surprising
   but well-known" facts a memory-only drafting pass reaches for by
   default, template AVOID list or not. Two things that helped anyway:
   drafting from **specific companies/products the existing corpus
   hadn't touched at all** (checked by grepping the company/product name
   itself, not just the fact) rather than fresher angles on
   already-covered companies; and running the mandatory short-answer
   pass (`answer.length < 6`, full-corpus scan) even for a category with
   mostly long/specific answers — it caught business-brands' M&M's,
   Barbie, and Starbucks duplicates that `--full-answer-audit` also
   caught, confirming the two checks overlap but neither alone is
   sufficient.
3. **Coincidental same-answer reuse across many drafted questions in one
   batch is extremely common and is not itself a signal — read every
   flagged pair.** This batch's `check-draft` runs threw 15-20 "shares
   answer with draft[N]" advisories per category (Amazon owning
   Whole Foods/Twitch/Zappos; Germany as the origin of Aldi/Puma/
   Birkenstock; France as the answer for Bordeaux/Comté/Danone), and
   every single one was a genuinely distinct fact about a different
   specific company — a large batch of country-of-origin or
   parent-company questions will naturally reuse a handful of common
   countries/conglomerates many times over, and that reuse alone doesn't
   mean anything collided. Confirm by reading the paired question text,
   not by the advisory count.
4. **Multi-wave over-drafting within a single session works, but
   reshuffle the *entire* merged set at the end, not just the newest
   wave.** Each wave (main draft, then two small top-up waves once the
   real cut rate was known) was shuffled independently at draft time,
   then the full merged file was shuffled once more as a final step
   before assigning real IDs — cheap, and avoids the position-skew that
   would otherwise result from concatenating three separately-shuffled
   arrays of different sizes.
5. **Net result:** business-brands 97 drafted → 117 shipped after two
   top-up waves (1217 → 1334 questions); food-drink 73 drafted → 86
   shipped after two top-up waves (1195 → 1281 questions); 203 new
   questions total against a 200 target, roughly a 35% overall
   draft-to-ship attrition rate once all three waves are counted
   together — in line with the ~24-33% per-category rates the first two
   accessible sessions saw, confirming this constraint reliably costs
   roughly a third of any naive draft count regardless of which
   category absorbs it.

**A fourth same-day accessible-difficulty session (2026-09-03) hit a
genuinely different wall: at this point, three prior sessions had
already shipped ~570 accessible questions across mythology-religion,
music, world-cultures, sports, business-brands, and food-drink, plus
two unrelated same-day science-technology/animals-nature batches — 8
categories touched in one day. Every remaining untouched category
turned out to be saturated far deeper than its own `AVOID THESE ANGLES`
list reveals, which is the session's real finding.**

Before drafting, ~150 candidate facts were grepped directly against a
full-corpus dump (`answer ||| question` per line, every `data/questions/
*.json` file — cheaper and more reliable than reading each category's
template) rather than trusting AVOID lists or memory: 20th-century and
ancient/medieval history (Korean War, Camp David Accords, Hannibal,
Ides of March, Battle of Thermopylae, Trail of Tears, Monroe Doctrine),
non-Western history (Mali Empire, Great Zimbabwe, Songhai's Battle of
Tondibi, Machu Picchu, Aboriginal/Maori/Ashanti facts), arts-literature
beyond "who wrote/painted X" (fresco vs. tempera vs. gouache, Masaccio's
Trinity, egg tempera, sonnet/limerick/haiku definitions), world-cultures
dress/textile/dwelling (kimono, yurt, tulou, izba — confirmed "clean" by
the *first* accessible session, but fully drained by that same session's
own output), music's instrument-family lane (same story — sitar, koto,
didgeridoo, all now covered), Friends trivia (Central Perk, "Pivot!,"
the Moist Maker — some facts asked 2-3 times over), geography
microstates (every microstate capital and geographic-oddity fact, e.g.
Bhutan's national-sport archery, Andorra's highest-capital-in-Europe
status), and space-astronomy (individual Jupiter/Saturn moons' orbital
resonances, meteor shower parent bodies, Lagrange points). **Essentially
all ~150 came back already covered, frequently at a level of specificity
(Treaty of Lutatius, Siarnaq the Saturn moon, God's Number for a Rubik's
Cube) that goes well beyond what any category's AVOID list documents.**
The lesson: a category's AVOID list records *confirmed duplicates found
in past batches*, not the corpus's actual coverage — it's necessarily
incomplete, since the many categories sharing `dupeGroup: "general"`
have apparently had multiple independent deep-mining passes over the
years whose output was never folded back into every affected category's
AVOID list. Treat "this category's own AVOID list looks thin" as weak
evidence either way (it was wrong in both directions this year: it
wrongly ruled out food-drink in the second accessible session, and
wrongly looked survivable for history/arts-literature/geography/
space-astronomy going into this fourth one) — a live full-corpus grep of
concrete candidate facts is the only real test, for ruling a category
*in* as well as *out*.

Given that even "medium, specific" facts (not just headline chestnuts)
were this saturated, the user was asked how to proceed and chose
"best-effort, no fixed count" over forcing 200 through further guessing.
**The pivot that actually worked: WebSearch-driven research into a
sub-domain neither `business-brands` nor `food-drink` had touched yet —
household/cleaning products and OTC medicines (Ziploc, Roomba, Sharpie,
Gorilla Glue, Windex, Swiffer, Febreze, OxiClean, Reynolds Wrap, Saran
Wrap, Scotch Tape, duct tape, Dawn dish soap, Vicks VapoRub, Tylenol,
Pepto-Bismol, Neosporin) and pantry-staple/snack brands one tier below
the already-mined soda/candy/cookie layer (Old Bay, Cheez-It, Ritz,
Fritos, Little Debbie, Goldfish, Kraft Mac and Cheese, Velveeta, Cool
Whip, Heinz Ketchup, French's Mustard, Spam, Nutella).** A pre-draft
grep of ~50 candidate brand names in this vein came back almost entirely
clean (vs. near-100% saturated for the soda/candy/toy/game brands
grepped first — Oreo, Pringles, Dr Pepper, Gatorade, Rubik's Cube,
Scrabble, Jenga, Clue, all deeply covered), and the resulting drafts
(actual WebSearch-sourced facts, not memory guesses) went through
`check-draft.js` clean on both passes plus the short-answer full-corpus
check: 62 drafted, 61 survived to merge (34 business-brands, 27
food-drink) — a ~98% survival rate, sharply better than the 65-76%
seen in every earlier accessible session. **Two mechanisms explain the
gap:** (1) memory-based guessing, even when deliberately aimed at
"lesser-known" facts, converges on the same handful of iconic
instances (the exact soda/candy/toy brands above) that every prior
session already reached for, because that's what "notable enough to
draft trivia about" surfaces from memory first — actual research
turns up facts about brands a memory-only pass wouldn't have
prioritized, which are just as real and just as fair but weren't on
anyone's mental shortlist yet; and (2) `business-brands` and
`food-drink` are the only two categories with no shared `dupeGroup`
(see "Duplicate detection" above), so their coverage reflects only
their own past sessions' angle choices, not a systematic multi-category
mining effort the way every `dupeGroup: "general"` category apparently
has behind it — a lower ceiling on total questions, but a much more
predictable one to reason about via direct grep. **When a full-corpus
grep shows a category's "obvious" layer this saturated, look for a
sibling sub-domain within a *dupeGroup-isolated* category before
concluding the day's accessible-content budget is exhausted** — it's a
more reliable lever than continuing to test shape-shifted angles within
already-exhausted `dupeGroup: "general"` categories.

## What not to do

- Don't add a build step, framework, or bundler — this is intentionally
  plain HTML/CSS/JS with no build step.
- Don't hand-edit `version.json` — `ship`/`stamp-version.js` owns it.
