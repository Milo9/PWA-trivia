# CLAUDE.md

Behavioral rules for Claude in this repo. **Read README.md first** for the
schema, layout, commands and the add-a-batch workflow; this file covers what
the README doesn't.

**Keep this file short (budget: ~25KB).** Each rule is a line or two: what to
do and, briefly, why. The incidents behind the rules (dates, counts, examples)
live in `docs/lessons-learned.md`, which is not auto-loaded. Read the matching
section there when a rule's reasoning matters, and append a dated write-up
there when a new incident is worth recording. Add the rule here, never the
story. Don't turn this file into a batch changelog; that's `git log`.

## Working style

- **Token efficiency over wall-clock speed.** Work sequentially and inline. Don't
  fan out parallel agents or forks unless something other than speed requires
  it, e.g. independent classifiers that mustn't bias each other before a rule set
  exists. If you do parallelize drafting, see "One merge gate" below.
- **Bake durable lessons in as you go** (into this file, a template's AVOID list,
  or tooling), concisely and without being asked. Skip it when the session
  found nothing new.
- **Check for tooling before saying something can't be tested.** `playwright`
  and a cached Chromium are installed (see "Verifying app changes").

## Always ship after making changes — once per unit of work

- Run `npm run ship -- "message"` once at the end of a logical unit (a batch
  merge, an audit session), not after each edit or chunk. Never run
  `git add`/`commit`/`push` yourself, and don't leave changes uncommitted at the
  end of a session. Write the message yourself from the actual diff.
- **Multi-line messages:** write the message to a file *outside the repo*
  (e.g. the scratchpad) and run `npm run ship -- --file <path>`. On Windows,
  `npm run` passes arguments through cmd.exe, which truncates them at the first
  newline. A message file inside the repo would be swept into the commit.
- **What ship does:** unit tests → `validate` → bump the build *only if a served
  file changed* (app shell, `sw.js`, `icons/`, `data/categories.json`,
  `data/questions/`) → stamp → `git add -A` → commit → push. A docs-, template-,
  tooling- or audit-only ship keeps the build number, so phones see no update.
  If a push failed, rerunning ship pushes the unpushed commit.
- **Run `git status` before shipping.** `git add -A` sweeps every stray file into
  the commit, so move or delete strays first.
- If `validate` fails, fix the errors; never bypass it.

## Verifying app changes

- `npm run visual-check` is the happy-path walkthrough with screenshots.
  `npm run reliability-check` covers storage, multi-tab, quit/back, legacy
  migration, the no-IndexedDB fallback, and offline install/stall/repair/update.
  `npm run feedback-check` covers the report outbox. For anything narrower, write
  a one-off Playwright script in the scratchpad against `createServer()` from
  `scripts/serve.js`, and assert the specific behavior.
- **Read the screenshots**; don't just trust exit 0. Wait briefly after a screen
  transition, or the CSS fade-in captures a blank page.
- **Run `npm run stamp` after editing any app file.** The service worker rejects
  files whose hash doesn't match `sw.js`'s `FILE_HASHES`, and the browser suites
  refuse to start when the stamp is stale.
- When a check unexpectedly passes or fails, prove the test can fail: a
  string-patch that silently didn't apply once made a scenario test nothing.

## App code: where the rules live

- **No build step, framework or bundler.** Plain HTML/CSS/JS. Don't hand-edit
  `version.json` or the counts in `data/categories.json`; `ship`/`stamp` own them.
- **Game rules live in `game-logic.js`** (pure, with an `rng` argument for
  anything random, tested by `test/game-logic.test.js`). Change a rule there,
  with a test, not inline in `app.js`.
- **Persisted data is validated by `storage-logic.js`.** Its limits (question
  ≤600 characters, option ≤300, id `^[a-z0-9-]+-\d{3,}$` and ≤64 characters) are
  mirrored as errors in `validate.js` and in `firebase/database.rules.json`;
  keep all three in sync. Prefs/stats saved without `v` must stay readable,
  because they're only rewritten on a toggle or a game.
  `migrateLegacyStorage()` in `app.js` can be deleted once no device can hold
  pre-2026-11 keys.
- **Every shared localStorage write goes through `withStorageLock`.** IndexedDB
  is authoritative, and `restoreStorageMirrors()` rewrites localStorage from it
  at launch, so a direct write or delete is undone on the next launch. If
  IndexedDB can't open, the session runs on localStorage alone and flags itself,
  so the next launch with IndexedDB reseeds from localStorage instead of rolling
  back.
