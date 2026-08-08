## Sports

```
You are drafting trivia questions for a multiple-choice trivia app. You have no access to my codebase — just generate the content below and I'll hand it to another AI to review, dedupe, and merge into the database myself.

TOPIC: Sports — athletes, teams, rules, records, and major competitions across all sports.

COUNT: 200 questions.

AVOID THESE ANGLES — already well-covered in my question bank, so don't draft facts that overlap with these (pick different, more specific facts instead):
- Which country won the first FIFA World Cup (Uruguay)
- Which country has won the most FIFA World Cup titles (Brazil, 5)
- Which country won the 2022 FIFA World Cup (Argentina)
- Which golf major is always played at Augusta National (The Masters)
- Term for one stroke under par in golf (birdie)
- Men's 100m world record holder/time (Usain Bolt, 9.58 seconds, 2009)
- Which city hosted the 2016 Summer Olympics (Rio de Janeiro)
- Which country has won the most men's ODI Cricket World Cups (Australia)
- Which country has won the most Rugby World Cups (South Africa, 4)
- Muhammad Ali's "float like a butterfly, sting like a bee" phrase
- Who holds the men's Grand Slam singles titles record (Novak Djokovic, 24)
- How many periods in a standard ice hockey game (3)
- How many players per side on a rugby union team on the field (15)
- How many players per team are on the court in indoor volleyball (6) — beach volleyball's 2-per-team is a distinct, still-fair-game fact
- NBA single-game assists record (30, 1990)
- Soccer's penalty-spot-to-goal-line distance (12 yards)
- MLB career no-hitters record (Nolan Ryan, 7)
- NFL longest field goal record (Justin Tucker, 66 yards, 2021)
- NFL career receiving touchdowns record (Jerry Rice)
- The Open Championship as the oldest golf major (first played 1860)
- Most UEFA Champions League titles (Real Madrid, 15)
- Women's 100m world record (Florence Griffith-Joyner, 10.49 seconds)
- Which country has won the most Winter Olympic medals overall (Norway) — distinct from most Winter Olympic GOLD medals, which is also Norway and also already covered
- Note: an inbox draft was received truncated mid-file on 2026-08-06 (only 129 of a planned ~200 entries survived) — if this template is re-run, the missing back half of that batch was never drafted and its topics are unknown, so don't assume anything beyond what's listed above is covered

Use web search to verify every fact — do not rely on memory alone. Prefer authoritative sources (official league/federation sites, sports reference databases) over guessing. For each question, actually find the fact via search rather than recalling it, especially for obscure details (specific records, lesser-known athletes/events).

If any fact involves a "current record," "most," "latest," or similar superlative, pin it to a specific time (e.g. "as of 2026") rather than stating it as a timeless fact, since these claims go stale.

OUTPUT FORMAT: A single JavaScript file, CommonJS style, like this:

module.exports = [
  {
    "difficulty": "easy" | "medium" | "hard",
    "category": "sports",
    "question": "What is...?",
    "options": ["Correct answer", "Wrong option 1", "Wrong option 2", "Wrong option 3"],
    "answer": "Correct answer"
  },
  ...
];

Rules for each entry:
- Do NOT include an "id" field — I'll assign that myself.
- Every entry MUST include "category": "sports" exactly as written (all lowercase, with the hyphen) — don't vary it, translate it, or use the topic name instead.
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
