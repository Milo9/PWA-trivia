# Prompt template: drafting question batches with an external AI

Use this when you want an AI agent that has **no context of this repo**
(e.g. a fresh session, a different tool, one with web search but no
filesystem access) to draft a batch of trivia questions for you to review.
Fill in the bracketed parts, then copy everything inside the code block
below — nothing outside it — and paste that to the agent. Hand its output
back to Claude in this repo afterward — say which category it's for — and
Claude will run `check-draft.js`, fix flagged issues, assign IDs, merge,
validate, and ship.

---

```
You are drafting trivia questions for a multiple-choice trivia app. You have
no access to my codebase — just generate the content below and I'll hand it
to another AI to review, dedupe, and merge into the database myself.

TOPIC: [Pick one category — general knowledge is now split into: History,
Geography, Science & Technology, Animals & Nature, Space & Astronomy, Arts
& Literature, Film & TV, Music, Sports, Food & Drink, Mythology &
Religion, World Cultures & Languages, or a small General Knowledge
catch-all for things that don't fit any of those. Name the one category
you want here, e.g. "Science & Technology" or "Friends (TV show)".]

COUNT: 100 questions.

AVOID THESE ANGLES — already well-covered in my question bank, so don't
draft facts that overlap with these (pick different, more specific facts
instead):
- Chemical symbol for tungsten (W)
- Earth's atmosphere composition (~78% nitrogen)
- Number of bones in the adult human body (206)
- Smallest planet in the solar system (Mercury)
- Which planet has the most moons (Saturn)
- Hardest naturally occurring substance (diamond)
- Who invented the World Wide Web (Tim Berners-Lee)
- SI unit of electrical resistance (ohm)
- Chemical symbol for potassium (K)
- Subatomic particle with no electric charge (neutron)

Use web search to verify every fact — do not rely on memory alone. Prefer
authoritative sources for this topic (e.g. fan wikis and episode guides for
a TV show, reference databases/almanacs for general knowledge) over
guessing. For each question, actually find the fact via search rather than
recalling it, especially for obscure details (guest actor names, minor
character info, specific numbers/dates/records).

If any fact involves a "current record," "most," "latest," or similar
superlative, pin it to a specific time (e.g. "as of 2026") rather than
stating it as a timeless fact, since these claims go stale.

OUTPUT FORMAT: A single JavaScript file, CommonJS style, like this:

module.exports = [
  {
    "difficulty": "easy" | "medium" | "hard",
    "question": "What is...?",
    "options": ["Correct answer", "Wrong option 1", "Wrong option 2", "Wrong option 3"],
    "answer": "Correct answer"
  },
  ...
];

Rules for each entry:
- Do NOT include "id" or "category" fields — I'll assign those myself.
- Exactly 4 options, all non-empty, all distinct from each other.
- "answer" must be an exact string match (character-for-character) to one of
  the 4 "options".
- The correct answer's position in the options array should be varied/
  randomized across questions — don't always put it first or in the same slot.
- "question" must not leak the answer in the question text itself (e.g. don't
  write "What type of animal is Geppetto's cat?" if the answer is "cat").
- Options should be short answer phrases, not full sentences.
- Do NOT use hedge or meta answers as options (e.g. "This isn't a real plot
  point," "None of the above," "It's unclear") — every option should be a
  real, specific, plausible-sounding answer.
- Avoid the most well-known/obvious trivia chestnuts for this topic if
  possible — I likely already have those. Favor specific, lesser-known facts
  (guest cast, minor characters, specific numbers, niche details) over
  headline facts.
- Distractor (wrong) options should be plausible, not absurd, and should not
  themselves be true statements about the topic (a wrong answer that's
  secretly also correct elsewhere is a common trivia bug).

Output just the JS file content, nothing else.
```

---

## Angles already covered

Different external agents (and repeat runs of the same one) tend to
converge on the same well-known trivia facts, since they're drawing on a
similar slice of general knowledge. This list tracks the specific
facts/angles that have already caused a drafted question to collide with
the existing corpus, so future prompts can steer around them instead of
re-generating and re-rejecting the same chestnuts every batch. Paste the
relevant category's list into the `AVOID THESE ANGLES` line above before
sending the prompt.

This is maintained by Claude after each inbox batch review — see
CLAUDE.md's "External-agent drafting" section for the update process. Not
meant to be exhaustive or grow forever; entries get pruned if the list gets
long and unfocused.

### general (formerly one bucket, split 2026-08-01 — see CLAUDE.md)

`general` used to be a single ~2825-question category; it's now split
into the 12 categories below plus a small `general` catch-all. The
chestnuts below were logged back when it was all one bucket and have been
sorted into whichever new category they actually belong to. Paste the
relevant category's list when drafting for that category specifically.

#### history

- Year of the Great Fire of London (1666)
- Year the French Revolution began (1789)
- Year the Suez Canal opened (1869)
- Year WWI began / WWII ended (1914 / 1945)
- Year the Berlin Wall fell (1989)
- Who was the first US President (George Washington)
- Which country gifted the Statue of Liberty to the US (France)
- First woman to fly solo across the Atlantic (Amelia Earhart)
- Name of the first artificial Earth satellite (Sputnik 1)

