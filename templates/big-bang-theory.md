## The Big Bang Theory (TV show)

```
You are drafting trivia questions for a multiple-choice trivia app. You have
no access to my codebase — just generate the content below and I'll hand it
to another AI to review, dedupe, and merge into the database myself.

TOPIC: The Big Bang Theory (the TV show, 2007-2019) — characters,
episodes, plot points, and cast.

COUNT: 100 questions.

This category already has hundreds of questions covering all the
well-known plot points and character facts — memory-only drafting has a
very high duplicate rate here. Use web search against a fan wiki (e.g. the
Big Bang Theory Wiki on Fandom) and pull facts from these page types, in
order of yield:
1. Per-episode guest-cast credit lists and minor-character list pages —
   consistently the best-yielding source (obscure actor names for one-off
   characters).
2. Character pages' "Trivia" and "Appearances" sections — dense with
   specific, quiz-able facts that aren't the iconic headline plot beats.
3. Episode summary/plot pages last, and skim rather than mine deeply —
   these are exactly the pages most likely to already be covered.

For each question, actually find the fact via search rather than
recalling it — do not rely on memory alone, especially for obscure
details (guest actor names, minor character info, specific numbers/dates).

If any fact involves a "current record," "most," "latest," or similar
superlative, pin it to a specific time (e.g. "as of 2026") rather than
stating it as a timeless fact, since these claims go stale.

OUTPUT FORMAT: A single JavaScript file, CommonJS style, like this:

module.exports = [
  {
    "difficulty": "easy" | "medium" | "hard",
    "category": "big-bang-theory",
    "question": "What is...?",
    "options": ["Correct answer", "Wrong option 1", "Wrong option 2", "Wrong option 3"],
    "answer": "Correct answer"
  },
  ...
];

Rules for each entry:
- Do NOT include an "id" field — I'll assign that myself.
- Every entry MUST include "category": "big-bang-theory" exactly as written
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
  (guest cast, minor characters, specific numbers, niche details) over
  headline facts.
- Distractor (wrong) options should be plausible, not absurd, and should not
  themselves be true statements about the topic (a wrong answer that's
  secretly also correct elsewhere is a common trivia bug).

Output just the JS file content, nothing else.
```
