# Offline Trivia

A multiple-choice trivia PWA that installs to your iPhone's home screen and
runs fully offline once installed — built for travel, no data connection
required.

## How it works

- Plain HTML/CSS/JS, no framework, no build step.
- A service worker (`sw.js`) precaches the app shell and all question data
  on install, so the very first offline session already has everything.
- Categories and questions live as flat JSON under `data/`, kept separate
  by design so new shows/topics can be added without touching app code.

## Project layout

```
index.html, styles.css, app.js   — the app
sw.js                            — offline caching
manifest.webmanifest, icons/     — home screen install metadata
data/categories.json             — category manifest (id, name, file)
data/questions/<category>.json   — one array of questions per category
scripts/validate.js              — schema + duplicate + quality checks
scripts/check-draft.js           — pre-merge check for a not-yet-added batch
scripts/analyze.js               — difficulty/answer-position/topic coverage report
scripts/find-gaps.js             — topics used only as a wrong answer, never correct
scripts/stamp-version.js         — updates the offline cache version
scripts/serve.js                 — local dev server
scripts/generate-icons.ps1       — regenerates icons/ (Windows/PowerShell)
```

## Question schema

Each entry in a `data/questions/*.json` file looks like:

```json
{
  "id": "friends-041",
  "category": "friends",
  "difficulty": "medium",
  "question": "What is the name of...?",
  "options": ["Correct answer", "Wrong 1", "Wrong 2", "Wrong 3"],
  "answer": "Correct answer"
}
```

- `id`: `<category>-<3+ digit number>`, unique across the *entire* dataset,
  not just within the file.
- `answer` must be an exact string match to one (and only one) of `options`.
- `difficulty`: `easy` | `medium` | `hard`.
- Exactly 4 options, all non-empty and unique.

## Adding a new batch of questions

This is meant to be cheap to repeat, since generating question batches costs
tokens and re-auditing shouldn't:

1. Ask Claude to draft a batch for a category (existing or new). Point it at
   this README/schema for context if starting a fresh session. Draft into a
   scratch JS file (CommonJS, `module.exports = [...]`) of objects shaped
   like the schema below but **without** `id`/`category` — those get
   assigned when the batch is merged into `data/`. See "Sourcing facts for
   a heavily-populated category" below before drafting `friends` or
   `big-bang-theory` — memory-only drafting is exhausted for both.
2. Check the draft *before* merging it into `data/`:
   ```
   npm run check-draft -- <path-to-draft.js>
   ```
   This scores every drafted question against the entire existing corpus
   (not just a keyword grep) using the same fuzzy-match function
   `validate.js` uses, and rejects known hedge/meta-answer patterns (e.g.
   an option that says "this isn't a real plot point" instead of giving a
   real answer). It also reports, as advisory notes (not blocking — see
   below): the answer text leaking verbatim into the question, options that
   read as a full sentence rather than a short answer, and a drafted
   question sharing its correct answer with an existing (or another
   drafted) question at low text overlap — the same fact tested with
   different wording (e.g. "What weapon is Robin Hood skilled with?" →
   "Bow and arrow" vs. "What is Robin Hood's signature skill?" → "Archery")
   often has *low* text overlap, so it slips past the word-overlap
   duplicate check above; matching on the answer instead catches it (only
   when that answer isn't already common across several existing
   questions, since a widely-reused answer like a country or a person's
   name is a coincidence, not a duplicate signal). Fix anything it flags as
   a schema problem or a likely duplicate (score ≥ 0.85) before moving on;
   near-duplicate warnings (0.70–0.85) and the advisory notes are judgment
   calls like the ones from `validate`.
3. Merge the draft into `data/questions/<category>.json`, assigning each
   entry a sequential `id` starting one past the current highest number in
   that category, and setting `category` to match.
4. Run the full audit script — no API calls, so re-running it is free:
   ```
   npm run validate
   ```
   This checks schema correctness, flags exact duplicates as **errors**, and
   flags near-duplicate question text (fuzzy word-overlap match, within *and*
   across categories) as **warnings** for a human/AI judgment call. It also
   flags pairs of questions in the same category that share a correct
   answer used by only one other question (not a widely-reused one) but
   have low question-text overlap — the whole-corpus version of the
   same-fact-different-wording check `check-draft.js` runs on a single
   batch.
