# CLAUDE.md

Instructions for Claude working in this repo. For schema, project layout,
and the full add-a-batch workflow, **read README.md first** — this file
only covers what the README doesn't (behavioral rules, not documentation).

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

## Prefer token-efficient sequential work over parallelized speed

The user prioritizes token efficiency over wall-clock speed for work in
this repo (confirmed 2026-08-01). Default to doing multi-step work
(drafting, classifying, reviewing, deduping) as a single sequential pass —
inline, or with one `advisor()` check before committing to an approach —
rather than fanning out across multiple parallel subagents or forks.
Parallelizing trades more total tokens for less wall-clock time: each
additional fresh agent re-derives context from scratch (no cache
sharing), and even forks (which do share cache) add their own reasoning/
output overhead plus a merge/reconciliation step the sequential version
doesn't need. Only reach for parallelism when something *other* than
speed specifically requires it — e.g. the 2026-08-01 category-split
classification (below) deliberately used independent no-shared-context
agents to avoid one agent's choices biasing the next, not for speed — and
even then use the minimum parallelism that gets that specific benefit.
That said, a single sequential agent applying the split's own documented
tie-break rules classified 503 more questions cleanly in one pass during
the 2026-08-01 `questions_inbox` merge (see "Expanded 2026-08-01" and the
merge-gate lesson below) — now that those tie-break rules are written
down, a *future* reclassification likely doesn't need N fresh parallel
agents either; that requirement was specific to not having established
rules yet. Read the "Large batches parallelized via fork agents" lesson
below as how to parallelize *safely* if wall-clock speed is genuinely the
binding constraint, not as a default recommendation to reach for it.

## Adding question batches

- Follow the exact schema and process in README.md ("Adding a new batch
  of questions"). Don't re-derive it from scratch each session.
- IDs must be unique **across the whole dataset**, not just the file —
  check the highest existing number in that category before picking the
  next batch's range (e.g. this repo currently has `friends` through
  ~790, `big-bang-theory` through ~711). Note IDs have gaps from the
  2026-07-31 dedup pass (deleted entries were not renumbered) — check the
  highest number, not the file's entry count.
- **`general`-derived categories have two ID namespaces per file, and
  that's fine.** The 2026-08-01 split (see "General Knowledge split into
  topic categories" below) moved existing `general-NNNN` questions into
  new category files (`history.json`, `geography.json`, etc.) *without*
  renumbering them — those entries kept their original `general-NNNN` id
  even though `category` now says `history`/`geography`/etc. `id` prefix
  matching `category` is a convention, not something `validate.js`
  enforces (`ID_PATTERN` only requires `<letters/digits/hyphens>-<3+
  digits>`, globally unique). **New** questions drafted for one of these
  categories get a fresh, category-prefixed sequence starting at
  `<category>-001` — don't continue the old `general-` numbering, and
  don't be confused by `analyze.js`'s `nextId()` suggesting something odd
  for these files (it just takes the max trailing digits in the file
  regardless of prefix, so a file mixing `general-1867` and
  `history-004` will suggest `history-1868` — ignore the number, keep the
  category prefix and pick the next number after the highest ID that
  *already* uses that prefix in that file).
- Warnings from `validate` about near-duplicate questions are judgment
  calls, not automatic failures — only fix ones that are actually the
  same question reworded.
- Before merging any drafted batch into `data/`, run
  `npm run check-draft -- <path-to-draft.js>` on it. It scores every
  drafted question against the *entire* existing corpus (not just
  keyword grepping) and rejects known hedge/meta-answer patterns. See
  README for the draft file format and full workflow.

## External-agent drafting: avoiding convergent duplicate topics

`DRAFTING-PROMPT-TEMPLATE.md` holds one fully self-contained, ready-to-
copy-paste prompt per category, for handing batch-drafting to an AI agent
with no context of this repo. **That file is copy-paste content only —
it has no instructions aimed at the user or at Claude, just the prompts
themselves.** Claude maintains it directly (see below); the user never
edits it or assembles a prompt from pieces — they pick a category's
section and copy the whole code block as-is.

