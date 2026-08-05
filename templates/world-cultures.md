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
- Songkran, Thailand's water-splashing New Year festival
- Injera, the Ethiopian/Eritrean sour flatbread made from teff
- Kimchi as Korea's national fermented (napa cabbage) side dish
- Norway's Constitution Day (17 May) and its bunad folk costumes
- The Mexican piñata (decorated container filled with candy, broken at celebrations)
- Welsh "ll" representing a voiceless lateral fricative sound
- The yukata as a casual/light cotton summer garment (vs. a formal kimono)
- Basque being a language isolate with no known living relatives
- Quechua as an official language of Peru and Bolivia
- The genkan, the lowered entryway in a Japanese home where shoes are removed
- Sticking chopsticks upright in rice being taboo (resembles funeral incense)
- Setsubun's roasted soybeans thrown to drive out evil spirits
- El Colacho, the Spanish baby-jumping ritual in Castrillo de Murcia
- Inti Raymi (Inca Festival of the Sun) held in Cusco, Peru on June 24
- Hanami, the Japanese custom of viewing cherry blossoms
- La Tomatina being held in the Spanish town of Buñol
- The Wife Carrying World Championships in Sonkajärvi, Finland (prize: the wife's weight in beer)
- The Maasai adumu jumping dance being performed by young male warriors (morani)
- Inuit katajjaq throat singing as a face-to-face duet contest between two women
- French "la bise" cheek-kissing, and that the number of kisses varies by region
- The Māori hongi greeting (pressing noses/foreheads together)
- Swedish fika (coffee-and-pastry social break)
- The Turkish Nazar Boncuğu blue glass bead warding off the evil eye
- Doljabi, the object-picking ritual at a Korean baby's first birthday (doljanchi)
- Omiyage, Japanese souvenir gifts brought back for coworkers/family
- The kotatsu, a low heated table with a blanket in Japanese homes
- The Thai "wai" greeting (palms pressed together, bow)
- Wearing orange on King's Day (Koningsdag) in the Netherlands
- Hogmanay first-footing gifts of coal and whisky in Scotland
- Smashing porcelain/ceramics the night before a wedding at a German Polterabend
- The fève (charm) hidden inside a French Galette des Rois
- The ceilidh as a Scottish/Irish social gathering with folk music and dancing
- Navajo hogan doorways traditionally facing east
- Hangul being commissioned by King Sejong the Great and promulgated in 1443
- Braille being invented in 1824 by a young blind French student (Louis Braille)
- The Cherokee syllabary invented by Sequoyah
- Xhosa's click consonants represented by the letters c, q, and x
- Maltese as the only Semitic language with EU official status
- Rotokas (Bougainville) as one of the smallest alphabets, ~12 letters
- Chiang Mai as the city most associated with Thailand's Yi Peng sky lantern festival
- Up Helly Aa in Lerwick, Shetland ending with burning a replica Viking galley
- Japan's Hadaka Matsuri ("Naked Festival") at Saidaiji Temple, Okayama — men in loincloths (fundoshi) competing for lucky sticks
- Oktoberfest being hosted in Munich, Germany
- The Kanamara Matsuri in Kawasaki celebrating a steel phallus/fertility symbol
- The Zulu greeting "Sawubona" literally meaning "I see you"
- The Filipino "mano" gesture (pressing an elder's hand to your forehead)
- Songpyeon, the half-moon rice cakes made for Korea's Chuseok harvest festival
- Bon Odori, the folk dance performed around a yagura tower at Japan's Obon festival
- Löyly, the Finnish word for steam created by throwing water on hot sauna stones
- Swahili "safari" originally meaning "journey"
- Yiddish traditionally being written in Hebrew script
- Moroccan mint tea being poured from a height to create foam/cool it
- Origami as the Japanese art of paper folding
- Jebena, the narrow-spouted clay pot used in Ethiopia's coffee ceremony
- Finnish having no grammatical gender (the pronoun "hän" means both "he" and "she")
- The right hand being preferred for eating/greeting in Middle Eastern/South Asian cultures (left hand considered unclean) — covered via both an India-specific framing and a broader regional framing
- Hanbok as traditional Korean dress
- Dancing around a maypole at Swedish Midsummer
- The three scripts of Japanese writing: hiragana, katakana, and kanji
- Amharic being written in Ge'ez script
- Hungarian belonging to the Uralic language family (like Finnish)
- Portuguese being Brazil's official/primary language
- Mehndi, the henna hand designs used in South Asian celebrations
- Namaste, the Indian greeting made by pressing palms together
- The cherry blossom as Japan's national flower, associated with transience
- Hongbao, the red envelopes of money given during Chinese New Year

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
