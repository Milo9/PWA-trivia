## Sports

```
You are drafting trivia questions for a multiple-choice trivia app. You have no access to my codebase — just generate the content below and I'll hand it to another AI to review, dedupe, and merge into the database myself.

TOPIC: Sports — athletes, teams, rules, terminology, and major competitions across all sports, for a casual/general audience (see the hard rule below).

COUNT: 200 questions.

CASUAL-AUDIENCE RULE (hard requirement, overrides anything below that conflicts with it): This
category is for people who do NOT follow sports — assume no fandom-level knowledge at all, just
whatever an average adult has absorbed from general life (school, news, watching some Olympics on
TV). Every question must be a fair guess for that person, not just for a fan.

This means, specifically:
- NO record-holder or stat-recall questions — no "who holds the record for...", no "how many
  career/season X does player Y have", no "as of 20XX, who/which..." framing tied to an evolving
  ranking, and no country/team title-count tallies ("which country/club has won the most X").
  This applies even to record facts that feel famous to a fan — if the question's answer is a
  number or name you'd only know from following the sport, it's out, full stop.
- NO draft-pick, roster, trade, jersey-number, or nickname trivia about individual players.
- NO exact rule-spec measurements or numbers (equipment dimensions/weights, court/field/course
  distances, technical rule thresholds, penalty specifics) beyond a small set of universally known
  ones (18 holes in golf, 9 innings in baseball, 4 quarters, that kind of thing).
- NO obscure "first to do X" / "only player to do X" historical trivia — these land as impressive
  to a fan and meaningless to everyone else.
- DO favor: basic rules and scoring, equipment/terminology ("what do you call..."), which sport a
  given term belongs to, major/memorable event outcomes (a recent World Cup winner, an Olympic host
  city), and facts about the handful of athletes so famous they've crossed into general pop culture
  (Muhammad Ali, Michael Jordan, Michael Phelps, Usain Bolt, Pelé) — people a non-fan has heard of
  because of how famous they are, not because of a specific stat tied to their name.
- The test: would someone who has never watched a game of this sport, but reads the news and caught
  some Olympics as a kid, have a real shot at this? If the honest answer is "only if you follow this
  sport," cut it, however impressive or well-verified the fact is.

AVOID THESE ANGLES — already well-covered in my question bank, so don't draft facts that overlap
with these (pick different facts instead, but still within the casual-audience rule above — don't
reach for a more obscure version of the same angle):
- Which country won the first FIFA World Cup (Uruguay)
- Which country won the 2022 FIFA World Cup (Argentina)
- Which golf major is always played at Augusta National (The Masters)
- Term for one stroke under par in golf (birdie)
- Which city hosted the 2016 Summer Olympics (Rio de Janeiro)
- Muhammad Ali's "float like a butterfly, sting like a bee" phrase
- How many periods in a standard ice hockey game (3)
- How many players per side on a rugby union team on the field (15)
- How many players per team are on the court in indoor volleyball (6), and beach volleyball (2)
- Note: an inbox draft was received truncated mid-file on 2026-08-06 (only 129 of a planned ~200 entries survived) — if this template is re-run, the missing back half of that batch was never drafted and its topics are unknown, so don't assume anything beyond what's listed above is covered
- Note: a 2026-09-01 audit cut 338 of 598 existing sports questions for violating the casual-audience
  rule above (record-holder/stat-recall, draft/nickname trivia, rule-spec measurements, obscure
  "firsts"). That's why this list is much shorter than the question count would suggest — the
  removed facts aren't "already covered," they're facts this category should never have had, so
  don't avoid them as duplicates, avoid them as the wrong kind of question per the rule above.

Use web search to verify every fact — do not rely on memory alone. Prefer authoritative sources
(official league/federation sites, general reference sources) over guessing.

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
- Avoid exact-duplicate chestnuts already listed above, but do NOT chase lesser-known facts as a way to avoid repetition — per the casual-audience rule above, more obscure is the wrong direction for this category. Prefer a different broadly-accessible fact over a more specific/obscure one.
- Distractor (wrong) options should be plausible, not absurd, and should not themselves be true statements about the topic (a wrong answer that's secretly also correct elsewhere is a common trivia bug).

Output just the JS file content, nothing else.
```