Those external agents draw on roughly the same slice of general/training
knowledge any other agent — or a memory-only Claude draft — would, so
different agents (and repeat runs of the same one) tend to converge on the
same well-known chestnuts. This is the same convergence problem as the
memory-exhaustion issue documented below for `friends`/`big-bang-theory`,
just arriving from a different direction: many agents landing on the same
obvious facts, rather than one corpus slowly exhausting them.

**Don't front-load the prompt with the full corpus or a guessed topic
list** — expensive in tokens for a payoff that's mostly speculation before
you've seen what an external agent actually collides on. Instead, each
category's prompt has its own `AVOID THESE ANGLES` list baked in,
maintained iteratively:

1. After reviewing an inbox batch (i.e. after running `check-draft.js` and
   `validate` against it), note the **topic/angle** — not the literal
   question wording — behind every confirmed duplicate (e.g. "chemical
   symbol for tungsten," not the exact phrasing of the question that asked
   it).
2. Edit that category's `AVOID THESE ANGLES` list directly, in place, in
   `DRAFTING-PROMPT-TEMPLATE.md` — add the new angles to that one
   category's code block. Don't touch other categories' blocks, and don't
   maintain the list anywhere else; the prompt block itself is the only
   copy.
3. If a category's list grows past ~30–40 entries, prune it: drop angles
   too specific to plausibly recur, and keep the ones that show up
   repeatedly across batches (e.g. "SI unit of X," "chemical symbol for
   Y" — categories of chestnut, not just one-off facts).

**Seeded 2026-08-01** from the first inbox batch (`GLM52-01.js`, 100
`general`-category questions drafted by an external agent, reviewed and
merged as `general-2881`–`2970`): 10 of the 100 drafted questions collided
with the existing corpus, all common science/geography chestnuts. See the
per-category `AVOID THESE ANGLES` lists in `DRAFTING-PROMPT-TEMPLATE.md`
for the current state.

**Drafts now self-declare `category` (2026-08-01):** since each prompt in
`DRAFTING-PROMPT-TEMPLATE.md` is already for exactly one category, every
prompt's `OUTPUT FORMAT` example and rules now require the external agent
to stamp a fixed `"category": "<slug>"` (the real `data/categories.json`
id, e.g. `"history"`) onto every entry, rather than omitting it. `id` is
still excluded — that still requires knowing the current max ID in the
target file at merge time, which the external agent can't know. This
doesn't remove any real classification work on Claude's side (the
category was already known from which prompt was used, and previously
got applied to the whole file in one step at merge time either way) — it
just removes the need for the user to state the category when handing a
completed draft back, and gives a field `check-draft.js`/a human skim can
cross-check against the filename it's being merged into.
`check-draft.js` doesn't read or validate this field itself (see its
header comment).

**Expanded 2026-08-01** (same day, larger batch): the 7 other pending
`questions_inbox/*.js` files predating the topic split (708 questions
total, drafted independently of each other and of GLM52-01.js — no shared
context, no "Angles already covered" list existed yet to steer any of
them) were processed together in one union merge-gate pass — see "one
merge-gate, not many" under "Lessons ported..." below for the technique.
231 of 708 (~33%) turned out to be duplicates, either of the existing
corpus or of each other across files — much higher than GLM52-01.js's
10%, consistent with these being older batches with nothing to steer them
away from chestnuts. The surviving 477 were classified into the 13 topic
categories (none of these drafts had a `category` field — they predate
the split) and merged; see `data/questions/*.json` git history around
that commit for the per-category counts. All confirmed-duplicate angles
from this batch were folded into the per-category lists below.

## General Knowledge split into topic categories (2026-08-01)

