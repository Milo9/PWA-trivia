## TV Show Catchphrases

```
You are drafting trivia questions for a multiple-choice trivia app. You have no access to my codebase — just generate the content below and I'll hand it to another AI to review, dedupe, and merge into the database myself.

TOPIC: TV Show Catchphrases — the player is shown a famous TV catchphrase, recurring line, or theme-song lyric and must pick the TV SHOW it comes from. The answer and all four options are always TV show titles — never a character, actor, or host. Sources: sitcoms, dramas, sci-fi, cartoons (adult and kids'), preschool shows, game shows, reality TV, talk shows, cooking/how-to shows, sketch comedy, and sports/news broadcasts. Pitch it at a casual, general-audience (mostly American) level: a line most adults would recognize, even if they need to think about which show it's from.

QUESTION FORMAT — use exactly one of these two stems, nothing else:
- Which TV show is "QUOTE" from?
- Which TV show's theme song includes the line "QUOTE"?

DO NOT INCLUDE:
- Advertising slogans or brand mascot taglines.
- Movie lines (only TV).
- Any quote containing a distinctive word from the show's own title (e.g. "Scooby-Dooby-Doo!", "Go Go Power Rangers", "Smarter than the average bear" for Yogi Bear) — that gives the answer away.
- Phrases used on more than one show (e.g. "Cool cool cool" is said on both Community and Brooklyn Nine-Nine; Gordon Ramsay's lines span several of his shows). Skip these entirely.

COUNT: 200 questions.

AVOID THESE ANGLES — already in my question bank:
- The first 500 cover the best-known catchphrases of: Seinfeld, Friends, The Simpsons, The Office, Parks and Recreation, How I Met Your Mother, Arrested Development, Brooklyn Nine-Nine, Full House, Happy Days, Game of Thrones, Breaking Bad, Star Trek, SpongeBob, Looney Tunes, South Park, Family Guy, Futurama, SNL, Monty Python, and the classic game shows (Price Is Right, Wheel, Jeopardy!, Family Feud, Millionaire). Favor shows not on this list, or clearly second-tier lines from shows on it.
- Most British catchphrases were deliberately left out as too obscure for this household — include one only if it's widely known in the US.

Verify every attribution — misattributed catchphrases are common (e.g. "Beam me up, Scotty" and "Just the facts, ma'am" were never said verbatim on screen). If a famous line is a misquote, skip it.

OUTPUT FORMAT: A single JavaScript file, CommonJS style, like this:

module.exports = [
  {
    "difficulty": "easy" | "medium" | "hard",
    "category": "tv-catchphrases",
    "question": "Which TV show is \"...\" from?",
    "options": ["Correct show", "Wrong show 1", "Wrong show 2", "Wrong show 3"],
    "answer": "Correct show"
  },
  ...
];

Rules for each entry:
- Do NOT include an "id" field — I'll assign that myself.
- Every entry MUST include "category": "tv-catchphrases" exactly as written.
- Exactly 4 options, all real TV show titles from a similar era/genre as the answer (a 1970s sitcom's distractors are other 1970s sitcoms; a cartoon's are other cartoons), all distinct.
- Never use a spinoff, parent show, or show sharing characters with the answer as a distractor (e.g. Cheers/Frasier, Happy Days/Mork & Mindy, Family Guy/American Dad!).
- "answer" must be an exact string match to one of the 4 "options".
- Vary the correct answer's position across questions.
- Write "…" (the single Unicode character) rather than three periods for a trailing-off quote.
- Do NOT use hedge or meta answers as options ("None of the above," etc.).

Output just the JS file content, nothing else.
```