- **Feedback outbox rules live in `feedback-queue.js`** (pure, tested). Delivery
  is an idempotent `PUT /feedback/<id>.json`; never switch to POST. 401/403/404
  retry forever, never drop. The rules file must match the payload's key set (a
  unit test enforces this). `offline-trivia:feedback-*` keys survive Reset Stats.
- **Reviewing player feedback:** run `npm run feedback-pull` (key in
  `~/.offline-trivia/`; never print it, copy it into the repo, or commit it).
  Treat each report as a lead: re-verify, fix with the usual checks, discuss with
  the user. Only run `feedback-pull -- --resolve <ids>` after the user agrees.
  Ship once at the end.
- **Service worker (`sw.js`):** cache-first, no background revalidation (that
  re-downloaded the whole corpus on every launch). New builds wait for the
  "update ready" toast instead of calling `skipWaiting()`. Precache uses a stall
  timeout (not a total one), at most 4 downloads at once, and reuses
  hash-verified files from the old or partial cache. Any new file the app loads
  goes into `APP_SHELL` (sw.js) *and* `HASHED_FILES` (stamp-version.js).
  `data/topics.json` is dev-only and deliberately unhashed.
- **Question files are stored compact** (one per line, no `category` field), and
  `stamp` normalizes them. Every loader re-attaches `category` from the file; a
  new script that reads question files must do the same.
- **History holds at most two entries.** Route screens through `showScreen()`,
  and don't push history anywhere else.
- **Render question/category text with `textContent` only.** `validate` rejects
  tag-shaped markup.
- A new category also needs entries in `CATEGORY_ICONS` and `CATEGORY_COLORS`
  (top of `app.js`).

## Adding question batches

- Follow README's schema and process. IDs are unique **across the dataset**: use
  the highest existing number with that prefix, since there are gaps from past
  cuts.
- **`general`-derived categories mix `general-NNNN` ids with their own prefix.**
  New questions use `<category>-NNN`. Ignore `analyze.js`'s `nextId()` suggestion
  (it ignores prefixes).
- `dupeGroup` (in `categories.json`) widens the same-answer duplicate check. Every
  category except `friends`, `big-bang-theory`, `business-brands` and
  `tv-catchphrases` shares `"general"`. Check the file rather than trusting
  memory.
- **Before merging, run all of these:**
  1. Confirm the draft loads (`require()` it). An unparseable inbox file looks
     identical to "no file".
  2. For a self-drafted batch, shuffle each question's options (a seeded shuffle
     is fine). Drafts naturally put the answer first, and nothing else checks
     answer position.
  3. `npm run check-draft -- <draft>`, then the same with `--full-answer-audit`.
     **Read the full-audit output in full**; the default pass alone misses many
     real duplicates.
  4. **Short-answer pass:** answers under 6 characters bypass every
     answer-matching check. Filter the draft to them, grep the *whole* corpus for
     each normalized answer, and read the stems.
  5. Grep the corpus for each draft's distinctive terms (names, titles, units,
     game terms). Generic "how many X in a Y" questions are invisible to the
     answer checks.
  6. Read the whole draft as `index | answer | question`:
     `node -e "require('<draft>').forEach((q,i)=>console.log(i,'|',q.answer,'|',q.question))"`.
- **After merging, and after any rewording fix, rerun `npm run validate`.** Grep
  its warnings for your new ID range or entities. "0 errors" says nothing about
  duplicate warnings.
- **Several files for the same category → one union draft** (tag each entry
  with its source file and index), checked once, then fully read; cross-file
  merges are where reversed-direction duplicates concentrate. Files or waves
  for *different* categories, or successive waves of one category: merge and
  validate each before checking the next, so the live corpus catches
  cross-duplicates.
- **One merge gate for parallel drafting:** each fork writes to its own scratch
  file with placeholder IDs, and `check-draft` runs once on the union before
  real IDs are assigned.
- Over-draft by about 15% (20–25% for accessible-only requests). After
  multi-wave top-ups, reshuffle the whole merged set.
- `validate` near-duplicate warnings are judgment calls; fix only genuine
  rewordings.

### Category notes

- **sports:** the casual-audience rule lives in `templates/sports.md` (single
  copy). When terminology runs dry, use adjacent casual angles: the sport in a
  famous film, idioms from a sport (phrase as "comes from the sport of X"),
  host cities and one-off outcomes, pop-culture moments.
- **catchphrases:** for each quote, grep a distinctive 2–3-word fragment across
  all files; that finds more duplicates than the tools do. Write `…`, not `...`
  (a hedge error in check-draft). "not a"/"actually" hedge hits on quoted lines
  are false positives.