`general` (2825 questions) was split into 12 topic categories plus a
smaller `general` catch-all, so players can pick specific topics and so
drafting can be directed at whichever category is thinnest, rather than
everything living in one undifferentiated 2825-question bucket. New
categories (all in `data/categories.json`, files under
`data/questions/`): `history` (336), `geography` (307),
`science-technology` (464), `animals-nature` (170), `space-astronomy`
(163), `arts-literature` (249), `film-tv` (220), `music` (174), `sports`
(214), `food-drink` (148), `mythology-religion` (181), `world-cultures`
(143). `general` kept 56 questions that didn't fit any specific bucket
well (idioms, economics terms, legal principles, etc.) — it's a
deliberate catch-all, not a bug; keep using it for genuine misfits rather
than forcing a bad fit elsewhere.

**How the split was done:** every question's `question`+`answer` (not
`id`) was classified by parallel fresh agents (no shared context, so no
convergent bias toward any one category — see "Prefer token-efficient
sequential work" above for why this doesn't need repeating that way next
time) against a fixed 13-slug list
with explicit tie-break rules (planets → `space-astronomy` not
`science-technology`; human anatomy → `science-technology` not
`animals-nature`; mythological figures → `mythology-religion` even in an
ancient-civilization framing). Merge validated 100% coverage (every
original id mapped exactly once, no invalid category values) before any
files were written — see "IDs must be unique" above for why ids were
**not** renumbered in the process. The 8 batch agents ran independently
(no shared context, no cross-batch calibration) against contiguous id
ranges, so per-batch category distributions vary with whatever content
happened to cluster in that slice — e.g. one batch assigned zero
questions to `history` while another assigned 69. Spot-checked via
keyword grep (war/battle/king/queen/ancient/century/etc.) and confirmed
genuine (that slice really had no history-topic questions, not a
misrouted batch) rather than reviewing all 2825 by hand — if a future
session wants higher confidence, grepping each category file for
keywords strongly associated with a *different* category is the cheap
way to spot-check further.

