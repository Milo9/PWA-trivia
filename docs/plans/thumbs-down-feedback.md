# Implementation plan: thumbs-down question feedback (offline-first, Firebase upload)

**Audience:** the implementing agent (Sonnet 5.5). Follow it literally. When
something here conflicts with your instincts, follow the plan. When it
conflicts with what the code actually says, trust the code, note the
discrepancy in your final report, and pick the option that keeps the plan's
stated intent.

**Read these first:** `CLAUDE.md`, especially "App code: where the rules
live", "Verifying UI changes" and "Always ship after making changes". Also
read `README.md`'s project layout. Every rule there applies to this work:
no build step, no framework, render data with `textContent`, and ship once
with `--file`.

---

## 1. Goal

While playing, or while reviewing results, the player can tap 👎 on any
question and optionally type why it's bad. The report must:

1. **Persist locally right away**, surviving app kill, reload, an update,
   and days offline (the app is used on planes).
2. **Upload by itself later** to a Firebase Realtime Database whenever a
   network connection exists, with no user action and no duplicates.
3. **Never affect gameplay**: score, lives, streak, seen-ids, stats,
   auto-advance correctness and resume all behave exactly as before.

Out of scope for v1: undo or editing a sent report, reason-category chips,
Firebase Auth or App Check, an in-app admin view, and the Firebase JS SDK.

---

## 2. Architecture decisions (already made; don't revisit)

| Decision | Choice | Why |
|---|---|---|
| Backend | **Firebase Realtime Database (RTDB), REST API via plain `fetch`** | No SDK means no CDN script to precache, no bundler, and zero added weight. RTDB REST accepts CORS `PUT` with a JSON body. |
| Write method | **`PUT {DB_URL}/feedback/{reportId}.json`** with a **client-generated `reportId`** | `PUT` to a fixed key is idempotent. A retry after a lost response, or two tabs flushing at once, rewrites the same record instead of creating a duplicate. That's why there's no flush lock. |
| Outbox storage | **`localStorage`** (the existing app idiom), as a JSON array | The queue is tiny (≤200 items × ~1KB). Every other piece of app state already uses localStorage with try/catch. iOS home-screen PWAs are exempt from Safari's 7-day storage eviction. |
| Flush triggers | App launch, `online` event, `visibilitychange`→visible, right after enqueue, and a timer for the next due retry while the app is open | **iOS Safari has no Background Sync API.** The page has to drive delivery itself. |
| Connectivity detection | **Don't gate on `navigator.onLine`.** Attempt the request and classify the result. | `navigator.onLine` is unreliable (captive portals, airplane wifi). A failed fetch costs nothing. |
| Pure logic | New file **`feedback-queue.js`**, with the same UMD idiom as `game-logic.js`, unit-tested with `node:test` | Matches the repo's "rules in a pure module, IO in app.js" convention. |
| Security model | **Rules only.** Reads denied. Writes are create-or-same-device-overwrite under `/feedback/$id`, strictly schema-validated, size-capped, and extra keys rejected. | The repo is public and GitHub Pages serves it, so the DB URL is public no matter what. The rules are the only defense. Anonymous auth is noted as future hardening (§11). |
| Unconfigured state | `FEEDBACK_DB_URL = ""` means **enqueue normally, never flush** | The feature can ship and work before the Firebase project exists. Reports queue up and upload once the URL is filled in. |
| Duplicate reports | **One report per question id per device**, with no undo in v1 | Keeps the UI simple and the data clean. |

---

## 3. Files touched

| File | Change |
|---|---|
| `feedback-queue.js` (**new**) | Pure queue/report/backoff logic. |
| `test/feedback-queue.test.js` (**new**) | Unit tests. `npm test` picks it up automatically (`node --test`). |
| `index.html` | Add a `<script src="feedback-queue.js">` **before** `app.js` (after `game-logic.js`). Add the feedback sheet markup, the 👎 button in the quiz screen, and the pending-uploads footer line. |
| `app.js` | Config constant, storage IO, sync engine, sheet controller, button wiring, `id` on `state.answers` entries, global-keydown/popstate guards. |
| `styles.css` | Report button, reported state, feedback sheet (top-anchored), textarea, counter. |
| `sw.js` | Add `"feedback-queue.js"` to `APP_SHELL`. |
| `scripts/stamp-version.js` | Add `"feedback-queue.js"` to `HASHED_FILES`. |
| `firebase/database.rules.json` (**new**) | Security rules for the human to paste into the console (§9). |
| `scripts/feedback-check.js` (**new**) + `package.json` script `"feedback-check"` | Playwright verification (§10). |
| `scripts/feedback-report.js` (**new**) + `package.json` script `"feedback-report"` | Turns an RTDB JSON export into a triage report (§8, Phase 5). |
| `scripts/feedback-smoke.js` (**new**) + `package.json` script `"feedback-smoke"` | Live check of the published rules against a real DB URL. The human runs it once during setup (§9.1, §12). |
| `README.md`, `CLAUDE.md` | Short docs (Phase 6). |

**Registration checklist (offline breaks if you miss one):** `index.html`
`<script>` tag, `sw.js` `APP_SHELL`, and `stamp-version.js` `HASHED_FILES`.
Don't hand-edit `FILE_HASHES` or `CACHE_VERSION` in `sw.js`. `ship` stamps
those.

