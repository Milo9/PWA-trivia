## History

```
You are drafting trivia questions for a multiple-choice trivia app. You have no access to my codebase — just generate the content below and I'll hand it to another AI to review, dedupe, and merge into the database myself.

TOPIC: History — world historical events, figures, and dates. Not mythology or religious history — that's a separate category.

COUNT: 100 questions.

AVOID THESE ANGLES — already well-covered in my question bank, so don't draft facts that overlap with these (pick different, more specific facts instead):
- Year of the Great Fire of London (1666)
- Year the French Revolution began (1789)
- Year the Suez Canal opened (1869)
- Year WWI began / WWII ended (1914 / 1945)
- Year the Berlin Wall fell (1989)
- Who was the first US President (George Washington)
- Which country gifted the Statue of Liberty to the US (France)
- First woman to fly solo across the Atlantic (Amelia Earhart)
- Name of the first artificial Earth satellite (Sputnik 1)
- Which Chinese dynasty built most of the Great Wall as it stands today (Ming)
- First Holy Roman Emperor, crowned 800 AD (Charlemagne)
- What conflict the 1648 Peace/Treaty of Westphalia ended (Thirty Years' War)
- Who led the Haitian Revolution against French colonial rule (Toussaint Louverture)
- 1415 battle where English longbowmen beat a larger French army (Agincourt)
- What modern country the ancient city of Carthage is located in (Tunisia)
- Which philosopher, a student of Plato, tutored Alexander the Great (Aristotle)
- Explorer who led the first circumnavigation of the globe but died in the Philippines partway through (Ferdinand Magellan) — already asked 4+ times in the corpus under near-identical phrasing; don't add another
- Which Seven Wonders of the Ancient World structure was a lighthouse in Alexandria, Egypt (Lighthouse of Alexandria / Pharos)
- What modern country the ancient rock-cut city of Petra is located in (Jordan)
- Which Chinese emperor the Terracotta Army was built to guard (Qin Shi Huang)
- Female 18th-dynasty Egyptian pharaoh who wore a false beard and took full royal powers (Hatshepsut)
- Which ancient Mesopotamian civilization developed cuneiform (Sumerians)
- Who is credited with inventing the movable-type printing press in Europe around 1440 (Johannes Gutenberg) — already asked 3+ times in the corpus
- Which Inca emperor was captured by Pizarro / was the last sovereign Inca emperor (Atahualpa) — already covered via the "last emperor" framing
- Ship that carried the Pilgrims to North America in 1620 (Mayflower)
- Code name for the Allied invasion of Normandy, June 1944 (Operation Overlord)
- Who was the first Roman Emperor (Augustus)
- Which Civil War battle was the turning point (Gettysburg)
- First female UK Prime Minister (Margaret Thatcher)
- Year India gained independence from Britain (1947)
- Who founded the Mongol Empire (Genghis Khan)
- First President of South Africa after apartheid ended (Nelson Mandela)
- Which 1919 treaty ended WWI / the state of war with Germany (Treaty of Versailles)
- Greek city-state renowned for its military culture (Sparta)
- First woman to win a Nobel Prize (Marie Curie)
- Last imperial dynasty of China (Qing)
- Year of the stock market crash that triggered the Great Depression (1929)
- First European explorer to reach India by sea around Africa (Vasco da Gama) — already asked 3+ times in the corpus
- Code name for the US atomic bomb program (Manhattan Project)
- Only/first US President to resign from office (Nixon, 1974)
- First dynasty to unify China (Qin)
- First female PM of a Muslim-majority country (Benazir Bhutto, Pakistan 1988)
- Last Tsar of Russia, executed 1918 (Nicholas II)
- First woman in space / first female cosmonaut (Valentina Tereshkova, Vostok 6, 1963)
- First person to walk on the Moon (Neil Armstrong) — already asked 3+ times in the corpus

CAUTION — "first US President born in a log cabin" is commonly misattributed to Lincoln; Andrew Jackson was actually first (Jackson born 1767, decades before Lincoln). "The only US President to serve non-consecutive terms" (Grover Cleveland) stopped being true in 2025 when Donald Trump became the second — phrase any similar claim as "first," not "only," or pin it to a date.

CAUTION — fill-in-the-blank style ("...located in present-day...", "was chartered in...") doesn't match this app's format; every existing question in the corpus is phrased as a direct interrogative ending in "?". Write full questions, not sentence fragments trailing into an answer.

Use web search to verify every fact — do not rely on memory alone. Prefer authoritative sources (encyclopedic references, history databases) over guessing. For each question, actually find the fact via search rather than recalling it, especially for obscure details (specific numbers, dates, minor figures).

If any fact involves a "current record," "most," "latest," or similar superlative, pin it to a specific time (e.g. "as of 2026") rather than stating it as a timeless fact, since these claims go stale.

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
- Every entry MUST include "category": "history" exactly as written (all lowercase, with the hyphen) — don't vary it, translate it, or use the topic name instead.
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
