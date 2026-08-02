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

**`ship` runs `git add -A`, which stages the *entire* working tree, not
just the files you changed.** Before running `ship`, run `git status`
yourself and check for any pre-existing untracked/modified files that
aren't part of your current change — `ship` will silently sweep them
into the same commit otherwise. Confirmed 2026-08-01: an unrelated,
unreviewed untracked file that happened to be sitting in `templates/`
(a misplaced draft batch, not a real template) got committed and pushed
along with an unrelated question batch merge, requiring a follow-up
commit to remove it. If you find stray files like this, deal with them
(move, delete, or otherwise resolve) *before* shipping your actual
change, not after.

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

`templates/` holds one fully self-contained, ready-to-copy-paste prompt
file per category (`templates/<slug>.md`), for handing batch-drafting to
an AI agent with no context of this repo. **Each category file is
copy-paste content only — it has no instructions aimed at the user or at
Claude, just the prompt itself.** (`templates/README.md` is the one
exception — it's an index with picking instructions, not a prompt.)
Claude maintains the per-category files directly (see below); the user
never edits them or assembles a prompt from pieces — they pick a
category's file and copy the whole code block as-is.

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
   `templates/<slug>.md` — add the new angles to that one category's code
   block. Don't touch other categories' files, and don't maintain the
   list anywhere else; the prompt block itself is the only copy.
3. If a category's list grows past ~30–40 entries, prune it: drop angles
   too specific to plausibly recur, and keep the ones that show up
   repeatedly across batches (e.g. "SI unit of X," "chemical symbol for
   Y" — categories of chestnut, not just one-off facts).

**Seeded 2026-08-01** from the first inbox batch (`GLM52-01.js`, 100
`general`-category questions drafted by an external agent, reviewed and
merged as `general-2881`–`2970`): 10 of the 100 drafted questions collided
with the existing corpus, all common science/geography chestnuts. See the
per-category `AVOID THESE ANGLES` lists in `templates/<slug>.md`
for the current state.

**Drafts now self-declare `category` (2026-08-01):** since each file in
`templates/` is already for exactly one category, every
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

**`localLLM-Gemma4-01` processed 2026-08-01** (single-file batch, 112
`space-astronomy` questions from a local/small model, already
self-declaring `category`): `check-draft.js` alone only flagged 4 likely
and 9 near duplicates against the corpus — a manual draft-vs-draft and
draft-vs-category pass (the technique this section already calls out:
`check-draft.js` has no draft-vs-draft question-text comparison) found far
more, since this batch had heavy *internal* repetition (e.g. "what is the
name of the galaxy we live in" asked 3 times in the same 112, several
near-identical "what force does X" gravity filler questions) on top of
chestnuts already in the corpus. 49 of 112 (~44%) were cut — well above
even the "no angles list yet" 33% rate from the larger Expanded batch
above, consistent with this being a small/local model with less breadth
than the frontier-model batches this repo has processed so far. Also
caught two factual/internal-consistency errors typical of a weaker model,
not just duplication: one question named "Huygens" itself as the
*mission* that landed a probe on a moon (Huygens is the probe; the
mission is Cassini-Huygens — and another question in the same batch
correctly said so, contradicting the first), and one called the
photosphere a star's "outermost layer" (the corona is outermost; the
photosphere is just the visible "surface"). Both dropped rather than
fixed in place, since better-framed correct versions of the underlying
facts already existed elsewhere in the batch or corpus. Surviving 63
merged as `space-astronomy-034`-`096`. All confirmed-duplicate angles
folded into `space-astronomy`'s list in `templates/space-astronomy.md`.

**`gemini-code-1785624420472.js` processed 2026-08-01** (single-file
batch, 102 `film-tv` questions, already self-declaring `category`):
`check-draft.js` only flagged 1 near-duplicate and 2 advisory notes, but
a manual answer-index cross-check (build a map of every draft answer
against every existing corpus entry sharing that exact normalized
answer, regardless of `MAX_ANSWER_GROUP_SIZE`, then eyeball each pair —
now built into `check-draft.js --full-answer-audit`, see that file's
usage comment, so a future session can run one command instead of
writing this from scratch) found far more — 42 of 102 (~41%) were cut,
the highest rate seen on this project so far. Almost all were classic
"who directed/played X"
chestnuts already asked 2-5 times in the existing `film-tv`/`general`
corpus (e.g. "who directed Jurassic Park" already had 2 near-identical
existing entries, "who composed Jaws" had 4, "who directed Pulp
Fiction" had 5) — `check-draft.js`'s own near-duplicate pass missed
these because the drafted wording was different enough (low word
overlap) and its same-answer check's `MAX_ANSWER_GROUP_SIZE` cap and
`SAME_ANSWER_MIN_OVERLAP` floor both correctly suppress noise but, as a
side effect, also suppress real duplicates once an answer already has 2+
existing hits or the reworded phrasing scores below 0.55 overlap — the
same documented gap as the Magellan finding under "General Knowledge
split," just triggered at much higher volume here because this batch
leaned so heavily on the most obvious Hollywood facts. Two entries were
fixed rather than dropped: one attributed Darth Vader's "No, I am your
father" line to "the original 1977 Star Wars" instead of *The Empire
Strikes Back* (1980), and one placed "Stranger Things"' Hawkins in
Washington state instead of Indiana — both real factual errors, not
duplicates, caught during the same manual read-through. One more was
dropped for a distractor-correctness problem rather than duplication:
a question about the prison planet in *Alien 3* offered "Fiorina 161"
as correct and "Fury 161" as wrong, but the film's own on-screen text
calls it "Fiorina 'Fury' 161" — both forms are correct, so the
"wrong" option wasn't actually wrong (same class of bug as the
Huygens/photosphere errors in the `localLLM-Gemma4-01` batch above).
Also caught one cross-category duplicate that neither automated check
looks for at all: a "which actor played Sheldon Cooper" question tagged
`film-tv` duplicated `big-bang-theory-030`, which already asks the exact
same fact in the dedicated `big-bang-theory` category — `check-draft.js`
and `validate.js` both compare *within* whatever category grouping
applies (`dupeGroup ?? category`), which is correct for avoiding false
positives on coincidental cross-category answer reuse, but means a
genuine duplicate that happens to straddle a "general" category
(`film-tv`) and a deep dedicated category (`big-bang-theory`,
`mythology-religion`) won't surface automatically — worth specifically
checking for when a `film-tv` draft touches Friends/Big Bang Theory
characters or generic mythology/legend facts that have their own
category. Surviving 60 merged as `film-tv-134`-`193`. All
confirmed-duplicate angles folded into `film-tv`'s list in
`templates/film-tv.md`, including the cross-category ones as a
clarifying note rather than a bullet (they're not "already in film-tv,"
they're "belongs to a different category entirely").

**`QWEN-01-8779348587346bgkjdfhgiudfhgjhdfrgkhdfikgu.js` processed
2026-08-01** (single-file batch, 100 `food-drink` questions, already
self-declaring `category` — first batch drafted from `templates/
food-drink.md`, which had no `AVOID THESE ANGLES` list yet): 10 of 100
were cut. `check-draft.js`'s default pass only flagged 2 near-duplicates
(orzo, Margherita cheese) and 4 advisory notes; a manual full-answer-audit
plus targeted corpus greps for each drafted dish/ingredient name (the
technique this section already documents — `check-draft.js`'s answer-match
check suppresses once an answer already has 2+ existing hits, and several
`food-drink`/`general` chestnuts here already had 2-3) found the rest: the
crocus/saffron origin fact, hummus's chickpea base, and guacamole's avocado
base were each already asked 2-3 times in the existing corpus; sauerkraut's
cabbage base and gazpacho's tomato base were each already asked once. One
more (mirepoix's three vegetables) matched only at low text-overlap because
the existing corpus asks it in reverse ("name the third vegetable besides
onions and carrots" / "name this mixture of onions, celery, carrots") while
the draft asked "name all three" — same fact, missed by both the text-
overlap and answer-match checks since the draft's answer was the full list
rather than a single ingredient name. One question (Ukrainian dumplings,
described as "similar to Polish pierogi") duplicated another question in
the *same draft batch* (Polish pierogi dumplings) — check-draft.js has no
draft-vs-draft comparison, so this only surfaced during a manual read.
One was cut for a distractor-correctness bug, not duplication: a wasabi
question offered "Wasabia japonica" as correct and "Eutrema japonicum" as
wrong, but the latter is the currently-accepted scientific name for the
same plant (Wasabia japonica is a synonym) — same class of bug as the
Fiorina/Fury 161 and Huygens/photosphere errors in earlier batches. Two
more were fixed rather than cut for a subtler version of the same
answer-leak pattern `check-draft.js` already catches verbatim: a biltong
question described it as "air-dried, cured meat strips" and then offered
"Dried meat" as the correct answer — testable by reading comprehension
alone, no actual biltong knowledge required — rewritten to ask for the
snack's name directly (answer: "Biltong", with "Droëwors"/"Boerewors"/
"Pemmican" as real distractors); a Vegemite question and an arak question
both had the answer word itself ("yeast extract," "anise") appear verbatim
in the question text (these two were caught by `check-draft.js`) and were
reworded to describe rather than name the answer. Surviving 90 merged as
`food-drink-010`–`099` (existing file only had 9 entries using the
`food-drink-` prefix; the rest are legacy `general-NNNN` ids from before
the split). Seeded `templates/food-drink.md`'s first `AVOID THESE ANGLES`
list with all 7 confirmed-duplicate angles from this batch (see that file).

**`Mistral-01-SPACE87785676...js` processed 2026-08-01** (single-file
batch, 99 `space-astronomy` questions, self-declaring `category`):
`check-draft.js`'s default pass only flagged 1 likely duplicate, 1
near-duplicate, and 1 advisory note, but a manual full-answer-audit
(`--full-answer-audit`) plus reading every surviving question against the
existing corpus found far more — 23 of 99 (~23%) were cut, all for one of
two reasons. Most were plain duplicates the answer-match check's overlap
floor/group-size cap suppressed, the same known gap documented elsewhere
in this file: e.g. "which planet has the lowest density, less than
water" duplicated `space-astronomy-020`'s "would float in a bathtub"
framing of the identical fact; "shortest rotation period" duplicated 4
existing "shortest day" entries; "discovered by Herschel in 1781"
duplicated "first planet discovered by telescope"; Enceladus's geysers,
Europa's subsurface ocean, and Ganymede-larger-than-Mercury each
duplicated an existing entry testing the same fact with different
wording. The rest were real factual errors caught only by web-verifying
claims that "sounded right" from training-data recall, the same failure
mode as the Huygens/photosphere and Fiorina/Fury 161 errors in earlier
batches: one question named Venus as the solar system's most
volcanically active body (Io is; Venus's own entry contradicted a
correctly-worded Io question elsewhere in the same draft), one named
Magellan as the first spacecraft to orbit Venus (Venera 9 orbited in
1975, and even NASA's own Pioneer Venus in 1978 predates Magellan's
1989 arrival — confirmed via web search, not memory), one credited
Kepler with discovering the first exoplanet around a Sun-like star
(that was 51 Pegasi b in 1995 via ground-based radial velocity, seven
years before Kepler existed), one claimed OSIRIS-REx "is studying"
Bennu in the present tense (the spacecraft finished with Bennu at
sample return in 2023 and is now OSIRIS-APEX, en route to Apophis), and
two had a genuine two-correct-options bug rather than a wrong answer:
"which mission brought back samples from an asteroid" listed both
Hayabusa2 and OSIRIS-REx as options when both are true, and "which rover
is currently exploring Mars" listed both Curiosity and Perseverance as
options when both are still active as of 2026 (confirmed via web
search). One advisory-flagged answer leak (a "16 Psyche" question whose
answer was "Psyche") was fixed by rewording rather than cut, since the
underlying fact was otherwise fine. Time-pinned "as of 2026"-style
claims that looked risky at first (Themis's spring-2026 first hop test,
Pandora's 2026 launch, the 6,128-exoplanet count as of February 2026)
were individually web-verified as accurate rather than assumed
guilty-by-association with the errors above, and kept. Surviving 76
merged as `space-astronomy-097`–`172`. All confirmed-duplicate angles
folded into `space-astronomy`'s list in `templates/space-astronomy.md`,
including the two factual-error angles (Magellan/Venus, Kepler/51
Pegasi) as cautionary notes rather than bullets, since they're wrong-
answer traps rather than duplicate topics.

**`QWEN38max-01-ANIMALS...js` processed 2026-08-01** (single-file batch,
100 `animals-nature` questions, self-declaring `category`): `check-
draft.js`'s default pass found nothing blocking at all (0 likely/near
duplicates), and `--full-answer-audit` only surfaced 5 candidates, of
which 4 were real. This batch was unusually specific/numeric (exact
voltages, decibel levels, g-forces, dates) rather than leaning on generic
superlatives, which is exactly why the automated checks underperformed
here: a specific-sounding drafted fact ("what disease are naked mole rats
resistant to") can still be a near-verbatim duplicate of an existing
entry even though neither the question text nor a bare answer-string
match makes that obvious at a glance. A manual pass — grepping the
existing `animals-nature`/`general` corpus for every distinctive noun in
the draft (species and phenomenon names: narwhal, wombat, mantis shrimp,
axolotl, etc.) rather than relying on either automated check — found 21
of 100 (21%) were duplicates, all missed by `check-draft.js` because the
matching existing entry's *answer* wording differed enough (e.g. draft's
"a canine tooth" vs. corpus's "an elongated canine tooth" for the narwhal
tusk fact) or because the fact already had 2 existing hits, hitting the
answer-match group-size cap (pangolin scales/keratin and giant panda's
thumb/radial sesamoid bone were each already asked twice in the corpus).
One entry was both a duplicate and a factual overstatement: a draft
question asked what body part axolotls can regenerate and gave "its
entire brain" as the correct answer, when the existing corpus entry
testing the same fact correctly says axolotls regenerate "parts of its
brain and heart" — axolotls do not regenerate an entire brain, so the
draft's answer was simply wrong, not just redundant. Two duplicates were
the same core fact restated with a different specific number rather than
different wording — peregrine falcon dive speed (existing corpus already
uses "over 240 mph"; draft used "320 km/h / 200 mph" for the same "fastest
diving bird" fact) and giant squid eye size (existing corpus says "size of
a dinner plate"; draft gave "10 inches / 25 cm" for the same "largest eyes
in the animal kingdom" fact) — both cut as the same underlying trivia
point, not kept as complementary facts, since the specific number wasn't
the point being tested in either version. Surviving 79 merged as
`animals-nature-166`–`244`. All confirmed-duplicate angles folded into
`animals-nature`'s list in `templates/animals-nature.md`, including a
note (not from this batch, but noticed while auditing it) that the *same*
shared biological mechanism reused on a *different* named animal — e.g.
copper-based hemocyanin causing blue blood, already asked about a
horseshoe crab, kept when the draft asked it about an octopus instead —
is a judgment call to keep, not an automatic cut, unlike a verbatim
repeat on the same animal.

**`QWEN37max-01-GEOGRAPHY...js` processed 2026-08-01** (single-file
batch, 100 `geography` questions, self-declaring `category`): the
highest duplicate rate seen on this project so far — 26 of 100 (26%) cut
— because `geography` as a topic is almost entirely made of superlative
chestnuts ("largest," "longest," "highest") that both this corpus and
any drafting model converge on independently. `check-draft.js`'s default
pass actually did most of the work this time (5 likely + 10 near-dup
warnings caught the most blatant repeats: Sahara/largest hot desert,
Greenland/largest island, Volga/longest river Europe, Bering
Strait, Sicily/largest Mediterranean island, etc.), but still needed a
manual grep-every-noun-phrase pass on top to catch same-fact-different-
wording duplicates that score below the text/answer thresholds — e.g.
Turkey straddling the Bosphorus already had *three* near-identical
existing entries, France's time-zone count had *four*, and the Andes as
longest mountain range had *four*, none flagged automatically because
each individual pair's wording differed enough. Capital-of-country
questions for obscure/small nations (Eswatini, Palau, Vanuatu, Kiribati,
Tuvalu, Comoros, etc. — about 60 of the batch's 100 questions) turned
out to be almost entirely *not* duplicated, since the existing corpus's
capital coverage skews toward well-known countries — confirming
`templates/geography.md`'s existing advice to favor obscure-country
capitals really does avoid collisions in practice.

This batch also surfaced three real factual errors already **shipped**
in the existing corpus, not just in the draft — caught because the
draft's version of the same fact used a different (and, on checking,
more accurate) answer, which is a distinct failure mode from every prior
batch's errors (which were all draft-side). All three were verified via
web search, fixed in place in `data/questions/geography.json`, and kept
distinct from the corresponding new draft entries rather than treated as
plain duplicates:
1. `geography-011` claimed the Botswana–Zambia border (~150m) was "the
   shortest international land border in the world" — the Spain–Morocco
   border at Peñón de Vélez de la Gomera (~85m) is shorter and is the one
   generally cited as shortest. Reworded `geography-011` to drop the
   false "shortest in the world" claim (now "one of the shortest"), and
   kept the draft's Spain/Morocco question as the "shortest" answer.
2. `geography-023` asked for "the highest capital city in the world by
   elevation" and gave **Quito** as the answer; mainstream sources
   (WorldAtlas, Britannica, CIA World Factbook) all cite **La Paz**
   (~3,640m) as the highest, with Quito (~2,850m) second — fixed
   `geography-023`'s answer to La Paz, which made the draft's own
   "highest administrative capital" question (same fact, La Paz) now a
   duplicate of the corrected entry, so that draft question was cut
   rather than kept.
3. `general-1482` and `general-2445` (both filed in `geography.json`
   per the `general`-split's `dupeGroup` convention) both called the
   Atacama Desert "the driest place on Earth" — the McMurdo Dry Valleys
   (Antarctica) hold that title with zero recorded precipitation in
   parts; Atacama is more precisely the driest *non-polar* desert.
   Reworded both existing entries to say "driest non-polar desert" /
   "driest non-polar places," which resolved what would otherwise have
   been a direct contradiction with the draft's McMurdo Dry Valleys
   question, and both were kept as complementary rather than
   conflicting facts.

One judgment call resolved the opposite way — *not* a contradiction
despite initially looking like one: the draft asked for "the largest
archipelago in the world by area" (Malay Archipelago), while the corpus
already has four existing entries calling Indonesia "the world's largest
archipelago." Web search confirmed these aren't actually competing
claims: the Malay Archipelago is the largest archipelago as a geographic
region (it contains Indonesia, the Philippines, Malaysia, Brunei, Timor-
Leste, and Papua New Guinea), while Indonesia is the largest archipelago
*by country*. Since the draft's question and options are all archipelago
*regions* (not countries), it doesn't read as contradicting the existing
country-scoped questions, so it was kept rather than cut — unlike the
three cases above, no existing entries needed correction here, just
verification that the two "largest" claims don't actually conflict.

Surviving 74 merged as `geography-064`–`137`. All confirmed-duplicate
angles folded into `geography`'s list in `templates/geography.md`,
including the two ambiguous-superlative traps (highest capital,
driest place) as cautionary notes for future drafting.

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