---

## 4. Data model

### 4.1 Report record (what's queued locally and PUT remotely)

```js
{
  v: 1,                         // schema version (number)
  id: "Xk3...",                 // reportId: 22 chars, base64url [A-Za-z0-9_-]; also the RTDB key
  questionId: "history-1234",   // q.id
  category: "history",          // q.category
  question: "…",                // snapshot of the stem the player saw (audits rewrite questions later)
  options: ["…","…","…","…"],   // snapshot, q.options order (canonical, not shuffled)
  answer: "…",                  // snapshot of q.answer
  selected: "…" | "",           // the player's pick; "" if reported before answering. NEVER null (RTDB drops nulls → schema fails)
  comment: "…" | "",            // trimmed, ≤ 500 chars; "" allowed (comment is optional)
  context: "quiz-before-answer" | "quiz-after-answer" | "results",
  deviceId: "…",                // random 22-char base64url, generated once, stored locally; no PII
  appBuild: 123,                // version.json build number; 0 if unknown
  clientCreatedAt: 1730000000000 // Date.now() at submit (number, ms)
}
```

On the wire only, the sender adds `receivedAt: {".sv": "timestamp"}` (an
RTDB server timestamp). It's **not** stored in the queue.

### 4.2 Queue item (local only)

```js
{ report: <Report>, attempts: 0, nextAttemptAt: 0, lastError: "" }
```

### 4.3 localStorage keys (follow the existing `offline-trivia:` prefix)

| Key | Value |
|---|---|
| `offline-trivia:feedback-queue` | JSON array of queue items |
| `offline-trivia:feedback-reported` | JSON array of question ids this device has reported (drives the "already reported" state). Cap at the most recent 5000 ids. |
| `offline-trivia:feedback-device` | deviceId string |
| `offline-trivia:feedback-failed` | JSON array (cap 20, newest last) of `{report, status, at}` for items dropped as `"invalid"` (400/413 only, see §5). Debug aid only, never shown in the UI. |

"Reset Stats" must **not** clear any of these keys.

---

## 5. `feedback-queue.js`: exact API

Use the exact wrapper from the top of `game-logic.js`, exposing the global
`FeedbackQueue`:

```js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FeedbackQueue = api;
})(typeof self !== "undefined" ? self : this, function () {
  // ...
  return { /* exports below */ };
});
```

No DOM, no `localStorage`, no `fetch`, no `Date.now()`, and no
`Math.random`/`crypto` inside the module. Time and randomness are passed in.

Constants (exported):
- `SCHEMA_VERSION = 1`
- `MAX_COMMENT_LENGTH = 500`
- `MAX_QUEUE = 200`
- `MAX_INVALID_ATTEMPTS = 3`
- `BACKOFF_BASE_MS = 30_000`, `BACKOFF_MAX_MS = 6 * 60 * 60 * 1000`
- `CONTEXTS = ["quiz-before-answer", "quiz-after-answer", "results"]`

Functions (exported):

