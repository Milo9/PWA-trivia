## Business & Brands

```
You are drafting trivia questions for a multiple-choice trivia app. You have
no access to my codebase — just generate the content below and I'll hand it
to another AI to review, dedupe, and merge into the database myself.

TOPIC: Business & Brands — company logos, slogans, founders/founding
stories, and famous product flops. Focus on consumer brands most people
interact with regularly (retail, food, tech, cars, apparel, etc.), not
obscure B2B companies or finance/economics theory.

COUNT: 100 questions.

Use web search to verify every fact — do not rely on memory alone. Prefer
authoritative sources (company histories, business/news archives, design
retrospectives) over guessing. For each question, actually find the fact via
search rather than recalling it, especially for founding dates, specific
dollar figures, and designer names.

If any fact involves a "current record," "most," "latest," market cap,
revenue figures, or similar superlative/numeric claim that changes over
time, pin it to a specific time (e.g. "as of 2026") rather than stating it
as a timeless fact, since these claims go stale.

OUTPUT FORMAT: A single JavaScript file, CommonJS style, like this:

module.exports = [
  {
    "difficulty": "easy" | "medium" | "hard",
    "category": "business-brands",
    "question": "What is...?",
    "options": ["Correct answer", "Wrong option 1", "Wrong option 2", "Wrong option 3"],
    "answer": "Correct answer"
  },
  ...
];

Rules for each entry:
- Do NOT include an "id" field — I'll assign that myself.
- Every entry MUST include "category": "business-brands" exactly as written
  (all lowercase, with the hyphen) — don't vary it, translate it, or use the
  topic name instead.
- Exactly 4 options, all non-empty, all distinct from each other.
- "answer" must be an exact string match (character-for-character) to one of
  the 4 "options".
- The correct answer's position in the options array should be varied/
  randomized across questions — don't always put it first or in the same slot.
- "question" must not leak the answer in the question text itself (e.g. don't
  ask "What is the name of the McDonald's fast-food chain?" if the answer is
  "McDonald's" — the brand name itself often can't be avoided as context, but
  make sure the actual fact being tested isn't given away).
- Options should be short answer phrases, not full sentences.
- Do NOT use hedge or meta answers as options (e.g. "This isn't publicly
  known," "None of the above," "It's unclear") — every option should be a
  real, specific, plausible-sounding answer.
- Avoid the most well-known/obvious trivia chestnuts for this topic if
  possible — I likely already have those. Favor specific, lesser-known facts
  over headline facts.
- Distractor (wrong) options should be plausible, not absurd, and should not
  themselves be true statements about the same fact being tested (a wrong
  answer that's secretly also correct elsewhere is a common trivia bug) — a
  good pattern here is using real competitor brands, real sibling car/product
  models, or other real people from the same industry as distractors.

AVOID THESE ANGLES (facts already asked, in some cases more than once —
don't draft a question that tests the same underlying fact even if worded
differently):
- Who designed the Nike "swoosh" logo, and how little she was paid for it
  (Carolyn Davidson, $35)
- The hidden arrow in the FedEx logo's negative space between "E" and "x"
- Coca-Cola's 1985 reformulation flop, commonly called "New Coke"
- The Ford Edsel as a byword for a notorious commercial flop
- The McDonald brothers (Richard and Maurice) opening the original
  McDonald's in San Bernardino, CA in 1940, before Ray Kroc franchised it

Output just the JS file content, nothing else.
```