5. Fix anything flagged. Warnings aren't automatically wrong — e.g. two
   genuinely different questions can share enough wording to get flagged;
   use judgment (or ask Claude to look at the specific pair) rather than
   re-running a full AI review over the whole set.
6. Before deploying, refresh the offline cache version so phones actually
   pick up the new content next time they're online:
   ```
   npm run stamp
   ```
7. Commit and push. `npm run ship -- "commit message"` bundles steps 4, 6,
   and the git add/commit/push into one command — it still won't write the
   commit message for you, since that requires actually knowing what
   changed, but it guarantees validate-then-stamp always runs first and
   collapses the rest into one call.

### Finding what to draft next

`npm run analyze` reports difficulty balance, correct-answer position bias,
and (for categories with a `data/topics.json` entry) which tracked subjects
are thinnest. `npm run find-gaps` complements it: it reports tracked
subjects that show up as a *wrong* answer somewhere but have never been the
correct answer to any question — a subject already in the corpus's orbit
that hasn't had its own question yet, which tends to be a cheaper source of
genuinely fresh angles than guessing.

Both are keyword/alias-based against `data/topics.json`, so treat "thin" or
"zero-coverage" labels as a lead to spot-check, not a verdict — a topic can
look under-covered purely because its aliases don't match how existing
questions happen to phrase it. Grep the actual corpus for the topic before
assuming it's open. `find-gaps.js` in particular can only surface subjects
someone already curated into `topics.json` — for `friends`/`big-bang-theory`
that list is just the main cast, who obviously already have plenty of
correct-answer questions, so it will usually report nothing there. It's
most useful for a category like `general` with broader subject buckets.

### Sourcing facts for a heavily-populated category

Once a category has a few hundred questions, drafting purely from a model's
own training-data memory stops working well: most well-known facts are
already asked, so new drafts either duplicate something existing or rest on
facts the model isn't actually sure of. `friends` (690 questions) and
`big-bang-theory` (611 questions) are already past that point — see
CLAUDE.md for the specifics of what a memory-only pass yielded there.

For those categories (and any other category that gets similarly deep),
fetch source material with `WebFetch`/`WebSearch` instead of drafting from
memory — e.g. against the Friends and Big Bang Theory wikis on Fandom.
Highest-yield page types, in order:

1. Per-episode guest-cast credit lists and minor-character list pages.
2. Character pages' "Trivia" and "Appearances" sections.
3. Episode summary/plot pages — lowest marginal yield, since these are
   what's already been mined into the existing questions.

This fixes accuracy (facts come from a source instead of a guess), not
duplication — still run `check-draft.js` against the full corpus for every
candidate fact regardless of where it came from.

## Adding a new category

1. Add a question file at `data/questions/<new-id>.json` (array of question
   objects, same schema).
2. Add an entry to `data/categories.json`:
   ```json
   { "id": "new-id", "name": "Display Name", "file": "questions/new-id.json" }
   ```
3. Run `npm run validate` and `npm run stamp`.

No app code changes needed — the category list and service worker precache
list are both derived from `categories.json` at runtime.

## Local testing

```
npm run serve
```

Then open `http://localhost:8080` in a browser. The service worker requires
`http://` (not `file://`) to register.

To test true offline behavior: load the page once, then use your browser's
dev tools to go offline (or actually disconnect), and reload.

## Deploying to GitHub Pages

1. Push this project to a GitHub repo.
2. In the repo settings, enable GitHub Pages for the root of the default
   branch (or `/docs` if you prefer — move files there if so).
3. Visit the published `https://<you>.github.io/<repo>/` URL in Safari on
   your iPhone.
4. Tap the Share icon → **Add to Home Screen**.
5. Open the app from the home screen icon (not from Safari) at least once
   while still online, so the service worker finishes precaching everything.

From then on, it works with no connection. Because it's added to the Home
Screen (standalone mode), it's exempt from Safari's normal 7-day inactive-site
data eviction — the cached questions aren't at risk of quietly disappearing
between trips. Whenever you publish new/updated questions, just reopen the
app once with wifi on and it'll pick up the changes in the background.

**Before you travel:** do one real test in Airplane Mode to confirm the
install worked end-to-end.
