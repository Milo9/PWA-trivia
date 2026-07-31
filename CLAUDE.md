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
  ~790, `big-bang-theory` through ~711, `general` through ~2745).
- Warnings from `validate` about near-duplicate questions are judgment
  calls, not automatic failures — only fix ones that are actually the
  same question reworded.
- Before merging any drafted batch into `data/`, run
  `npm run check-draft -- <path-to-draft.js>` on it. It scores every
  drafted question against the *entire* existing corpus (not just
  keyword grepping) and rejects known hedge/meta-answer patterns. See
  README for the draft file format and full workflow.

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