1. **`makeId(bytes)`**: `bytes` is a `Uint8Array(16)`. Returns a base64url
   string with no padding, exactly 22 chars, using only `[A-Za-z0-9_-]`.
   (RTDB keys can't contain `. # $ [ ] /`.) Implement base64url by hand. Don't
   use `btoa` or `Buffer`, so it works the same in browser and Node.
2. **`normalizeComment(text)`**: coerces to a string, trims, collapses runs
   of 3+ newlines to 2, and truncates to `MAX_COMMENT_LENGTH` code units.
   Returns a string.
3. **`createReport({ id, question, selected, comment, context, deviceId, appBuild, now })`**:
   `question` is a question object (`{id, category, question, options, answer}`).
   Returns a Report per §4.1. Applies `normalizeComment`, maps
   `selected == null` to `""`, and copies `options` into a fresh array.
   Throws `Error` if `context` isn't in `CONTEXTS` or if the question lacks
   an id or exactly 4 options.
4. **`enqueue(queue, report)`**: returns a **new** array with
   `{report, attempts: 0, nextAttemptAt: 0, lastError: ""}` appended. If an
   item with the same `report.questionId` is already queued, replace it in
   place (latest comment wins) instead of appending. If the length exceeds
   `MAX_QUEUE`, drop the oldest items from the front. Never mutates its input.
5. **`dueItems(queue, now)`**: items with `nextAttemptAt <= now`, in queue order.
6. **`nextDueAt(queue)`**: the smallest `nextAttemptAt` among items, or
   `null` if the queue is empty.
7. **`classify(result)`**: `result` is `{ networkError: true }` or `{ status: number }`.
   Returns:
   - `"sent"` for 200–299
   - `"offline"` for `networkError` (fetch threw, or a timeout abort)
   - `"invalid"` for 400 and 413 only (malformed JSON, or a body too large)
   - `"retry"` for everything else, **explicitly including 401, 403 and 404**,
     plus 408, 429, 500–599 and any unexpected status.

   Why 401/403/404 must retry and never drop: RTDB answers **401 for any
   rule rejection**, so a broken rules file can't be told apart from a bad
   payload. The rules also can't be tested until the human publishes them,
   and 401/404 are what you get before setup is finished (locked default
   rules, a DB that doesn't exist yet). Auto-dropping on those codes could
   silently delete every queued report on every phone. A stuck item costs
   about 4 requests a day at the 6h cap, which is harmless, and
   `MAX_QUEUE` eviction bounds the total.
8. **`backoffMs(attempts)`**: `min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (attempts - 1))` for `attempts >= 1`, else 0.
9. **`applyOutcome(queue, reportId, outcome, now, status)`**: returns
   `{ queue: newQueue, dropped: item | null }`:
   - `"sent"`: remove the item.
   - `"offline"`: no change. Offline is the normal state, so it costs no attempt.
   - `"retry"`: `attempts += 1`, `nextAttemptAt = now + backoffMs(attempts)`, `lastError = String(status)`.
   - `"invalid"`: the same as retry, **except** that once `attempts >= MAX_INVALID_ATTEMPTS`, remove it and return it as `dropped`.
     That's the only drop path besides `MAX_QUEUE` eviction.
   - An unknown `reportId` returns the queue unchanged.
10. **`toWireBody(report)`**: returns `{ ...report, receivedAt: { ".sv": "timestamp" } }`.

---

## 6. `app.js` changes

Keep the existing style: section comments explain *why*, every
`localStorage` access is wrapped in try/catch, and data is rendered with
`textContent` only.

### 6.1 Config and imports

- Near the top, after the `GameLogic` destructure, destructure the needed
  `FeedbackQueue` exports.
- Add a config constant with a comment telling the human where to put the URL:
  ```js
  // Firebase Realtime Database root URL, e.g.
  // "https://my-trivia-default-rtdb.firebaseio.com" (no trailing slash).
  // Empty = reports queue locally but never upload. See README "Question feedback".
  const FEEDBACK_DB_URL = "";
  ```
  When using it, strip any trailing `/`. Treat anything not starting with
  `https://` as unconfigured.

### 6.2 Question id plumbing

- In `selectAnswer`, add `id: q.id` to the object pushed onto `state.answers`.
- Resumed rounds saved before this change have answers without `id`. The
  results review must **hide** the report button for those entries rather
  than throw or guess.

### 6.3 App build number

`loadVersion()` already fetches `version.json`. Also store
`state.appBuild = data.build` (default `0`).

### 6.4 Storage helpers

Add a `// --- Question feedback ---` section near the other storage helpers:

- `loadFeedbackQueue()`, `saveFeedbackQueue(queue)`. Save returns
  `true`/`false`, and returns false on a thrown error.
- `loadReportedIds()` returns a `Set`. `addReportedId(id)` persists it,
  capped at 5000, keeping the most recent.
- `getDeviceId()` lazily creates the id with
  `makeId(crypto.getRandomValues(new Uint8Array(16)))` and persists it. If
  storage fails, return an in-memory id for the session.
- `newReportId()` uses the same `makeId(crypto.getRandomValues(...))`.
- `recordFailedReport(item, status)` appends to the capped failed log.

**Mutation rule:** every queue mutation follows **re-read from storage,
apply the pure function, write back**. Never write a copy you read earlier
in an `await`-spanning flow. Remove sent items by id from a fresh read, so
an item enqueued during a flush is never lost.

### 6.5 Submitting a report

`submitFeedback({ question, selected, comment, context })`:
1. Build the report with `createReport`, using `getDeviceId()`,
   `state.appBuild`, `Date.now()` and `newReportId()`.
2. Do a fresh `loadFeedbackQueue()`, then `enqueue`, then
   `saveFeedbackQueue`. **If the save returns false**, return
   `{ ok: false }`. The UI then shows "Couldn't save your report on this
   device." and doesn't mark the question reported. Never claim success
   when nothing persisted.
3. On success, call `addReportedId(question.id)` and `renderFeedbackPending()`,
   then call `flushFeedback()` without awaiting it. Return `{ ok: true }`.

### 6.6 Sync engine

`flushFeedback()`:
- Return early if `FEEDBACK_DB_URL` is unconfigured, or if a module-level
  `feedbackFlushInFlight` flag is set. Set the flag and clear it in `finally`.
  (Cross-tab double-sends are harmless because PUT is idempotent, so there's
  no Web Locks.)
- Read the queue fresh and take `dueItems(queue, Date.now())`. For each item,
  **sequentially**:
  - `fetch(\`${url}/feedback/${encodeURIComponent(item.report.id)}.json\`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toWireBody(item.report)), signal })`,
    using an `AbortController` with a 15s timeout. Use `cache: "no-store"`.
  - Classify it: a thrown error or abort is `{networkError: true}`, otherwise `{status: res.status}`.
  - **On `"offline"`, stop the whole pass right away.** Leave remaining
    items untouched and let the `online`/visibility/timer triggers retry.
  - Otherwise do a fresh read, `applyOutcome`, and save. If `dropped`,
    call `recordFailedReport` and `console.warn` once.
  - **Never stop the pass on `"retry"` or `"invalid"`.** Continue to the
    next item, so one bad payload can't block the queue (head-of-line blocking).
- After the pass, call `renderFeedbackPending()` and
  `scheduleFeedbackRetry({ wasOffline })`, where `wasOffline` is true if the
  pass stopped on `"offline"`.

`scheduleFeedbackRetry({ wasOffline = false } = {})` clears any existing
timer. If the queue is empty or the URL isn't configured, it stops there.
Otherwise it calls
`setTimeout(flushFeedback, clamp(nextDueAt(queue) - Date.now(), floor, BACKOFF_MAX_MS))`,
with `floor = wasOffline ? 60_000 : 5_000`. The 60s offline floor matters:
after an offline stop, the items are still due right away, so a 5s floor
would fire a fetch every 5s for an entire flight. On captive-portal wifi,
each of those can hang for the full 15s timeout. The timer exists because
the `online` event isn't reliable on iOS either.

Triggers. Register these once, at the bottom of `app.js` near the
service-worker registration:
- Call `flushFeedback()` once on startup.
- `window.addEventListener("online", flushFeedback)`.
- `document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") flushFeedback(); })`.
- After a successful enqueue (6.5).

The service worker doesn't need changes for networking. Its fetch handler
already returns early for non-GET requests, so PUTs go straight to the
network. **Don't** add Firebase URLs to the SW, and don't cache them.

### 6.7 Pending indicator

`renderFeedbackPending()`: if the queue length is N > 0, show
`#feedback-pending` with "N report(s) waiting to upload". Otherwise hide it.
If the URL is unconfigured, the text stays the same; don't expose config
details to the player. Call it from `showScreen("categories")`'s render
block, after enqueue, and after each flush.

### 6.8 Report buttons

**Quiz screen:** `#report-btn` sits in the quiz body next to the category
label (see 7.1). It's visible **both before and after answering**, because a
broken question is often obvious before you pick.
- In `renderQuestion()`, set its state from `loadReportedIds().has(q.id)`.
  If reported, add the `reported` class, `aria-pressed="true"`, `disabled`
  and the label "Reported". Otherwise it's the normal state.
- On click, `clearAutoAdvanceTimer()` first (otherwise a correct answer's
  1200ms auto-advance fires behind the open sheet). Then call
  `openFeedbackSheet({ question: q, selected, context })`, where `selected`
  is `state.answers[state.currentIndex]?.selected` if this question has
  been answered (`state.answers.length > state.currentIndex`), else `null`.
  `context` is `"quiz-after-answer"` or `"quiz-before-answer"` to match.
- When the sheet closes after a successful submit, put the button in the
  reported state. **Don't** restart auto-advance after the sheet closes.
  The player taps Next.
- Reporting must not touch `state.score`, `streak`, `lives`, `answers`,
  `seenByCat`, `lifelineUsed`, or call `saveActiveRound()`.

**Results review:** in `showResults()`'s review loop, for each `a` with an
`a.id`, append a small 👎 button to the `review-item` (e.g. right-aligned in
the question row). Use the same reported-state logic. On click, call
`openFeedbackSheet` with `question` rebuilt as
`{ id: a.id, category: a.category, question: a.question, options: a.options, answer: a.correctAnswer }`.
`a.options` holds the shuffled display order. That's acceptable for the
snapshot, since canonical order isn't stored in `state.answers`. Pass
`selected: a.selected` and `context: "results"`. Build it with
`createElement`/`textContent`, consistent with the existing loop.

### 6.9 Feedback sheet controller

`openFeedbackSheet({ question, selected, context })` returns
`Promise<boolean>` (true if a report was saved). Model it on
`showConfirmSheet`, but **don't reuse its keydown handler**, because that
handler traps Tab between exactly two buttons.

- Use a module-level `feedbackSheetOpen` flag. Return `false` immediately
  if `feedbackSheetOpen || confirmSheetOpen`. Also add
  `if (feedbackSheetOpen) return Promise.resolve(false);` at the top of
  `showConfirmSheet`.
- On open:
  - Fill in the question preview with `textContent`.
  - Clear the textarea and reset the counter to `0/500`.
  - Hide the error line.
  - Show the overlay and set `document.getElementById("app").inert = true`.
  - Focus the textarea.
  - Remember `previouslyFocused` so focus can return there on close.
    A successful submit disables the report button, and focusing a
    disabled button silently fails. So after a submit, focus `#next-btn` if
    it's visible, else `#question-text` (give it `tabindex="-1"`). On the
    results screen, focus the review item's question text instead.
- Keydown is captured on `document`:
  - **Escape** cancels.
  - **Tab** and **Shift+Tab** cycle through `[textarea, cancel, submit]`.
  - **Cmd/Ctrl+Enter** submits.
  - Plain Enter in the textarea inserts a newline, which is the default.
- The counter updates on `input`. The textarea has `maxlength="500"`.
- Clicking the overlay backdrop cancels. **Submit** calls `submitFeedback`:
  - If it returns `ok: false`, show the error text, keep the sheet open and
    don't resolve the promise.
  - If it returns `ok: true`, close the sheet and
    `announce("Thanks — report saved. It'll upload next time you're online.")`.
- **Guard the global quiz keydown handler.** Change its first line to
  `if (currentScreen !== "quiz" || confirmSheetOpen || feedbackSheetOpen) return;`.
  It already skips TEXTAREA focus. Keep that check too.
- **Back button (popstate).** At the very top of the popstate handler,
  right after the `ignoreNextPop` check, add a branch for when
  `feedbackSheetOpen` is true:
  1. Re-push `{ depth: 1, screen: currentScreen }` via `history.pushState`.
  2. Cancel the sheet.
  3. Return.

  Don't push any history entry when opening the sheet. The two-entry
  history model stays intact.

---

## 7. Markup and CSS

### 7.1 `index.html`

- Quiz screen: wrap `#question-category` in a flex row with a new button:
  ```html
  <div class="question-meta-row">
    <p id="question-category" class="question-category"></p>
    <button id="report-btn" class="report-btn" type="button" aria-label="Report a problem with this question">👎</button>
  </div>
  ```
  Check that `renderQuestion`'s entrance animation on `#question-category`
  still works.
- Categories footer: add `<p id="feedback-pending" class="app-version hidden"></p>`
  just above `#app-version`.
- After the confirm sheet, add a sibling overlay:
  ```html
  <div id="feedback-sheet-overlay" class="feedback-sheet-overlay hidden">
    <div id="feedback-sheet" class="confirm-sheet feedback-sheet" role="dialog" aria-modal="true" aria-labelledby="feedback-sheet-title">
      <p id="feedback-sheet-title" class="confirm-sheet-title">Report this question</p>
      <p id="feedback-sheet-question" class="feedback-sheet-question"></p>
      <label for="feedback-comment" class="settings-label">What's wrong? (optional)</label>
      <textarea id="feedback-comment" class="feedback-comment" rows="4" maxlength="500"
        placeholder="e.g. wrong answer, two options are correct, typo, too obscure"></textarea>
      <p class="feedback-meta"><span id="feedback-error" class="feedback-error hidden">Couldn't save your report on this device.</span><span id="feedback-counter" class="feedback-counter">0/500</span></p>
      <div class="confirm-sheet-actions">
        <button id="feedback-cancel" class="secondary-btn" type="button">Cancel</button>
        <button id="feedback-submit" class="primary-btn" type="button">Send report</button>
      </div>
    </div>
  </div>
  ```
- Register every new element in the `el` object.

### 7.2 `styles.css`

- `.question-meta-row` is a flex row with `justify-content: space-between`
  and `align-items: center`.
- `.report-btn` is a small icon button with a **44×44px tap target**. Use
  existing color tokens and low emphasis (reduced opacity) until hover or
  focus. `.report-btn.reported` gets a muted, filled look, no pointer, and
  stays visible.
- **`.feedback-sheet-overlay` is anchored at the TOP, not the bottom.**
  Copy `.confirm-sheet-overlay`'s rules (including `.hidden { display: none }`
  and the fade-in), but use `align-items: flex-start` and
  `padding-top: calc(env(safe-area-inset-top) + 12px)`. A bottom sheet gets
  covered by the iOS keyboard as soon as the textarea is focused. Round the
  sheet's corners to match.
- **`.feedback-comment` needs `font-size: 16px` minimum**, or iOS Safari
  zooms the page on focus. It also gets `width: 100%`, `resize: vertical`,
  theme tokens for background, border and text, and a visible focus ring.
  It must look right in both light and dark (`data-theme`) themes.
- `.feedback-sheet-question` is clamped to 3 lines
  (`-webkit-line-clamp`) and muted.
- Add the new overlay and sheet to the existing `prefers-reduced-motion`
  animation-off list.

---

## 8. Triage tooling: `scripts/feedback-report.js`

Usage: `npm run feedback-report -- <path-to-rtdb-export.json>`. The export
comes from Firebase console → Realtime Database → Data → ⋮ → Export JSON.

- Accept either the whole-DB export (`{ feedback: {...} }`) or just the
  `feedback` node.
- Load the current corpus the same way other scripts do, and re-attach
  `category` from the containing file (see `grep -n "category" scripts/*.js`).
- Group by `questionId` and sort by report count, descending. For each,
  print the id, category, count, and the current question/answer. Then print
  each report's comment (or "(no comment)"), `selected`, `context`, the
  ISO date from `receivedAt` (fallback `clientCreatedAt`), and `appBuild`.
- Flag **"(question edited since report)"** when the snapshot `question` or
  `answer` differs from the current corpus. Flag **"(question no longer
  exists)"** when the id is gone.
