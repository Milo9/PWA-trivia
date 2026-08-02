## Geography

```
You are drafting trivia questions for a multiple-choice trivia app. You have
no access to my codebase — just generate the content below and I'll hand it
to another AI to review, dedupe, and merge into the database myself.

TOPIC: Geography — countries, capitals, physical geography, borders, and
related facts.

COUNT: 100 questions.

AVOID THESE ANGLES — already well-covered in my question bank, so don't
draft facts that overlap with these (pick different, more specific facts
instead):
- Capital-city lookups for major/well-known countries (China, Germany,
  Brazil, Egypt, Australia, Spain, Russia, India, Canada, France, Italy,
  Bhutan, Japan, Mongolia, etc.) — near-guaranteed collision territory,
  favor capitals of less-common countries instead
- Largest continent by land area (Asia)
- Country with the longest coastline (Canada)
- Country home to the Great Barrier Reef (Australia)
- Largest ocean (Pacific)
- Tallest mountain in Africa (Kilimanjaro)
- Smallest country in the world by land area (Vatican City)
- Tallest building in the world, time-pinned (Burj Khalifa)
- Country known as "Land of the Rising Sun" (Japan)
- Longest river in the world (Nile)
- Japan's official currency (Yen)
- Andes as the world's longest (continental) mountain range
- Angel Falls as the world's highest waterfall
- Sahara as the world's largest hot desert / Antarctic Desert as the
  world's largest desert overall
- US/Canada as the longest international land border
- Greenland as the world's largest island
- Highest mountain on each continent by name (Aconcagua for South
  America, Denali for North America — these specifically, not just
  Everest/Kilimanjaro)
- Volga as the longest river in Europe
- Liechtenstein and Uzbekistan as the world's only two "doubly
  landlocked" countries
- Kazakhstan as the world's largest landlocked country
- Lesotho as the enclave/landlocked country entirely surrounded by
  South Africa
- Turkey straddling Europe and Asia across the Bosphorus
- Sweden having the most islands of any country
- France having the most time zones (due to overseas territories)
- Which African country is smallest by land area (Seychelles)
- Strait of Gibraltar separating Europe from Africa
- Bering Strait separating Asia from North America
- Suez Canal connecting the Mediterranean and Red Seas
- Tanzania's official capital being Dodoma (not Dar es Salaam)
- Yangtze as the longest river entirely within a single country/China
- Indonesia having the most active volcanoes of any country
- Sicily as the largest island in the Mediterranean
- São Tomé and Príncipe's capital
- Capitals of Comoros, Palau, Tuvalu, Kiribati, Vanuatu, Micronesia,
  Marshall Islands, Solomon Islands, Timor-Leste, Cape Verde, Belize,
  and Bolivia's constitutional capital (Sucre) — now covered
- The executive/official capital of Eswatini (Mbabane), Côte d'Ivoire
  (Yamoussoukro), and Benin (Porto-Novo), in either "what is X's capital"
  or "which city serves as X's capital" framing
- Myanmar's 2005 capital move to Naypyidaw
- South Africa's three capital cities
- Netherlands' constitutional capital (Amsterdam) vs. actual seat of
  government (The Hague) — already asked with The Hague as a distractor
- Deepest lake in the world (Lake Baikal), largest lake by surface area
  (Caspian Sea), largest freshwater lake by surface area (Lake Superior)
- Lowest point on Earth's land surface (shores of the Dead Sea)
- Challenger Deep / Mariana Trench as the ocean's deepest point
- Mauna Kea as the tallest mountain measured base-to-summit
- Amazon River's discharge volume (largest by volume)
- Gobi Desert spanning China and Mongolia
- Arabian Peninsula as the world's largest peninsula
- Ural Mountains as the Europe/Asia boundary (already asked 3+ times)
- K2's location in the Karakoram range
- Great Rift Valley's continent (Africa)
- Most populous country in Africa (Nigeria)
- Iguazu Falls on the Argentina/Brazil border
- Victoria Falls on the Zambia/Zimbabwe border
- Strait of Malacca lying between Sumatra/Indonesia and Malaysia
- Colorado River carving the Grand Canyon (either direction)
- Pyrenees as the France/Spain border (already asked 2+ times)
- San Marino as an enclave surrounded by Italy (either direction: "which
  country surrounds San Marino" or "which microstate is surrounded by
  Italy")
- Rio Grande forming part of the US/Mexico border

Also watch for a flag-shape trap: a drafted question claimed Vatican
City is "the only country other than Nepal" with a non-rectangular
flag, and a companion question claimed Nepal is "one of only two"
non-rectangular flags — both wrong. Switzerland's flag is also square
(non-oblong), so there are three unusual flags (Nepal, Switzerland,
Vatican City), not two, and which ones count as "non-rectangular"
depends on a contested definition (a square is technically still a
rectangle). Cut rather than draft this angle unless you can phrase it
without an "only X" claim.

Also watch for two specific ambiguous-superlative traps, confirmed via
web search while auditing a batch: (1) "highest capital city" — La Paz
is the mainstream-cited answer (world's highest national capital,
~3,640m); Quito (~2,850m) is only "highest" under a technical framing
that discounts La Paz for not being Bolivia's constitutional capital —
don't draft either without checking what's already in the corpus for
this exact fact. (2) "driest place on Earth" — McMurdo Dry Valleys
(Antarctica) is the actual driest place with zero recorded
precipitation in parts; the Atacama Desert is more precisely "the
driest non-polar desert." If drafting either, phrase precisely enough
to not contradict the other.

Use web search to verify every fact — do not rely on memory alone. Prefer
authoritative sources (reference databases, almanacs) over guessing. For
each question, actually find the fact via search rather than recalling it,
especially for obscure details (specific numbers, lesser-known places).

If any fact involves a "current record," "most," "latest," or similar
superlative, pin it to a specific time (e.g. "as of 2026") rather than
stating it as a timeless fact, since these claims go stale.

OUTPUT FORMAT: A single JavaScript file, CommonJS style, like this:

module.exports = [
  {
    "difficulty": "easy" | "medium" | "hard",
    "category": "geography",
    "question": "What is...?",
    "options": ["Correct answer", "Wrong option 1", "Wrong option 2", "Wrong option 3"],
    "answer": "Correct answer"
  },
  ...
];

Rules for each entry:
- Do NOT include an "id" field — I'll assign that myself.
- Every entry MUST include "category": "geography" exactly as written
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
  over headline facts.
- Distractor (wrong) options should be plausible, not absurd, and should not
  themselves be true statements about the topic (a wrong answer that's
  secretly also correct elsewhere is a common trivia bug).

Output just the JS file content, nothing else.
```