**`findAnswerDuplicates` in `validate.js` gained a `dupeGroup` concept**
because of this split: that check skips same-answer pairs in different
categories (a cross-category match is usually coincidence — see the
function's own comment), which would have silently gotten *weaker* the
moment a same-answer pair that used to both be `general` ended up split
across e.g. `history` and `geography`. Every `general`-derived category
in `categories.json` carries `"dupeGroup": "general"`; the check compares
`dupeGroup ?? category` instead of raw `category`, so the whole former-
`general` bucket is still checked against itself as one group.
Verified empirically: baselining the pre-split `general.json` against the
pre-fix logic and the post-split files against the fixed logic both
produce zero same-answer warnings (the housekeeping backlog was already
fully resolved — see below), and a synthetic cross-category pair
(same answer, ~0.60 word-overlap question text, one question filed under
`history` and one under `geography`) correctly triggers the warning
post-fix, confirming the mechanism works rather than just silently
finding nothing.

**Incidental finding, not yet fixed:** while constructing that synthetic
test, `Ferdinand Magellan` turned up as the answer to *four* essentially-
identical circumnavigation questions already in the corpus
(`general-465`, `general-750`, `general-1038`, `general-1882` — all still
filed under the `general` catch-all). None of the four pairwise
combinations reach the 0.70 near-duplicate text-overlap threshold
(highest is 0.60), and `findAnswerDuplicates`'s `MAX_ANSWER_GROUP_SIZE =
2` cap (see `validate.js`) means a group of 4 sharing this answer gets
skipped entirely as "probably a generic reused entity" — the same
heuristic that correctly ignores things like Shakespeare or Thomas
Jefferson here incorrectly waves through a genuinely narrow, specific
answer that just happens to have been drafted four separate times across
different memory-drafting sessions. This predates the 2026-08-01 split
(confirmed present in the original `general.json`) and is a real gap in
the group-size-cap heuristic, not something the split caused. Flagging
as backlog for a future dedicated audit — the fix is a human/AI judgment
call (which of the four is best-worded) like every prior housekeeping
pass, not a mechanical one.

**`topics.json`'s old 12-bucket `general` subject list was removed** — it
was literally these 12 new categories under their old keyword-alias
form, so it's now redundant with the categories themselves; per-category
question counts from `validate.js`/`analyze.js` give the same
"where's it thin" signal the old list did. None of the 12 new categories
has a `topics.json` entry of their own yet (`analyze.js`/`find-gaps.js`
will report "no topic list configured" for them) — adding finer-grained
per-category subject lists (the way `friends`/`big-bang-theory` track
individual characters) is a reasonable future enhancement, not done here.

**App changes to support this:** the category picker is now multi-select
(tap to toggle, "Play Selected" starts a round mixing all selected
categories' pools) instead of one-tap-per-category, since most of the
13 categories are individually much smaller than the old 2825-question
`general` was. Stats gained a `byCategory` bucket
(`{totalQuestions, totalCorrect}` per category id) recorded per-question
from `state.answers[].category` — accurate even in a mixed round, since
each question keeps its own real category regardless of which
categories were selected to build the round. The "seen" (repeat-
avoidance) `localStorage` keys stayed per-category
(`offline-trivia:seen:<categoryId>`). Because ids were **not**
renumbered, `offline-trivia:seen:general` on a returning player's device
is still correct and still read — it still matches the 56 questions that
stayed in the `general` catch-all. The 12 *new* category ids
(`offline-trivia:seen:history`, etc.) simply don't exist yet on a
returning device, so those categories start with a clean slate rather
than inheriting any prior seen-state from when their questions were part
of `general` — a one-time, harmless reset of repeat-avoidance for
whichever of those 336/307/etc. questions a given player had already
seen under the old single `general` category.

**`questions_inbox/` batches were left alone at split time** (6 pending
drafted batches, ~600 questions, all pre-split `general`-style content) —
processed 2026-08-01, same day, in a second pass; see "Expanded
2026-08-01" under "External-agent drafting" below for how the classify-
into-13-categories step actually went.

## Lessons ported from the Disney Trivia App sibling project

That project's question bank went through the same growth curve this one is
on now (memory-drafting exhaustion, near-duplicate audits, parallel-batch
coordination) at a larger scale (~2,050 questions across 7 categories), and
its CLAUDE.md accumulated some concrete, hard-won lessons worth carrying
over rather than re-learning here:

- **Answer-normalized duplicate detection.** `validate.js` and
  `check-draft.js` now also group questions by normalized *correct answer*,
  not just question-text word overlap — this catches "same fact, different
  wording" pairs a text-similarity check misses (e.g. "What weapon is Robin
  Hood skilled with?" → "Bow and arrow" vs. "What is Robin Hood's signature
  skill?" → "Archery" share zero words but are the same duplicate). The
  discriminator that actually separates signal from noise here is **how
  many questions share that exact answer**, not the answer's length — an
  answer used by more than 2 questions (Thomas Jefferson, Shakespeare,
  "Theoretical physics") is almost always a generic entity reused across
  unrelated facts, while an answer used by exactly 2 is disproportionately
  likely to be the same fact asked twice (confirmed empirically against
  this corpus: capping the group size at 2 kept known-real finds like
  "Scurvy" and "Transpiration" while dropping every generic-entity false
  positive an answer-length filter let through). Running this against the
  existing corpus during this port surfaced ~330 candidates (mostly in
  `general` — repeated "what does X stand for" acronym questions, repeated
  "who wrote/invented X" questions, repeated historical-event questions)
  that predate this check; that was a housekeeping backlog at the time.

  **Housekeeping pass completed (2026-07-31):** a full audit worked through
  this backlog plus the plain near-duplicate warnings. Triage rule: sort
  same-answer pairs by word-overlap score descending — high overlap
  (≥0.55) is dense with real duplicates, low overlap (<0.55, e.g. two
  questions that just happen to both answer "The Soviet Union" or
  "Oxygen") is almost all coincidental generic-entity noise, not worth
  wading through by hand. Fixed: the 4 near-duplicate warnings at ≥0.85
  similarity (2 were true dupes, 2 were false positives that stay in the
  corpus unchanged — `general-492`/`general-1857` ask "largest" vs.
  "second-largest country by land area," and `general-1375`/`general-2046`
  ask the try's point value in rugby union vs. rugby league, which
  actually differ — both pairs share wording but ask genuinely different
  facts, and will resurface at the top of any future score-descending
  sort, so don't re-flag them as bugs) and all 77 same-answer pairs at
  ≥0.55 overlap (one per pair deleted, keeping the better-written/more-
  specific variant — verified against `check-draft.js`'s own approach of
  spot-checking rather than blind rule-following; one entry,
  `general-664`/`general-1336`, was caught and swapped after an initial
  pass applied a "keep lower ID" shortcut that contradicted its own
  per-pair reasoning — 79 entries removed total across
  `general`/`friends`/`big-bang-theory`). This also caught a real factual
  bug, not just wording noise: `friends-284` had Ross's museum wrong
  ("The Museum of Natural History" instead of the show's actual fictional
  "The Museum of Prehistoric History," confirmed via web search) — its
  near-duplicate `friends-596` had the correct answer, which is how the
  mismatch surfaced. Same-answer pairs below 0.55 overlap (332 total
  minus the 77 reviewed = 255 remaining) and near-duplicate warnings in
  the 0.70–0.85 band (102 total) were **not** reviewed this pass — treat
  those as the remaining backlog for a future session, using the same
  sort-and-triage approach rather than reading them in original
  (unsorted) order.

  **Near-duplicate band resolved (2026-08-01):** worked through all 102
  near-duplicate warnings in the 0.70–0.85 band by fetching each pair's
  full `answer` field (not just question text) before deciding — the
  question-text similarity score alone isn't enough, since some
  high-similarity pairs turned out to test genuinely different facts
  (e.g. `general-1375`/`general-2046`: rugby union vs. rugby league try
  values, 5 vs. 4 points; `friends-184`/`friends-627`: Ross's marriage
  count vs. divorce count, a real running joke in the show where both
  happen to be three; `big-bang-theory-122`/`big-bang-theory-532`:
  different actors playing young vs. adult Mary Cooper). 15 of the 102
  were confirmed-legitimate false positives like these and were left
  alone (don't re-flag them). The other 87 were true duplicates —
  including three-way and four-way clusters the pairwise near-duplicate
  list undersold (e.g. "Greek goddess of wisdom and warfare" existed as
  3 near-identical entries; "scientific study of classifying organisms"
  as 3; Salvador Dalí/Surrealism as 3; most FIFA World Cup titles/Brazil
  as 3) — one survivor kept per cluster, the more precise/complete-
  worded variant. Deleting down to 2-member answer groups exposed a
  second-order effect: `validate.js`'s same-answer check only fires on
  groups of *exactly* 2, so a few real duplicates hiding in what used to
  be 3-member clusters (low text-overlap with the other two, so absent
  from the original near-duplicate list) surfaced only after the first
  cluster deletion — e.g. `friends-008` vs. `friends-286` (Ross's
  monkey) only appeared once `friends-552` was removed. Re-running
  `validate` after each deletion pass caught these; a single pass
  without re-checking would have missed them. 91 entries removed total.

  **Same-answer noise floor added (2026-08-01):** the 0.55 triage
  cutoff above was a manual rule a human/AI had to re-apply on every
  single `validate` run, since the checker itself reported everything
  down to 0.00 overlap — on this corpus that meant ~265 warnings that
  always resolved to "ignore this." Baked the cutoff into the tool
  instead: `validate.js` now exports `SAME_ANSWER_MIN_OVERLAP = 0.55`
  and both it and `check-draft.js` skip reporting same-answer pairs
  below that score, rather than reporting-then-discarding them every
  time. There is no remaining below-0.55 backlog to review — those
  pairs no longer surface as warnings at all. If a future full-corpus
  audit wants to re-examine that band specifically (e.g. hunting for
  factual errors, not duplicates), lower the constant temporarily
  rather than grepping raw `validate` output.
- **Coverage-table numbers lie by omission.** Disney's regex-based per-film
  coverage table repeatedly mislabeled well-covered films as "under-covered"
  because its keyword patterns didn't match how existing questions actually
  phrased things — confirmed wrong three separate times across batches.
  `analyze.js`'s thin-topic flags and the new `find-gaps.js` distractor-only
  report have the same failure mode (see README's "Finding what to draft
  next"): treat a low count as a reason to grep and confirm, not a reason to
  draft immediately.
- **Answer-structure heuristics catch real bugs, not just style nits.**
  Disney's audits found shipped questions where the answer leaked into the
  question text (e.g. "What type of animal is Geppetto's cat?") and options
  that were full sentences instead of noun phrases. `check-draft.js` now
  flags both (answer-leak is treated as a blocking problem; sentence-like
  answers are advisory, since legitimate multi-part names and "why"-style
  answers trip the same heuristic).
- **Periodic whole-corpus quality audits are worth doing on a mature bank,
  separate from content-expansion batches.** Disney ran dedicated passes
  (not tied to adding new questions) that specifically re-verified
  time-sensitive superlatives ("newest," "first," "record-holding" claims —
  these rot as new things launch or records get broken), category
  correctness against known-bad patterns, and distractor correctness (a
  "wrong" answer that's secretly also true elsewhere) — none of which the
  routine per-batch `validate`/`check-draft` gate is designed to catch.
  **This project does have this exposure already** — a grep of `general`
  for record/current-title-holder language (`as of|currently|current|tied
  with|record|most recent|latest|newest`) turned up ~25 hits during this
  port. Most are already correctly pinned to a year per Disney's rule 6
  below (e.g. general-717/2365 "largest population... as of the 2020s",
  general-1168/2310 "as of the early 2020s") or are permanently-settled
  historical facts (Bonds' home run count, Armstrong's stripped Tour
  titles). Two were NOT pinned and still actively contestable:
  **general-336** ("holds the record for most Grand Slam men's singles
  titles in history" → Djokovic) and **general-2045** ("most men's major
  championship victories in golf history" → Jack Nicklaus). **Resolved
  2026-07-31:** general-336 turned out to be an exact duplicate of
  general-2037, which already asked the same question correctly pinned
  ("as of the mid-2020s") — deleted general-336 rather than fixing it in
  place. general-2045 had no duplicate to fall back on, so it was pinned
  directly ("as of the mid-2020s"). Neither claim was re-verified against
  a live source; the pin is a durability fix (freezes the claim to a
  point in time) not an accuracy re-check — a future session should still
  confirm both are correct as of whatever "now" is by then.
- **Large batches parallelized via fork agents need one merge-gate, not
  many.** When splitting a big batch across multiple forks on disjoint
  topic buckets, forks can't see each other's drafts, so cross-fork
  duplication (not fork-vs-existing-corpus) becomes the real risk. Disney's
  fix: each fork writes to its own scratch file with a non-colliding
  placeholder ID range, and `check-draft.js`'s dedup/validation gate runs
  exactly once against the concatenated union of all forks' output before
  anything gets real IDs and gets merged — not once per fork.
  **The same principle applies to sequentially processing multiple
  pre-existing files, not just parallel forks** — confirmed 2026-08-01
  merging 7 pending `questions_inbox/*.js` batches (708 questions) in one
  session: building one union draft (each entry tagged with source file +
  original index) and comparing it against the corpus once caught
  cross-file duplicates that 7 separate `check-draft.js` runs would each
  have missed, since every one of those runs only sees its own file
  against the corpus. **`check-draft.js` has no draft-vs-draft
  comparison** (only draft-vs-corpus, plus a same-file answer index) — for
  a multi-file merge that pass doesn't exist yet and has to be written
  ad hoc (score every pair in the union with `wordSet`/`jaccard`, both
  already exported from `validate.js`); don't assume `check-draft.js`
  alone covers a multi-file merge. Even with both a corpus pass and a
  draft-vs-draft pass, expect a residual duplicate rate that only surfaces
  by reading the surviving questions: this batch had 26 further
  duplicates out of 503 post-gate survivors (~5%) that neither automated
  pass caught, because the phrasing differed enough that both the
  question-text overlap and the answer-text overlap fell below their
  respective thresholds (e.g. "which marine mammal has the densest fur,
  up to one million hairs per square inch" vs. "which animal is known for
  having the most dense fur of any mammal" — both answering "sea otter,"
  caught only while reading question+answer pairs by eye during category
  classification). Budget time for that manual pass on any future
  multi-file merge; the automated gate narrows the problem, it doesn't
  finish it.

## Memory-only drafting is exhausted for `friends` and `big-bang-theory` — and now `general` too

As of the batch that added `friends-691`–`790` and
`big-bang-theory-612`–`711` (both wiki-sourced), the two show categories
are deep enough (790 and 711 questions) that they already cover
essentially all well-known plot points, character facts, and cast
trivia a model can recall from training data alone.

**For further batches in these two categories, don't draft from
memory — fetch source material first.** Use `WebFetch`/`WebSearch`
against a fan wiki (e.g. the Friends and Big Bang Theory wikis on
Fandom) and pull facts from these page types, in order of yield:

1. Per-episode **guest-cast credit lists** and **minor-character
   list pages** — consistently the best-yielding vein (obscure actor
   names for one-off characters).
2. Character pages' **"Trivia"** and **"Appearances"** sections —
   dense with specific, quiz-able facts that aren't the iconic
   headline plot beats.
3. Episode **summary/plot** pages last, and skim rather than mine
   deeply — these are exactly the pages that already got mined into
   the existing questions, so the marginal yield here is low.

Still dedup against the full existing question corpus for every
candidate fact (that's what `check-draft.js` does) — sourcing from a
wiki fixes *accuracy*, not *duplication*; those are separate
problems.

`general` (now 2745 questions) crossed the same threshold in the same
batch: a memory-only draft pass hit a ~24% first-pass duplicate/near-
duplicate rate even while deliberately avoiding obvious chestnuts
(capitals, superlatives, chemical symbols, etc.), and needed two
replacement rounds digging into genuinely niche facts before coming up
clean. Future `general` batches should also lean on reference sources
(almanacs, topic-specific wikis/databases) rather than pure recall,
the same way `friends`/`big-bang-theory` do — pure memory drafting
still *works* here, it's just increasingly inefficient.

**Housekeeping resolved:** the batch that added `friends-691`–`790`
verified and corrected two facts shipped at "fairly confident" rather
than wiki-verified confidence in the prior batch: `friends-670`
(Kathy's actress was wrongly listed as Andrea Anders — corrected to
Paget Brewster) and `friends-655` (Joanna's cause of death was wrongly
listed as a heart attack — corrected to being hit by a cab). The other
flagged facts (Mona's and Bonnie's actresses, Ramona Nowitzki's
actress, the apartment street address) checked out as correct.
`big-bang-theory-611`'s answer (Neil Gaiman) was also correct but its
question stem mischaracterized the plot (said the guys sought his
autograph; actually they don't recognize him) — stem corrected, answer
unchanged.

**New, unverified-but-shipped facts from this batch, for a future
housekeeping pass:** none flagged — this batch's facts were all pulled
directly from wiki/IMDb/news sources during drafting rather than
recalled from memory, so there's no equivalent "fairly confident"
backlog this time.

## What not to do

- Don't add a build step, framework, or bundler — this is intentionally
  plain HTML/CSS/JS with no build step.
- Don't hand-edit `version.json` — `ship`/`stamp-version.js` owns it.
