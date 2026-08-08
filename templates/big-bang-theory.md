## The Big Bang Theory (TV show)

```
You are drafting trivia questions for a multiple-choice trivia app. You have no access to my codebase — just generate the content below and I'll hand it to another AI to review, dedupe, and merge into the database myself.

TOPIC: The Big Bang Theory (the TV show, 2007-2019) — characters, episodes, plot points, and cast.

COUNT: 200 questions.

This category already has hundreds of questions covering all the well-known plot points and character facts — memory-only drafting has a very high duplicate rate here. Use web search against a fan wiki (e.g. the Big Bang Theory Wiki on Fandom) and pull facts from these page types, in order of yield:
1. Per-episode guest-cast credit lists and minor-character list pages — consistently the best-yielding source (obscure actor names for one-off characters).
2. Character pages' "Trivia" and "Appearances" sections — dense with specific, quiz-able facts that aren't the iconic headline plot beats.
3. Episode summary/plot pages last, and skim rather than mine deeply — these are exactly the pages most likely to already be covered.

AVOID THESE ANGLES — already well-covered in my question bank, so don't draft facts that overlap with these (pick different, more specific facts instead):
- Who played Trevor, the guy who cut in line in front of Sheldon at the movies (Blake Anderson)
- Who played Lizzy, the girl Penny set Raj up with (Morgan Hewitt)
- Who played Justin, a student at Howard's old middle school (Dawson Fletcher)
- Who played Joy, Leonard's loud blind date in The Desperation Emanation (Charlotte Newhouse)
- Who played Lalita Gupta, Raj's arranged date from The Grasshopper Experiment (Sarayu Blue)
- Who played Santa in The Clean Room Infiltration / The Santa Simulation (Dakin Matthews)
- Who played Mr. Fowler, Amy's father, the silent magician (Teller)
- Sheldon Cooper's stated IQ (187)
- What is Sheldon's middle name (Lee)
- What breed is Raj's dog Cinnamon (Yorkshire Terrier)
- Who played FBI Agent Angela Page in The Apology Insufficiency (Eliza Dushku)
- Who played Mikayla, the prostitute in The Vegas Renormalization (Jodi Lyn O'Keefe)
- Who played Glenn, Bernadette's muscular ex-boyfriend (Rick Fox)
- Who played Raj's mother / Priya's mother, Mrs. Koothrappali — same person, treat as a closed pair (Alice Amter)
- What is Raj's sister's name who briefly dates Leonard (Priya)
- What is Sheldon's twin sister's name (Missy Cooper)
- What is Sheldon's father's name (George Cooper Sr.)
- Who officiated Sheldon and Amy's wedding (Mark Hamill)
- Who played Kurt, Penny's tall ex-boyfriend from Season 1 (Brian Patrick Wade)
- What is Howard's middle name (Joel)
- Howard's astronaut nickname given by Mike Massimino (Froot Loops)
- Don't frame the "Meemaw"/"Memaw" spelling as if they're two different answers to "what does Sheldon call his grandmother" — same word, ambiguous distractor
- Don't use "Halley" vs. "Haley"/"Halle" spelling variants as distractors for Bernadette and Howard's daughter's name

For each question, actually find the fact via search rather than recalling it — do not rely on memory alone, especially for obscure details (guest actor names, minor character info, specific numbers/dates).

If any fact involves a "current record," "most," "latest," or similar superlative, pin it to a specific time (e.g. "as of 2026") rather than stating it as a timeless fact, since these claims go stale.

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
- Every entry MUST include "category": "big-bang-theory" exactly as written (all lowercase, with the hyphen) — don't vary it, translate it, or use the topic name instead.
- Exactly 4 options, all non-empty, all distinct from each other.
- "answer" must be an exact string match (character-for-character) to one of the 4 "options".
- The correct answer's position in the options array should be varied/randomized across questions — don't always put it first or in the same slot.
- "question" must not leak the answer in the question text itself (e.g. don't write "What type of animal is Geppetto's cat?" if the answer is "cat").
- Options should be short answer phrases, not full sentences.
- Do NOT use hedge or meta answers as options (e.g. "This isn't a real plot point," "None of the above," "It's unclear") — every option should be a real, specific, plausible-sounding answer.
- Avoid the most well-known/obvious trivia chestnuts for this topic if possible — I likely already have those. Favor specific, lesser-known facts (guest cast, minor characters, specific numbers, niche details) over headline facts.
- Distractor (wrong) options should be plausible, not absurd, and should not themselves be true statements about the topic (a wrong answer that's secretly also correct elsewhere is a common trivia bug).

Output just the JS file content, nothing else.
```