- `--json` emits the grouped structure as JSON instead.
- The script is read-only. It never edits data files.

---

## 9. Firebase security rules: `firebase/database.rules.json`

Write exactly this file. It's the only server-side protection, so don't
loosen it.

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "feedback": {
      "$reportId": {
        ".write": "newData.exists() && (!data.exists() || data.child('deviceId').val() === newData.child('deviceId').val())",
        ".validate": "$reportId.matches(/^[A-Za-z0-9_-]{22}$/) && newData.hasChildren(['v','id','questionId','category','question','options','answer','selected','comment','context','deviceId','appBuild','clientCreatedAt','receivedAt']) && newData.child('id').val() === $reportId",
        "v": { ".validate": "newData.val() === 1" },
        "id": { ".validate": "newData.isString()" },
        "questionId": { ".validate": "newData.isString() && newData.val().matches(/^[a-z0-9-]+-[0-9]{3,}$/) && newData.val().length <= 64" },
        "category": { ".validate": "newData.isString() && newData.val().matches(/^[a-z0-9-]{1,40}$/)" },
        "question": { ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 600" },
        "options": {
          ".validate": "newData.hasChildren(['0','1','2','3'])",
          "$i": { ".validate": "$i.matches(/^[0-3]$/) && newData.isString() && newData.val().length <= 300" }
        },
        "answer": { ".validate": "newData.isString() && newData.val().length <= 300" },
        "selected": { ".validate": "newData.isString() && newData.val().length <= 300" },
        "comment": { ".validate": "newData.isString() && newData.val().length <= 500" },
        "context": { ".validate": "newData.val() === 'quiz-before-answer' || newData.val() === 'quiz-after-answer' || newData.val() === 'results'" },
        "deviceId": { ".validate": "newData.isString() && newData.val().matches(/^[A-Za-z0-9_-]{22}$/)" },
        "appBuild": { ".validate": "newData.isNumber() && newData.val() >= 0" },
        "clientCreatedAt": { ".validate": "newData.isNumber()" },
        "receivedAt": { ".validate": "newData.val() === now" },
        "$other": { ".validate": false }
      }
    }
  }
}
```

Notes for the implementer:
- **Same-device overwrite** is what makes retries idempotent. A retry
  after a lost 200 response succeeds instead of failing with 401. Nobody
  else can overwrite a record, because reads are denied, so `reportId` and
  `deviceId` can't be discovered.
- **Re-check the real question corpus against these caps before
  finalizing.** As of 2026-10-04 the longest stem was 278 chars and the
  longest option 103, and every id matched the regex.
  Run a one-off `node -e` over `data/questions/*.json` for the max
  `question` length and max option length. If any real question exceeds 600
  or any option exceeds 300, raise the cap to a round number above the
  corpus max, and say so in your report. Do the same check for ids against
  the `questionId` regex: `general`-derived files contain `general-NNNN` ids,
  which match.
- You can't test these rules against a live DB, because no project exists
  yet. Make sure the client payload satisfies them **by construction**:
  have a unit test (§10.1) assert that `toWireBody(createReport(...))` has
  exactly the key set the rules require, with the right types.

### 9.1 `scripts/feedback-smoke.js`: live rules check

Usage: `npm run feedback-smoke -- <dbUrl>`. This is the **only real test**
of the rules, and of the same-device-overwrite idempotency the design
depends on. The human runs it after publishing the rules and **before**
putting the URL into `app.js`.

- Use Node's built-in `fetch` (Node 18+), with no dependencies. `require("../feedback-queue.js")` and build
  every body with `createReport` + `toWireBody`, so the test exercises the
  exact client payload. Use `crypto.randomBytes(16)` for the ids.
- The test report uses `questionId: "smoke-000"`, `category: "smoke"`,
  and question text `"Smoke test — safe to delete"`, so it stands out in
  `feedback-report` output.
- Run four checks in order. Print PASS or FAIL for each, and exit non-zero
  on any FAIL:
  1. PUT a valid report and expect **200**.
  2. PUT the identical body to the same id and expect **200**. This proves
     retries are idempotent.
  3. PUT to a fresh id with an extra key (`hacked: true`) and expect **401**.
  4. PUT to check 1's id with a different `deviceId` and expect **401**.
- On a FAIL, print the response body (RTDB includes a reason), plus a hint:
  "Did you publish firebase/database.rules.json?"
- Agent-side testing: you have no live DB. Verify the script's logic by
  pointing it at a tiny local `http` stub you start in the scratchpad.
  The stub returns 200/200/401/401 in that order. Do **not** commit the stub.

---

## 10. Verification (required; don't skip, don't claim it can't be done)

Playwright and Chromium are already installed (see CLAUDE.md). Look at the
screenshots with `Read`. A zero-exit run can still render wrong, so add a
`waitForTimeout(400)` after screen or sheet transitions before capturing.

### 10.1 Unit tests: `test/feedback-queue.test.js`

Cover at least:
- `makeId`: 22 chars, base64url alphabet only, and deterministic for the same bytes.
- `normalizeComment`: trims, collapses newline runs, truncates at 500, and coerces non-strings.
- `createReport`: `selected` null becomes `""`, `options` is copied (mutating the source doesn't affect the report), and it throws on a bad context or a malformed question.
- `enqueue`: appends, replaces the same-`questionId` item in place, caps at `MAX_QUEUE` by dropping the oldest, and doesn't mutate its input.
- `dueItems`/`nextDueAt` respect `nextAttemptAt`.
- `classify`: a table test over 200, 204, networkError, 408, 429, 500, 503, 401, 403, 404 and 418 (all → retry except the obvious ones), plus 400 and 413 (→ invalid).
- `backoffMs`: 0, 1, 2, … and the cap.
- `applyOutcome`: sent removes the item, offline is unchanged, retry increments and backs off but **never drops**, even after 50 retries, invalid drops only at `MAX_INVALID_ATTEMPTS` and returns `dropped`, and an unknown id is a no-op.
- `toWireBody`: the key set equals the rules' required set exactly (keep a hard-coded copy of the list in the test), types match, and `receivedAt` is `{".sv":"timestamp"}`.

### 10.2 Browser check: `scripts/feedback-check.js` (`npm run feedback-check`)

Follow `scripts/visual-check.js`'s structure: spawn `scripts/serve.js` on
its own port (not 8080 or 8099; use **8098**), print console errors and
exit non-zero on failure, and save screenshots to `dev-screenshots/feedback/`.

**Context A: stubbed backend, service workers blocked.** Create it with
`browser.newContext({ serviceWorkers: "block", viewport: { width: 375, height: 667 } })`.
`page.route()` doesn't reliably see requests from a page controlled by a
service worker. If interception misses requests even with this set,
investigate before moving on.
- Route `**/app.js` to serve the real file with `const FEEDBACK_DB_URL = "";`
  replaced by `const FEEDBACK_DB_URL = "https://stub-db.example";`. There's
  no test hook in the production code.
- Route `https://stub-db.example/**` to a handler that records method, URL
  and parsed body, and responds according to a mutable `mode` variable
  (`"ok"` → 200 `{}` JSON with `Access-Control-Allow-Origin: *`,
  `"fail"` → `route.abort()`, `"reject"` → 401 with the same CORS header).
  **Handle the CORS preflight.** A cross-origin `PUT` with
  `Content-Type: application/json` always sends an `OPTIONS` first. Answer
  any `OPTIONS` with 204 and these headers:
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Methods: PUT`
  - `Access-Control-Allow-Headers: Content-Type`

  Otherwise the PUT never fires, and the failure looks like an app bug.
  Don't count `OPTIONS` in the request assertions.
- Scenarios:
  1. **Offline enqueue → flush on reconnect.** Start a round **while
     online**. Service workers are blocked in this context, so nothing is
     cached, and `ensureLoaded` can't fetch question files offline. Once Q1
     is showing, call `context.setOffline(true)`. Then report Q1 **before**
     answering, with a comment. Assert the queue in localStorage has 1 item,
     there were 0 stub requests, the button shows the reported state, and
     the footer later shows "1 report waiting to upload". Then
     `setOffline(false)`. If Chromium doesn't fire `online` here, dispatch
     `window.dispatchEvent(new Event("online"))` and note it. Assert exactly
     one `PUT` to `/feedback/<id>.json` whose body has
     `context: "quiz-before-answer"`, `selected: ""`, the comment, the exact
     key set, and `receivedAt: {".sv":"timestamp"}`. Then assert the queue is empty.
  2. **Survives reload.** With `mode="fail"`, answer Q2 and report it
     (after answering, no comment). Reload the page. Assert the queue still
     has the item. Set `mode="ok"` and trigger `visibilitychange` (or
     `online`). Assert the PUT arrives with `selected` equal to the chosen
     option and `context: "quiz-after-answer"`.
  3. **Gameplay untouched.** Turn auto-advance on and answer a question
     correctly. Open the report sheet within 1200ms, wait 2000ms, and
     assert the question index hasn't advanced. Cancel. Assert score and
     streak match a no-report baseline.
  4. **Keyboard isolation.** With the sheet open, type `"abcd 1234"` plus
     Enter into the textarea. Assert no option got selected, Next didn't
     fire, and the textarea contains the text. Press Escape and assert the
     sheet closed and focus returned to the report button (cancel case,
     where the button is still enabled).
  5. **Back button.** Open the sheet and run `page.goBack()`. Assert the
     sheet closed, the quiz screen is still visible, **and** the quit
     confirm did **not** open.
  6. **Results review.** Finish a 10-question round. Assert every review
     item has a 👎, except Q1 and Q2, which show the reported state. Report
     one from results, and assert the PUT has `context: "results"`.
  7. **A rejected item doesn't block the queue, and isn't dropped.**
     Enqueue two reports. Set `mode="reject"` (401) for the first id's URL
     only and `"ok"` for the second, then trigger a flush. Assert:
     - the second is sent;
     - the first remains queued with `attempts: 1` and a future
       `nextAttemptAt`;
     - `offline-trivia:feedback-failed` is empty.
  8. **Dedup.** The report button for an already-reported question is
     disabled, and a fresh round containing that id shows it as reported.
- Screenshots: the sheet open (dark theme), the sheet open (light theme),
  the reported state on the quiz screen, the results review with buttons,
  and the footer pending line.

**Context B: real service worker, offline launch.** This is a default
context with service workers allowed.
- Load the app, wait for `navigator.serviceWorker.ready`, and reload once so
  the page is controlled. Then call `context.setOffline(true)` and reload.
  Assert the app renders, `typeof window.FeedbackQueue === "object"` (so
  `feedback-queue.js` was precached), you can report a question, and the
  item is queued.

Also run `npm run visual-check` and confirm the existing happy path still
passes and its screenshots look unchanged apart from the new 👎.

### 10.3 Gates before shipping

- `npm test` passes, including the new tests.
- `npm run validate` reports 0 errors, and the warning count is unchanged
  from before your change (you didn't touch data).
- `npm run feedback-check` and `npm run visual-check` both exit 0, and you
  have **looked at** the screenshots.
- `node --check` passes on every new or edited `.js` file.

---

## 11. Phases (do them in order; each ends in a checkable state)

**Phase 0: Orient.** Read the CLAUDE.md sections named at the top,
`game-logic.js` (the wrapper idiom), and these parts of `app.js`:
`showConfirmSheet`, `renderQuestion`, `selectAnswer`, `advanceToNext`, the
global `keydown` handler, the `popstate` handler, `showResults`,
`loadVersion`, and service-worker registration. Then read `sw.js` and
`scripts/stamp-version.js`. Run `git status` and confirm the tree is clean.
If it isn't, stop and report. Don't sweep unrelated changes into your work.
Record the current `npm run validate` warning count.

**Phase 1: Pure module.** Write `feedback-queue.js` and
`test/feedback-queue.test.js`. Done when `npm test` passes.

**Phase 2: Wiring without UI.** Do the registration checklist (§3), the
config constant, id plumbing, appBuild, storage helpers, `submitFeedback`,
the sync engine and its triggers. Done when `node --check app.js` passes
and calling `submitFeedback(...)` by hand from a Playwright `page.evaluate`
queues an item.

**Phase 3: UI.** Add the markup, CSS, sheet controller, both report
buttons, the pending line, and the keydown and popstate guards. Done when
manual Playwright screenshots look right at 375×667 in both themes.

**Phase 4: Rules.** Write `firebase/database.rules.json` and run the
corpus-length check from §9. Add the key-set unit test. Write
`scripts/feedback-smoke.js` (§9.1) and check it against a local stub.

**Phase 5: Triage script.** Write `scripts/feedback-report.js` plus its
npm script. Test it against a hand-written 3-report fake export in the
scratchpad. Include one report for an id that doesn't exist, and one whose
snapshot text differs from the corpus.

**Phase 6: Docs.**
- **README.md:** add a "Question feedback" section with the user-facing
  behavior, the human setup steps from §12 (verbatim is fine), how to set
  `FEEDBACK_DB_URL`, how to export and run `feedback-report`, and the new
  files in "Project layout".
- **CLAUDE.md:** under "App code: where the rules live", add one concise
  bullet. It should say:
  - Feedback queue rules live in `feedback-queue.js` (pure, tested).
  - Delivery is idempotent PUTs keyed by client id, so never switch to
    POST/push ids.
  - The rules file is the only server-side defense and must stay in sync
    with the payload key set via the unit test.
  - Feedback localStorage keys must survive Reset Stats.

  Don't add a session changelog.

**Phase 7: Verify.** Write and run `scripts/feedback-check.js` (§10.2) and
`visual-check`, then fix whatever they find. Re-run every gate in §10.3.

**Phase 8: Ship once.**
1. Run `git status` and confirm only the files in §3 changed or were added,
   plus this plan file if it's untracked.
2. Write a multi-line commit message to a file **in the scratchpad, outside
   the repo**, ending with the repo's required `Co-Authored-By` trailer.
3. Run `npm run ship -- --file <that path>`.

Don't run `git add`, `git commit` or `git push` yourself.

---

## 12. Human prerequisites (for the user; the agent can't do these)

The feature ships and works without these. Reports just queue on the device
until they're done.

1. Go to https://console.firebase.google.com → **Add project**. You can
   leave Google Analytics off. The free Spark plan is plenty.
2. **Build → Realtime Database → Create Database.** Pick a location and
   choose **Start in locked mode**.
3. **Rules** tab: replace the contents with `firebase/database.rules.json`
   from the repo, then click **Publish**.
4. Copy the database URL from the **Data** tab and run
   `npm run feedback-smoke -- <url>`. All four checks must print PASS.
   If any fail, fix the published rules **before** continuing. Phones
   never drop reports on a 401, so nothing is lost, but nothing uploads
   until the rules accept writes. Afterwards, delete the `smoke-000`
   records from the Data tab.
5. Once the smoke test passes, use the same URL. It looks like
   `https://<project>-default-rtdb.firebaseio.com`, or
   `https://<project>-default-rtdb.<region>.firebasedatabase.app` outside
   us-central1. Set `FEEDBACK_DB_URL` in `app.js` to it (no trailing slash),
   then `npm run ship -- "Configure feedback upload URL"`. Phones pick it up
   on their next update and flush any queued reports.
