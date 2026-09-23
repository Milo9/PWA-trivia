## Catchphrases

```
You are drafting trivia questions for a multiple-choice trivia app. You have no access to my codebase — just generate the content below and I'll hand it to another AI to review, dedupe, and merge into the database myself.

TOPIC: Catchphrases — famous recurring lines and signature phrases, and who says them or where they come from: TV sitcom and drama characters, cartoon characters, movie characters, game show hosts, talk/late-night hosts, sportscasters, pro wrestlers, comedians, radio personalities, reality TV, video game characters, and famous real-world figures. Typical shapes: "Which character's catchphrase is 'X'?", "Which show made the phrase 'X' famous?", "What is [character]'s signature catchphrase?", "Which game show host signs off with 'X'?". Pitch the questions at a casual, general-audience level — a phrase most adults would recognize, even if they need to think about who said it.

DO NOT INCLUDE:
- Advertising slogans or brand mascot taglines — a separate Business & Brands category covers those.
- Anything from Friends or The Big Bang Theory — both have their own dedicated categories.
- Song lyrics, book opening lines, or poem lines — those belong to Music and Arts & Literature.

COUNT: 200 questions.

AVOID THESE ANGLES — already well-covered in my question bank, so don't draft facts that overlap with these (pick different, more specific facts instead):
- Famous movie lines already asked in other categories: "I'll be back" (Terminator), Darth Vader's actual "No, I am your father" line, "You talkin' to me?" (Taxi Driver), "Do you like scary movies?" (Scream), "I'm sorry, Dave" (HAL / 2001), "Anyone can cook" (Ratatouille), Rosebud (Citizen Kane), "Here's looking at you, kid", "Frankly, my dear", "Life is like a box of chocolates", "I see dead people", "To infinity and beyond", "You're gonna need a bigger boat"
- "Hakuna matata" meaning; Home Alone's fake gangster movie (Angels with Filthy Souls); Cast Away's volleyball Wilson
- Arrested Development "always money in the banana stand"; Parks and Recreation "Treat Yo' Self"; Muhammad Ali "float like a butterfly"
- Anything already in the Catchphrases category's first 502-question batch (sitcoms, cartoons, SNL, game show hosts, sportscasters, wrestlers, video games) — favor less-famous shows, non-US TV, radio, and older (pre-1970) or very recent (2020s) sources

Watch for questions whose premise gives away the answer: don't write "What is Homer Simpson's catchphrase?" with an option set where only one option sounds like something Homer would say, and don't name the show in the stem when the show is the answer.

Verify every attribution — misattributed catchphrases are common (a phrase popularized by one show but first said somewhere else, or a line people "remember" that was never actually said on screen). If a famous line is a misquote, either ask about the misquote explicitly as a misquote or skip it.

OUTPUT FORMAT: A single JavaScript file, CommonJS style, like this:

module.exports = [
  {
    "difficulty": "easy" | "medium" | "hard",
    "category": "catchphrases",
    "question": "Which character's catchphrase is...?",
    "options": ["Correct answer", "Wrong option 1", "Wrong option 2", "Wrong option 3"],
    "answer": "Correct answer"
  },
  ...
];

Rules for each entry:
- Do NOT include an "id" field — I'll assign that myself.
- Every entry MUST include "category": "catchphrases" exactly as written (all lowercase, one word) — don't vary it, translate it, or use the topic name instead.
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