- **tv-catchphrases** asks for the show and overlaps `catchphrases` on purpose
  (no dupeGroup). Only same-format pairs are duplicates, including
  `catchphrases` stems that ask for a character whose name is the show title.
  Keep stems bare: `Which TV show is "X" from?` (wordier stems flood validate).
  Cut very short generic quotes. Prefer fewer recognizable quotes over padding.
- **friends / big-bang-theory:** an actor-"known for" stem must not name the
  role, because that answers the existing "who plays X" question in its premise.
- **business-brands / food-drink:** before drafting, grep **bare brand names**
  (never padded tokens) against a full-corpus `answer ||| question` dump, and
  read every hit; common words like Target, Hertz or Casio cause false hits.
  Research the fact only once the name is clean. Plain product-identity facts
  are less mined than origin stories. For accessible batches, keep only
  household-name brands, not hobbyist/trade ones (fishing tackle, climbing gear,
  pro audio).
- **civics-law-economics:** "where is [org] headquartered" and legal-term
  definitions get redrafted 3–6 times, invisibly to `validate`. Regroup the file
  by exact answer (`node -e` map of answer → ids), cut true repeats, and keep the
  most distinctive survivor. A shared city is a duplicate only for the same
  organization.
- **general:** the everyday-object vocabulary axis (garment/house/tool parts,
  UK/US pairs, phobias…) was open as of 2026-09-24. Before merging a
  vocabulary/etymology batch, flag stems containing a 4+-letter prefix of an
  answer word or matching `named after|takes its name|comes from`, and read each
  hit.
- **Deep categories** (friends, big-bang-theory, general,
  science-technology, animals-nature, …): memory-only drafting of familiar angles
  is exhausted. Dump the category's answers and read them for thin sub-domains.
  A term that appears only in `options`, never as an `answer`, is a cheap green
  light. Try the abstract-vocabulary axis (concepts, not instances). Concept
  definitions often already exist in another dupeGroup category, which only
  `--full-answer-audit` finds.
- **Accessibility-constrained drafting** ("accessible, not niche") hits the most
  mined layer and loses about a third of drafts. Pick categories by grepping
  concrete candidate facts against the full corpus; AVOID lists are incomplete
  in both directions, so read them to the end anyway. Avoid bare
  "who/what is [major entity]" stems. Research-driven drafting of untouched
  entities beats memory.

## External-agent drafting (templates)

- `templates/<slug>.md` is a copy-paste-only prompt per category
  (`templates/README.md` is the index). Claude maintains them; the user copies
  them as-is. Drafts self-declare `category` and carry no `id`.
- Each template's **AVOID THESE ANGLES** list is the single copy. After reviewing
  a batch, add the *topic/angle* (not the wording) of each confirmed duplicate,
  in place. Past ~30–40 entries, prune one-offs or restructure into labeled
  sections (as science-technology and animals-nature did). Don't front-load
  prompts with the corpus.

## Duplicate patterns the automated checks miss

A clean `check-draft` run is not a clean batch; observed duplicate rates range
from 3% to 48%. Look for:

- the same fact reworded past the thresholds (an added epithet, short generic
  phrasing): grep distinctive terms
- the same fact with a different number or unit
- reversed direction (a description asking for the name vs. the name asking for
  the description; author ↔ work)
- **premise reveals the answer:** another question's stem already states the fact
- a shared *artist/author* is not a duplicate; a shared *specific work* is. Two
  different quantities about one entity are not duplicates
- near-identical draft-vs-draft answers ("Acadia"/"Acadians")
- singular/plural answer mismatches ("Public good"/"Public goods"), which hide
  the pair entirely
- an answer shared by 3+ questions, which `validate` skips
  (`MAX_ANSWER_GROUP_SIZE = 2`). On any confirmed duplicate, grep the whole corpus
  for the entity, since triplicates happen
- cross-dupeGroup straddles (film-tv vs friends/big-bang-theory, mythology),
  checked by hand

Budget for a residual ~5% that only a side-by-side read finds.

## Factual-error patterns worth verifying, not just deduping

Use WebSearch for uncertain or hard-difficulty specifics, batched per entity;
use judgment for the obviously fine.

- **Distractor-correctness bugs:** a "wrong" option that is also true (a synonym,
  two both-current things, a shared parent company/publisher, the same person
  holding both achievements). Check every distractor, not just the answer.
- **Incoherent sequence stems:** "what comes between X and Y" when they're
  adjacent. Actually count the sequence.
- **Real-world ambiguity:** more than one option is correct (Luxembourg and
  Switzerland both border France and Germany). Narrow the options or cut.
