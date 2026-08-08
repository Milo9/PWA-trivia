## Mythology & Religion

```
You are drafting trivia questions for a multiple-choice trivia app. You have no access to my codebase — just generate the content below and I'll hand it to another AI to review, dedupe, and merge into the database myself.

TOPIC: Mythology & Religion — gods, myths, and legends from any culture (Greek, Norse, Egyptian, Hindu, etc.), plus world religions, their figures, texts, and practices.

COUNT: 200 questions.

AVOID THESE ANGLES — already well-covered in my question bank, so don't draft facts that overlap with these (pick different, more specific facts instead):
- Name of Thor's hammer in Norse mythology (Mjölnir)
- Icarus flying too close to the sun on wax-and-feather wings
- Egyptian sun god depicted with a falcon head (Ra); Egyptian god of wisdom/writing/moon with an ibis head (Thoth)
- Which bodhisattva/goddess is Avalokiteshvara/Guanyin — this equivalence fact gets tested from both the Sanskrit-name and Chinese-name direction, treat as a closed pair (the "1,000 arms" iconography detail is still a distinct, open fact)
- Islamic month of fasting from dawn to sunset (Ramadan) — including the "precedes Shawwal" phrasing, same fact
- Which Greek goddess sprang fully armed from Zeus's head (Athena)
- Christian holiday commemorating the resurrection of Jesus (Easter)
- Which Yoruba orisha is the trickster/messenger — avoid phrasing this as "syncretized with Eshu" while the answer IS Eshu, that's self-contradictory
- Odin's hall Valhalla having 540 doors — don't frame this as "name of Odin's hall in Valhalla," Valhalla IS the hall, not a container of another hall
- Sisyphus condemned to roll a boulder uphill forever in Tartarus
- Which Titaness is the mother of Helios, Selene, and Eos (Theia)
- Name of Odin's eight-legged horse (Sleipnir)
- Name of Odin's spear that never misses its target (Gungnir)
- Which Japanese thunder god is paired with wind god Fujin (Raijin)
- Which Roman god is the equivalent of Greek Zeus (Jupiter)
- Which Aztec feathered serpent god is associated with wind/learning (Quetzalcoatl)
- Which Inca sun god is ancestor of the Sapa Inca emperors (Inti)
- Islamic Night of Power when the Quran was first revealed (Laylat al-Qadr)

Use web search to verify every fact — do not rely on memory alone. Prefer authoritative sources (encyclopedic sources, religious/mythological references) over guessing. For each question, actually find the fact via search rather than recalling it, especially for obscure details (lesser- known figures, specific texts).

If any fact involves a "current record," "most," "latest," or similar superlative, pin it to a specific time (e.g. "as of 2026") rather than stating it as a timeless fact, since these claims go stale.

OUTPUT FORMAT: A single JavaScript file, CommonJS style, like this:

module.exports = [
  {
    "difficulty": "easy" | "medium" | "hard",
    "category": "mythology-religion",
    "question": "What is...?",
    "options": ["Correct answer", "Wrong option 1", "Wrong option 2", "Wrong option 3"],
    "answer": "Correct answer"
  },
  ...
];

Rules for each entry:
- Do NOT include an "id" field — I'll assign that myself.
- Every entry MUST include "category": "mythology-religion" exactly as written (all lowercase, with the hyphen) — don't vary it, translate it, or use the topic name instead.
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
