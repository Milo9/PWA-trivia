## General Knowledge (catch-all)

```
You are drafting trivia questions for a multiple-choice trivia app. You have no access to my codebase — just generate the content below and I'll hand it to another AI to review, dedupe, and merge into the database myself.

TOPIC: General Knowledge — a catch-all for solid trivia facts that don't fit a specific topic like history, geography, science, arts, film/TV, music, sports, food, mythology, world cultures, or civics/law/economics. Think idioms, everyday phrases, wordplay terms, units/measurements trivia, board/card games, and similar odds and ends. Do NOT draft economics terms, legal principles, government-system definitions, or international-organization facts — those belong in the Civics, Law & Economics category now. Do NOT draft collective-noun-for-a-group-of-animals questions — those belong in Animals & Nature.

COUNT: 100 questions.

AVOID THESE ANGLES — already well-covered in my question bank, so don't draft facts that overlap with these (pick different, more specific facts instead):
- How many continents there are (Seven)
- How many sides a hexagon has (Six)
- Definition of a pangram (a sentence containing every letter of the alphabet)
- Definition of an oxymoron (contradictory terms paired for effect, e.g. "jumbo shrimp")
- Definition of a palindrome (reads the same forwards and backwards) — already asked 3+ times in the corpus
- Definition of an anagram (word formed by rearranging another word's letters) — already asked 2+ times
- Definition of a synonym / antonym / onomatopoeia
- How many squares are on a standard chessboard (64)
- Which chess piece moves only diagonally (bishop)
- How many cards each player gets in bridge (13)
- Collective noun for a group of flamingos (a flamboyance) — collective-noun questions belong in Animals & Nature, not here
- Which letter doesn't appear in the name of any US state (Q)
- The Rubik's Cube's original name, "Magic Cube," or Ernő Rubik's profession as an architecture professor
- The QWERTY keyboard layout being designed to prevent typewriter key jams
- Why SOS was chosen as the Morse code distress signal (simple, distinctive pattern)
- "Saved by the bell" originating from boxing
- Portmanteau definition (word blending two others, e.g. brunch, smog) and Lewis Carroll coining the term in Through the Looking-Glass (1871)
- Idiom meanings: "spill the beans," "kick the bucket," "bite the bullet," "break a leg," "the whole nine yards"
- Spoonerism, malapropism, and heteronym definitions
- Baker's dozen (13), league (~3 miles), and furlong (220 yards) as traditional units
- Card/board game counts: Uno deck size, Risk board territories, Clue/Cluedo suspects, Texas Hold'em hole cards dealt, opposite faces on a standard die summing to 7, Monopoly's passing-Go salary
- Royal flush as poker's highest-ranking hand
- The tittle (dot over a lowercase i or j)
- How long a fortnight is (14 days)

Use web search to verify every fact — do not rely on memory alone. Prefer authoritative sources (reference databases, almanacs) over guessing. For each question, actually find the fact via search rather than recalling it, especially for obscure details.

If any fact involves a "current record," "most," "latest," or similar superlative, pin it to a specific time (e.g. "as of 2026") rather than stating it as a timeless fact, since these claims go stale.

OUTPUT FORMAT: A single JavaScript file, CommonJS style, like this:

module.exports = [
  {
    "difficulty": "easy" | "medium" | "hard",
    "category": "general",
    "question": "What is...?",
    "options": ["Correct answer", "Wrong option 1", "Wrong option 2", "Wrong option 3"],
    "answer": "Correct answer"
  },
  ...
];

Rules for each entry:
- Do NOT include an "id" field — I'll assign that myself.
- Every entry MUST include "category": "general" exactly as written (all lowercase, with the hyphen) — don't vary it, translate it, or use the topic name instead.
- Exactly 4 options, all non-empty, all distinct from each other.
- "answer" must be an exact string match (character-for-character) to one of the 4 "options".
- The correct answer's position in the options array should be varied/randomized across questions — don't always put it first or in the same slot.
- "question" must not leak the answer in the question text itself (e.g. don't write "What type of animal is Geppetto's cat?" if the answer is "cat").
- Options should be short answer phrases, not full sentences.
- Do NOT use hedge or meta answers as options (e.g. "This isn't a real plot point," "None of the above," "It's unclear") — every option should be a real, specific, plausible-sounding answer.
- Avoid the most well-known/obvious trivia chestnuts for this topic if possible — I likely already have those. Favor specific, lesser-known facts over headline facts.
- Distractor (wrong) options should be plausible, not absurd, and should not themselves be true statements about the topic (a wrong answer that's secretly also correct elsewhere is a common trivia bug).

Output just the JS file content, nothing else.
```
