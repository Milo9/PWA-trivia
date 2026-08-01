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

## Adding question batches

- Follow the exact schema and process in README.md ("Adding a new batch
  of questions"). Don't re-derive it from scratch each session.
- IDs must be unique **across the whole dataset**, not just the file —
  check the highest existing number in that category before picking the
  next batch's range (e.g. this repo currently has `friends` through
  ~790, `big-bang-theory` through ~711, `general` through ~2855). Note
  IDs have gaps from the 2026-07-31 dedup pass (deleted entries were not
  renumbered) — check the highest number, not the file's entry count.
- Warnings from `validate` about near-duplicate questions are judgment
  calls, not automatic failures — only fix ones that are actually the
  same question reworded.
- Before merging any drafted batch into `data/`, run
  `npm run check-draft -- <path-to-draft.js>` on it. It scores every
  drafted question against the *entire* existing corpus (not just
  keyword grepping) and rejects known hedge/meta-answer patterns. See
  README for the draft file format and full workflow.

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
  Same-answer pairs below 0.55 overlap (now 265, since some 3-member
  clusters collapsed to 2) remain unreviewed — still noise per the
  triage rule above, not a backlog worth wading into.
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
