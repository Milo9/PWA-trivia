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
  ~690, `big-bang-theory` through ~611, `general` through ~2600).
- Warnings from `validate` about near-duplicate questions are judgment
  calls, not automatic failures — only fix ones that are actually the
  same question reworded.
- Before merging any drafted batch into `data/`, run
  `npm run check-draft -- <path-to-draft.js>` on it. It scores every
  drafted question against the *entire* existing corpus (not just
  keyword grepping) and rejects known hedge/meta-answer patterns. See
  README for the draft file format and full workflow.

## Memory-only drafting is exhausted for `friends` and `big-bang-theory`

As of the batch that added `friends-651`–`690` and
`big-bang-theory-601`–`611`, both categories are deep enough (690 and
611 questions) that they already cover essentially all well-known
plot points, character facts, and cast trivia a model can recall from
training data alone. A pass drafting purely from memory in that
session yielded roughly **35% survivable output** — most drafts died
either because they duplicated something already asked (near-total
topic coverage) or because the model wasn't actually certain of the
fact and either hedged the answer or got it wrong outright.

**For further batches in these two categories, don't draft from
memory — fetch source material first.** Use `WebFetch`/`WebSearch`
against a fan wiki (e.g. the Friends and Big Bang Theory wikis on
Fandom) and pull facts from these page types, in order of yield:

1. Per-episode **guest-cast credit lists** and **minor-character
   list pages** — this was the single best-yielding vein in the
   memory-only pass (obscure actor names for one-off characters), and
   it only ran dry because the model was recalling rather than
   reading a cast list.
2. Character pages' **"Trivia"** and **"Appearances"** sections —
   dense with specific, quiz-able facts that aren't the iconic
   headline plot beats.
3. Episode **summary/plot** pages last, and skim rather than mine
   deeply — these are exactly the pages that already got mined into
   the existing 690/611 questions, so the marginal yield here is low.

Still dedup against the full existing question corpus for every
candidate fact (that's what `check-draft.js` does) — sourcing from a
wiki fixes *accuracy*, not *duplication*; those are separate
problems.

**Housekeeping for the next session that picks this up:** a handful
of facts in this batch were shipped at "fairly confident" rather than
wiki-verified confidence: in `friends-651`–`690`, the actors for
Kathy, Bonnie, and Mona, and Joanna's cause of death; in
`big-bang-theory-601`–`611`, Ramona Nowitzki's actress, the apartment
building street address, and the Neil Gaiman cameo. Before drafting
more, spend one pass verifying those specific IDs against a wiki and
fixing any that are wrong — don't just add more on top.

## What not to do

- Don't add a build step, framework, or bundler — this is intentionally
  plain HTML/CSS/JS with no build step.
- Don't hand-edit `version.json` — `ship`/`stamp-version.js` owns it.
