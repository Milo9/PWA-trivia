## World Cultures & Languages

```
You are drafting trivia questions for a multiple-choice trivia app. You have no access to my codebase — just generate the content below and I'll hand it to another AI to review, dedupe, and merge into the database myself.

TOPIC: World Cultures & Languages — customs, traditions, festivals, languages, and everyday life across different cultures. Not history/dates (separate category) and not mythology/religion (separate category).

COUNT: 100 questions.

AVOID THESE ANGLES — already well-covered in my question bank, so don't draft facts that overlap with these (pick different, more specific facts instead):
- The Nahuatl-derived name for the marigold flower used on Mexican Day of the Dead altars (Cempasúchil)
- Which country/region the Ainu people traditionally inhabit (Hokkaido, Japan) — covered in either "which country is home to the Ainu" or "which region do the Ainu inhabit" framing
- Diwali as "the Hindu festival of lights" (already asked 3+ times)
- Which country's rugby team performs the haka before matches (New Zealand) — a different fact from the haka's modern ceremonial uses (weddings/funerals/welcoming guests), which is NOT yet covered
- The Running of the Bulls in Pamplona, Spain

Use web search to verify every fact — do not rely on memory alone. Prefer authoritative sources (encyclopedic sources, cultural references) over guessing. For each question, actually find the fact via search rather than recalling it, especially for obscure details (lesser-known customs, specific terms).

If any fact involves a "current record," "most," "latest," or similar superlative, pin it to a specific time (e.g. "as of 2026") rather than stating it as a timeless fact, since these claims go stale.

OUTPUT FORMAT: A single JavaScript file, CommonJS style, like this:

module.exports = [
  {
    "difficulty": "easy" | "medium" | "hard",
    "category": "world-cultures",
    "question": "What is...?",
    "options": ["Correct answer", "Wrong option 1", "Wrong option 2", "Wrong option 3"],
    "answer": "Correct answer"
  },
  ...
];

Rules for each entry:
- Do NOT include an "id" field — I'll assign that myself.
- Every entry MUST include "category": "world-cultures" exactly as written (all lowercase, with the hyphen) — don't vary it, translate it, or use the topic name instead.
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
