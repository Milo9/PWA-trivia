## Animals & Nature

```
You are drafting trivia questions for a multiple-choice trivia app. You have
no access to my codebase — just generate the content below and I'll hand it
to another AI to review, dedupe, and merge into the database myself.

TOPIC: Animals & Nature — wildlife, plants, ecosystems, animal biology and
behavior. Human anatomy/physiology belongs in Science & Technology, not
here.

COUNT: 100 questions.

AVOID THESE ANGLES — already well-covered in my question bank, so don't
draft facts that overlap with these (pick different, more specific facts
instead):
- How many legs a spider has (Eight)
- Largest mammal in the world (Blue Whale)
- How many hearts an octopus has (Three)
- Mantis shrimp punch acceleration/speed (compared to a .22 caliber
  bullet, or given in g-force) — already asked twice
- What a narwhal's tusk actually is (an elongated canine tooth)
- What the honeybee waggle dance communicates (direction/distance to food)
- What pangolin scales are made of (keratin, same as fingernails) —
  already asked twice
- How wood frogs survive winter (freezing solid, thawing in spring)
- Which sex of seahorse carries the developing embryos (the male)
- How the "immortal jellyfish" (Turritopsis dohrnii) achieves biological
  immortality (reverting to a polyp stage)
- Bombardier beetle's defensive spray being boiling-hot
- Peregrine falcon's diving speed as the fastest animal (already asked
  with a ~240 mph figure — don't reintroduce with a different number)
- Unique shape of wombat droppings (cube-shaped)
- Giant squid having the largest eyes in the animal kingdom (already
  described as "size of a dinner plate" — don't reintroduce with a
  diameter-in-inches figure)
- Capybara as the largest living rodent species
- Naked mole rats' exceptional cancer resistance
- The fossa as Madagascar's top predator/largest carnivore
- Kākāpō being the world's only flightless parrot
- Okapi's closest living relative being the giraffe
- Mantis shrimp's exceptional color vision (12-16 photoreceptor
  types, vs. 3 in humans)
- Sea otters having the densest fur of any mammal (~1 million hairs per
  square inch)
- Giant panda's "thumb" being an enlarged/modified wrist bone (radial
  sesamoid) — already asked twice
- Cuttlefish pupils forming a W-shape in bright light
- Starfish regenerating a whole body from a single severed arm plus part
  of the central disk
- Electric eel (Electrophorus voltai) discharging ~860 volts, the highest
  recorded voltage from an eel
- Slow loris as the only venomous primate (toxin from elbow glands,
  delivered via a bite through grooved teeth)
- Collective noun for a group of flamingos (a flamboyance)
- Pufferfish toxin's name (tetrodotoxin)
- Chemical compound fireflies use to produce light (luciferin)
- Emperor penguin as the largest living penguin species
- Hoatzin chicks having claws on their wings
- King cobra as the longest venomous snake in the world
- Periodical cicadas' 13- or 17-year emergence cycles
- Venus flytrap needing two touches to its trigger hairs within ~20
  seconds to snap shut
- Mimic octopus impersonating other marine animals (already asked with
  specific species named — lionfish, sea snakes, jellyfish)
- Poison dart frogs losing toxicity in captivity because their toxin
  comes from their wild diet (ants/mites/beetles)
- How long it takes a sloth to digest a single meal (~a month/30 days)
- Hummingbird heart rate in flight (~1,200 beats per minute)
- Hippopotamus "blood sweat" being a natural sunscreen/antibacterial
  secretion (hipposudoric acid)
- Komodo dragon killing prey primarily via venom (not just septic
  bacteria/bite force)
- Chameleon tongue length relative to body (about twice its body length)
- Basilisk ("Jesus") lizard running across water's surface
- Surinam toad embedding eggs in the skin of her back
- Quokka's "world's happiest animal" nickname
- Bristlecone pine "Methuselah"'s age (~4,800-4,857 years)
- Superb lyrebird's general ability to mimic a wide range of sounds
  (already asked with specific examples — camera shutters, chainsaws)
- Aye-aye locating grubs by tapping on wood and listening for hollows
- Greenland shark's ~400+ year lifespan as longest of any vertebrate
- Archerfish's basic water-jet hunting method (already asked with the
  specific accurate range — up to ~5 feet/1.5 meters)
- Deep-sea anglerfish males fusing permanently to females (sexual
  parasitism)
- Blobfish's "ugly" appearance being an artifact of decompression at the
  surface, not how it looks at depth

Two facts that are premises already stated inside an existing question's
stem, so drafting them as a separate standalone question is redundant even
though the wording/answer differs: Rafflesia arnoldii being the world's
largest individual flower (already stated as a premise in the existing
"corpse flower" question), and a baobab's swollen trunk being for water
storage (already implied by the existing "how many liters" question).

Watch for this same fact reused on a *different* named animal, not just
verbatim repeats — e.g. blue blood from copper-based hemocyanin is
already asked about a horseshoe crab; the same mechanism on an octopus
or other mollusk is a distinct-enough entity to keep, but don't stack
more than one or two species onto the same shared mechanism.

Use web search to verify every fact — do not rely on memory alone. Prefer
authoritative sources (reference databases, encyclopedic sources) over
guessing. For each question, actually find the fact via search rather than
recalling it, especially for obscure details (specific numbers, records,
lesser-known species).

If any fact involves a "current record," "most," "latest," or similar
superlative, pin it to a specific time (e.g. "as of 2026") rather than
stating it as a timeless fact, since these claims go stale.

OUTPUT FORMAT: A single JavaScript file, CommonJS style, like this:

module.exports = [
  {
    "difficulty": "easy" | "medium" | "hard",
    "category": "animals-nature",
    "question": "What is...?",
    "options": ["Correct answer", "Wrong option 1", "Wrong option 2", "Wrong option 3"],
    "answer": "Correct answer"
  },
  ...
];

Rules for each entry:
- Do NOT include an "id" field — I'll assign that myself.
- Every entry MUST include "category": "animals-nature" exactly as written
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
