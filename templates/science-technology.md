## Science & Technology

```
You are drafting trivia questions for a multiple-choice trivia app. You have no access to my codebase — just generate the content below and I'll hand it to another AI to review, dedupe, and merge into the database myself.

TOPIC: Science & Technology — physics, chemistry, biology, human anatomy, computing, engineering, inventions. Not astronomy/space (separate category) and not animals/plants in the wild (separate category).

COUNT: 100 questions.

AVOID THESE ANGLES — already well-covered in my question bank, so don't draft facts that overlap with these (pick different, more specific facts instead):
- Chemical symbol for tungsten (W)
- Earth's atmosphere composition (~78% nitrogen)
- Number of bones in the adult human body (206)
- Hardest naturally occurring substance (diamond)
- Who invented the World Wide Web (Tim Berners-Lee)
- SI unit of electrical resistance (ohm)
- Chemical symbol for potassium (K)
- Subatomic particle with no electric charge (neutron)
- Chemical symbol lookups for common elements (silver/Ag, gold/Au, copper/Cu, iron/Fe, helium/He, mercury/Hg, sodium/Na, lead/Pb, tin/Sn) — very high collision rate, favor less-common elements
- Boiling point of water at sea level (100°C)
- SI unit of electric current (Ampere) / electrical capacitance (Farad)
- Longest bone in the human body (Femur)
- Number of chambers in the human heart (Four)
- Largest organ in the human body (Skin)
- Element with atomic number 1 (Hydrogen)
- Newton's laws of motion / universal gravitation
- Metal that's liquid at room temperature (Mercury)
- Most abundant gas in Earth's atmosphere (Nitrogen) — note: "most abundant NOBLE gas" (Argon) is a different, still-valid fact, not a dupe
- Who discovered penicillin (Alexander Fleming)
- "First successful human [organ] transplant surgeon" template — heart, liver, kidney, lung, pancreas, and bone marrow transplant firsts are all now covered
- Largest INTERNAL organ in the human body (Liver) — distinct from "largest organ" (Skin, already listed above), but also already covered
- Chemical name for laughing gas (Nitrous oxide)
- Alloy of copper and tin (Bronze)
- Solid-to-gas phase change term (Sublimation)
- Doppler effect (sound wave frequency shift from relative motion)
- Mitosis (cell division into two identical daughter cells)
- Sugar in DNA's backbone (Deoxyribose)
- Pigment giving human skin its color (Melanin)
- Blood vessel carrying blood away from the heart (Artery)
- Structure containing genetic material — whether asked directly ("what structure holds a cell's DNA" -> Nucleus) or in reverse ("what's the genetic material found in the nucleus" -> DNA), both directions are covered
- Brain region for balance/coordination (Cerebellum)
- Credited with the first algorithm for a machine (Ada Lovelace)
- First widely-used graphical web browser (Mosaic)
- Python's creator (Guido van Rossum)
- Computing acronym expansions for SQL, API, HTTP, URL, RAM, CPU, VPN — very high collision rate, favor less-common acronyms (e.g. avoid another "what does X stand for" unless X isn't already on this list)
- Elisha Otis and the safety elevator
- SI unit lookups for luminous intensity (Candela), frequency (Hertz), inductance (Henry) — "SI base unit of X" / "SI derived unit of X" is the same fact as plain "SI unit of X", not a fresh angle
- Chemical symbol for antimony (Sb)
- Element with atomic number 79 (Gold)
- Highest melting point of any pure metal (Tungsten)
- Vitamin essential for blood clotting (Vitamin K)
- Metal with the highest electrical conductivity (Silver)
- Acid that is the main component of gastric juice/stomach acid (Hydrochloric acid)
- Smallest bone in the human body (Stapes, in the middle ear)
- Edward Jenner and the first (smallpox/cowpox) vaccine — already covered in a "which scientist created the first successful vaccine" framing
- Element with the highest density at standard/room conditions (Osmium)
- Vitamin synthesized in skin from sunlight/UVB exposure (Vitamin D)
- Connective tissue that attaches muscle to bone (Tendon)
- Acid that gives vinegar its sour taste (Acetic acid)
- Process by which DNA is copied/transcribed into RNA (Transcription)
- Rock type formed from cooling magma/lava (Igneous)
- Material in pencil "lead" (Graphite) — Chicago Pile-1's use of graphite as a neutron moderator is now ALSO covered (a separate fact sharing the same answer, don't redraft either)
- Definition of refraction (light bending between media) — already covered; diffraction (bending/spreading around obstacles) is a different, already-covered fact too, so don't redraft either
- Linus Torvalds creating the Linux kernel in 1991
- Which bond type involves sharing electron pairs (Covalent bond)
- pH of pure water at 25°C (7)
- SI unit of magnetic flux (Weber)
- Technetium as the first artificially produced element, atomic number 43, in 1937
- Heisenberg's uncertainty principle (formulated 1927)
- The Schrödinger equation (describes how a quantum system's wave function evolves)
- The thyroid gland (butterfly-shaped, neck, regulates metabolism)
- Einsteinium (atomic number 99, discovered in 1952 H-bomb test debris)
- Dijkstra's algorithm for shortest paths in a weighted graph
- Unicode as the character encoding standard that superseded ASCII
- Definition of the Fibonacci sequence
- Archimedes' principle (buoyant force equals weight of displaced fluid)
- Dmitri Mendeleev and the periodic table of elements (very high collision rate — asked from at least 4 different phrasings already)
- The barometer as the instrument that measures atmospheric pressure
- ENIAC as the first general-purpose electronic computer
- Grace Hopper popularizing the term "computer bug" after finding a moth — also avoid asking "what insect was found" directly, since the existing question's own premise already states it was a moth
- The Haber-Bosch process (ammonia synthesis, first used industrially at BASF Oppau in 1913)

CAUTION — some pairs that look like duplicates by shared answer or surface wording are NOT: SI unit of magnetic flux (Weber) is a different quantity from SI unit of magnetic flux DENSITY (Tesla), already covered; "which company developed C#" (Microsoft) is a different fact from "which company developed C" (Bell Labs/AT&T) despite the near-identical question text. Don't skip a fact just because a similarly-worded question already exists — check whether it's actually the same underlying fact first.

Use web search to verify every fact — do not rely on memory alone. Prefer authoritative sources (reference databases, encyclopedic sources) over guessing. For each question, actually find the fact via search rather than recalling it, especially for obscure details (specific numbers, dates, records).

If any fact involves a "current record," "most," "latest," or similar superlative, pin it to a specific time (e.g. "as of 2026") rather than stating it as a timeless fact, since these claims go stale.

OUTPUT FORMAT: A single JavaScript file, CommonJS style, like this:

module.exports = [
  {
    "difficulty": "easy" | "medium" | "hard",
    "category": "science-technology",
    "question": "What is...?",
    "options": ["Correct answer", "Wrong option 1", "Wrong option 2", "Wrong option 3"],
    "answer": "Correct answer"
  },
  ...
];

Rules for each entry:
- Do NOT include an "id" field — I'll assign that myself.
- Every entry MUST include "category": "science-technology" exactly as written (all lowercase, with the hyphen) — don't vary it, translate it, or use the topic name instead.
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
