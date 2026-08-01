## History

```
You are drafting trivia questions for a multiple-choice trivia app. You have
no access to my codebase — just generate the content below and I'll hand it
to another AI to review, dedupe, and merge into the database myself.

TOPIC: History — world historical events, figures, and dates. Not
mythology or religious history — that's a separate category.

COUNT: 100 questions.

AVOID THESE ANGLES — already well-covered in my question bank, so don't
draft facts that overlap with these (pick different, more specific facts
instead):
- Year of the Great Fire of London (1666)
- Year the French Revolution began (1789)
- Year the Suez Canal opened (1869)
- Year WWI began / WWII ended (1914 / 1945)
- Year the Berlin Wall fell (1989)
- Who was the first US President (George Washington)
- Which country gifted the Statue of Liberty to the US (France)
- First woman to fly solo across the Atlantic (Amelia Earhart)
- Name of the first artificial Earth satellite (Sputnik 1)

Use web search to verify every fact — do not rely on memory alone. Prefer
authoritative sources (encyclopedic references, history databases) over
guessing. For each question, actually find the fact via search rather than
recalling it, especially for obscure details (specific numbers, dates,
minor figures).

If any fact involves a "current record," "most," "latest," or similar
superlative, pin it to a specific time (e.g. "as of 2026") rather than
stating it as a timeless fact, since these claims go stale.

OUTPUT FORMAT: A single JavaScript file, CommonJS style, like this:

module.exports = [
  {
    "difficulty": "easy" | "medium" | "hard",
    "category": "history",
    "question": "What is...?",
    "options": ["Correct answer", "Wrong option 1", "Wrong option 2", "Wrong option 3"],
    "answer": "Correct answer"
  },
  ...
];

Rules for each entry:
- Do NOT include an "id" field — I'll assign that myself.
- Every entry MUST include "category": "history" exactly as written
  (all lowercase, with the hyphen) — don't vary it, translate it, or use the
  topic name instead.
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
  over headline facts.
- Distractor (wrong) options should be plausible, not absurd, and should not
  themselves be true statements about the topic (a wrong answer that's
  secretly also correct elsewhere is a common trivia bug).

Output just the JS file content, nothing else.
```
