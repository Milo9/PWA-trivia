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
   this README/schema for context if starting a fresh session.
2. Run the audit script — no API calls, so re-running it is free:
   ```
   npm run validate
   ```
   This checks schema correctness, flags exact duplicates as **errors**, and
   flags near-duplicate question text (fuzzy word-overlap match, within *and*
   across categories) as **warnings** for a human/AI judgment call.
3. Fix anything flagged. Warnings aren't automatically wrong — e.g. two
   genuinely different questions can share enough wording to get flagged;
   use judgment (or ask Claude to look at the specific pair) rather than
   re-running a full AI review over the whole set.
4. Before deploying, refresh the offline cache version so phones actually
   pick up the new content next time they're online:
   ```
   npm run stamp
   ```

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