6. To review reports, go to **Data → ⋮ → Export JSON**, then run
   `npm run feedback-report -- <export.json>`.

---

## 13. Don't

- Don't add the Firebase JS SDK, any CDN script, a bundler or a build step.
- Don't use `POST` or RTDB push ids. Idempotency depends on PUT with the client id.
- Don't gate sending on `navigator.onLine`.
- Don't use `innerHTML` with any data-derived string. That includes comments
  and question text in the sheet preview.
- Don't let reporting change score, streak, lives, seen-ids, stats, or the
  saved active round.
- Don't push a history entry when the sheet opens.
- Don't clear feedback keys in Reset Stats.
- Don't cache or intercept Firebase requests in `sw.js`.
- Don't hand-edit `sw.js`'s `CACHE_VERSION`/`FILE_HASHES`, `version.json`, or
  `categories.json` counts.
- Don't touch `data/questions/*.json`.
- Don't ship more than once, and don't commit by hand.

## 14. Future hardening (not v1; mention in the final report only if relevant)

- Firebase Anonymous Auth through the Identity Toolkit REST API (`signUp`
  plus token refresh), so rules can require `auth != null` and key rate
  limits on `auth.uid`.
- A per-device daily write cap enforced in the rules, using a
  `/limits/$deviceId` counter.
- An "undo" option for reports still queued.
