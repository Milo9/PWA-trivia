# CLAUDE.md

Instructions for Claude working in this repo. For schema, project layout,
and the full add-a-batch workflow, **read README.md first** — this file
only covers what the README doesn't (behavioral rules and hard-won
lessons, not documentation, and not a batch-by-batch changelog — that's
what `git log` is for).

## Always ship after making changes

After any edit to `data/` (new questions, category changes) or app code,
run:

```
npm run ship -- "commit message"
```

Do not leave changes staged/uncommitted and do not run `git add` /
`git commit` / `git push` manually — `ship` bundles validate → bump
version → stamp cache → add → commit → push in the right order, and
skipping steps (e.g. committing without stamping) means phones won't
pick up new content. Write the commit message yourself based on the
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
  `--full-answer-audit` doesn't.
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

After merging, **always re-run `npm run validate` before shipping**,
even after a careful manual review pass — it's free, and it catches
cases where a planned cut didn't actually make it into the executed
merge.

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
- Default to judgment/memory; reach for `WebSearch` only for genuinely
  uncertain or hard-difficulty specific claims. Verifying all ~14,000
  questions via search would be prohibitively expensive and isn't the
  point — most questions are obviously fine on a read-through.
- Fix directly in `data/questions/<category>.json` (or cut, per the
  existing "unfixable without changing the underlying fact" guidance).
  Run `npm run validate`, then `npm run ship -- "…"` as usual.
- **Mark a chunk `complete` only after shipping its fixes**, not before —
  `audit.js complete` just edits `audit/progress.json`, it doesn't ship
  anything itself, so marking complete first and shipping later risks an
  interrupted session leaving fixes unshipped but the chunk already
  recorded as done.
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
- The 12 categories split out of `general` don't have `data/topics.json`
  entries yet, so `analyze.js`/`find-gaps.js` report "no topic list
  configured" for them. Category-level question counts (`npm run
  validate`'s header, or `data/categories.json`) are the current signal
  for which is thinnest. Adding per-category subject lists (the way
  `friends`/`big-bang-theory` track individual characters) would sharpen
  this but hasn't been done.

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