#### geography

- Capital-city lookups for major/well-known countries (China, Germany,
  Brazil, Egypt, Australia, Spain, Russia, India, Canada, France, Italy,
  Bhutan, Japan, Mongolia, etc.) — near-guaranteed collision territory,
  favor capitals of less-common countries instead
- Largest continent by land area (Asia)
- Country with the longest coastline (Canada)
- Country home to the Great Barrier Reef (Australia)
- Largest ocean (Pacific)
- Tallest mountain in Africa (Kilimanjaro)
- Smallest country in the world by land area (Vatican City)
- Tallest building in the world, time-pinned (Burj Khalifa)
- Country known as "Land of the Rising Sun" (Japan)
- Longest river in the world (Nile)
- Japan's official currency (Yen)

#### science-technology

- Chemical symbol for tungsten (W)
- Earth's atmosphere composition (~78% nitrogen)
- Number of bones in the adult human body (206)
- Hardest naturally occurring substance (diamond)
- Who invented the World Wide Web (Tim Berners-Lee)
- SI unit of electrical resistance (ohm)
- Chemical symbol for potassium (K)
- Subatomic particle with no electric charge (neutron)
- Chemical symbol lookups for common elements (silver/Ag, gold/Au,
  copper/Cu, iron/Fe, helium/He, mercury/Hg, sodium/Na, lead/Pb, tin/Sn) —
  very high collision rate, favor less-common elements
- Boiling point of water at sea level (100°C)
- SI unit of electric current (Ampere) / electrical capacitance (Farad)
- Longest bone in the human body (Femur)
- Number of chambers in the human heart (Four)
- Largest organ in the human body (Skin)
- Element with atomic number 1 (Hydrogen)
- Newton's laws of motion / universal gravitation
- Metal that's liquid at room temperature (Mercury)
- Most abundant gas in Earth's atmosphere (Nitrogen) — note: "most
  abundant NOBLE gas" (Argon) is a different, still-valid fact, not a dupe
- Who discovered penicillin (Alexander Fleming)
- "First successful human [organ] transplant surgeon" template — heart
  (Christiaan Barnard), liver (Thomas Starzl), kidney (Joseph Murray),
  lung (James Hardy), pancreas (Richard Lillehei), bone marrow (E. Donnall
  Thomas) are all now covered; a heart-LUNG transplant question collided
  with the existing heart-transplant one specifically

#### animals-nature

- How many legs a spider has (Eight)
- Largest mammal in the world (Blue Whale)
- How many hearts an octopus has (Three)

#### space-astronomy

- Smallest planet in the solar system (Mercury)
- Which planet has the most moons (Saturn)
- Largest planet in the solar system (Jupiter)
- Which planet is known as the "Red Planet" (Mars)
- Planet closest to the Sun (Mercury)

#### arts-literature

- Who wrote "The Divine Comedy" (Dante Alighieri)
- Who wrote "Crime and Punishment" (Fyodor Dostoevsky)
- Who wrote "Pride and Prejudice" (Jane Austen)
- Who wrote "War and Peace" (Leo Tolstoy)
- Who painted the "Mona Lisa" (Leonardo da Vinci)
- Who painted "The Starry Night" (Vincent van Gogh)
- Who wrote "Don Quixote" (Miguel de Cervantes)
- Which fairy tale character leaves a glass slipper (Cinderella)
- Who wrote "Romeo and Juliet" (William Shakespeare) — this one collided
  three separate times across different drafting agents in a single batch

#### film-tv

- Who played the title role in "Forrest Gump" (Tom Hanks)

#### music

- Who composed "The Four Seasons" (Antonio Vivaldi)

#### sports

- Which country won the first FIFA World Cup (Uruguay)

#### food-drink

*(none logged yet)*

#### mythology-religion

- Name of Thor's hammer in Norse mythology (Mjölnir)

#### world-cultures

*(none logged yet)*

#### general (catch-all)

- How many continents there are (Seven)
- How many sides a hexagon has (Six)

### friends

*(none yet — add here after the first external-agent batch for this
category is reviewed)*

### big-bang-theory

*(none yet — add here after the first external-agent batch for this
category is reviewed)*

---

## Why it's shaped this way

- **No `id`/`category`** — IDs are assigned at merge time based on the
  current highest ID in the target category, so collisions from the
  drafting agent aren't a concern.
- **"Verify via search, don't recall"** matters most for `friends` and
  `big-bang-theory` — those two are deep enough that memory-only drafting
  has a high duplicate/inaccuracy rate (see CLAUDE.md). For `general`,
  memory drafting still mostly works but benefits from search too as it
  grows.
- **Time-pinning superlatives** and **no hedge/meta answers** map directly
  to checks `check-draft.js` already runs — front-loading them in the
  prompt means fewer things get rejected after the fact.