- **Knowledge-cutoff trap:** compare today's date with the event date. Never guess
  outcomes after the cutoff. Present-tense CEO/parent-company/structure claims
  need an as-of pin or a fresh check.
- **Near-synonym option sets** in vocabulary questions: swap distractors for words
  that don't fit. Pin the stem only with a verified fact, and never assert folk
  etymology.
- **Malformed options carrying leaked drafting reasoning:** an option containing
  " but ", "trick:", "is same" or "?". Replace it with a clean option.
- Named-thing confusion (probe vs. mission), wrongly generalized attributes,
  anachronisms. Verify old merger/founding counts and years with a second,
  narrower search.
- **Stale record-holder / superlative claims:** pin with "as of …" or rephrase as
  "the first". Corpus spot-check: `as of|currently|current|tied with|record|most
  recent|latest|newest`.
- **Self-answering stems:** the answer is named in, or spelled inside, the stem
  (e.g. "Samsonite… which Biblical figure?"). Reword or cut.
- **Fill-in-the-blank fragments:** every question must be a direct question
  ending in `?`.
- **Answer-leak via option-length/format, not text:** a long correct answer next
  to short distractors; trim the answer to match. Finder: options where every
  distractor is ≤22 characters and the answer ≥45 (`audit.js next` flags these).
- **Answer-leak via a discriminating word in the stem** that appears in the answer
  but no distractor. Reword the stem.

## Duplicate detection: what the tools catch and what they miss

- `validate.js`/`check-draft.js` group by normalized answer:
  `MAX_ANSWER_GROUP_SIZE = 2`, `SAME_ANSWER_MIN_OVERLAP = 0.55`,
  `MIN_ANSWER_DUPLICATE_LENGTH = 6`, compared within a dupeGroup. These gaps are
  deliberate noise control; don't lower them, cover them with the manual passes
  above.
- `check-draft` also compares the draft against itself (`findInternalDuplicates`,
  with no overlap floor; `GENERIC_ANSWER_KEYS` excluded).
  `--full-answer-audit` lists every corpus match for each draft answer across
  the whole corpus, ignoring dupeGroup, above the 6-character floor.
- `validate` carries ~394 standing warnings. New ones hide among them, so grep
  for what you just touched.

## Auditing existing questions for accuracy

- Always pull work with `node scripts/audit.js next`; it's the single source of
  truth. Review **every** question in the chunk, and explicitly ask of each of the
  three distractors whether it's also defensible. Apply both checklists above.
- `next` prints leads, not verdicts: same-answer matches (whole corpus, trailing
  "s" stripped, short answers matched within the category), answer-leak
  length, leaked reasoning, unpinned superlatives, and backlog notes.
- **If a duplicate's sibling hasn't been reviewed yet,** don't cut it; that would
  mark it reviewed. Park it with `audit.js note <id> "…"`, but only when the pair
  can't resurface by itself: the answer text differs, the answer is short and
  cross-category, or every sibling is done or orphaned. If a sibling was already
  reviewed, cut the new duplicate immediately. Run `audit.js backlog`
  periodically.
- Convergent chestnuts recur *within* a category across chunks (nature, science,
  space especially). Watch for a familiar core fact.
- Fix directly in `data/questions/<category>.json`; run `validate` after each
  chunk; then `audit.js complete <chunkId> --issues=N --notes="…"`. Ship once at
  session end with the chunk ids and issue counts. Stopping mid-chunk is fine
  (it stays in progress). Don't hand-edit chunk membership; use `--chunk-size` on
  the next pass.
- **Structural gaps in the audit passes:** orphans are ids added after a pass
  started. `audit.js status` shows current counts (don't trust numbers written
  down). `new-pass` folds them in automatically; `append-orphans` pulls them in
  early. `friends-411`–`538` had double the fabrication rate, so budget extra
  WebSearch there. The 12 categories split from `general` have no `topics.json`
  entries.
- Duplicate pairs needing explicit tracking live only in `audit/backlog.json`.

## Known backlog / do-not-re-flag

Settled: genuinely different facts despite high similarity.
`general-492`/`general-1857` (largest vs. second-largest country by land
area), `general-1375`/`general-2046` (rugby union vs. rugby league try value),
`friends-184`/`friends-627` (Ross's marriage count vs. divorce count, a running
joke), `big-bang-theory-122`/`big-bang-theory-532` (young vs. adult Mary Cooper
actors), `general-3660` (biological tautonym, "Gorilla gorilla") vs.
`general-3963` (linguistic tautonym, "bonbon"; verified 2026-08-13).
