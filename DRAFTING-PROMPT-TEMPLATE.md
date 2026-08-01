# Prompt template: drafting question batches with an external AI

Use this when you want an AI agent that has **no context of this repo**
(e.g. a fresh session, a different tool, one with web search but no
filesystem access) to draft a batch of trivia questions for you to review.
Fill in the bracketed parts, then copy everything inside the code block
below — nothing outside it — and paste that to the agent. Hand its output
back to Claude in this repo afterward — say which category it's for — and
Claude will run `check-draft.js`, fix flagged issues, assign IDs, merge,
validate, and ship.

---

```
You are drafting trivia questions for a multiple-choice trivia app. You have
no access to my codebase — just generate the content below and I'll hand it
to another AI to review, dedupe, and merge into the database myself.

TOPIC: General knowledge

COUNT: 100 questions.

AVOID THESE ANGLES — already well-covered in my question bank, so don't
draft facts that overlap with these (pick different, more specific facts
instead):
- Chemical symbol for tungsten (W)
- Earth's atmosphere composition (~78% nitrogen)
- Number of bones in the adult human body (206)
- Smallest planet in the solar system (Mercury)
- Which planet has the most moons (Saturn)
- Hardest naturally occurring substance (diamond)
- Who invented the World Wide Web (Tim Berners-Lee)
- SI unit of electrical resistance (ohm)
- Chemical symbol for potassium (K)
- Subatomic particle with no electric charge (neutron)

Use web search to verify every fact — do not rely on memory alone. Prefer
authoritative sources for this topic (e.g. fan wikis and episode guides for
a TV show, reference databases/almanacs for general knowledge) over
guessing. For each question, actually find the fact via search rather than
recalling it, especially for obscure details (guest actor names, minor
character info, specific numbers/dates/records).

If any fact involves a "current record," "most," "latest," or similar
superlative, pin it to a specific time (e.g. "as of 2026") rather than
stating it as a timeless fact, since these claims go stale.

OUTPUT FORMAT: A single JavaScript file, CommonJS style, like this:

module.exports = [
  {
    "difficulty": "easy" | "medium" | "hard",
    "question": "What is...?",
    "options": ["Correct answer", "Wrong option 1", "Wrong option 2", "Wrong option 3"],
    "answer": "Correct answer"
  },
  ...
];

Rules for each entry:
- Do NOT include "id" or "category" fields — I'll assign those myself.
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
  (guest cast, minor characters, specific numbers, niche details) over
  headline facts.
- Distractor (wrong) options should be plausible, not absurd, and should not
  themselves be true statements about the topic (a wrong answer that's
  secretly also correct elsewhere is a common trivia bug).

Output just the JS file content, nothing else.
```

---

## Angles already covered

Different external agents (and repeat runs of the same one) tend to
converge on the same well-known trivia facts, since they're drawing on a
similar slice of general knowledge. This list tracks the specific
facts/angles that have already caused a drafted question to collide with
the existing corpus, so future prompts can steer around them instead of
re-generating and re-rejecting the same chestnuts every batch. Paste the
relevant category's list into the `AVOID THESE ANGLES` line above before
sending the prompt.

This is maintained by Claude after each inbox batch review — see
CLAUDE.md's "External-agent drafting" section for the update process. Not
meant to be exhaustive or grow forever; entries get pruned if the list gets
long and unfocused.

### general

- Chemical symbol for tungsten (W)
- Earth's atmosphere composition (~78% nitrogen)
- Number of bones in the adult human body (206)
- Smallest planet in the solar system (Mercury)
- Which planet has the most moons (Saturn)
- Hardest naturally occurring substance (diamond)
- Who invented the World Wide Web (Tim Berners-Lee)
- SI unit of electrical resistance (ohm)
- Chemical symbol for potassium (K)
- Subatomic particle with no electric charge (neutron)

### friends

*(none yet — add here after the first external-agent batch for this
category is reviewed)*

### big-bang-theory

*(none yet — add here after the first external-agent batch for this
category is reviewed)*

---

## Why it's shaped this way

- **No `id`/`category`** — IDs are assigned at merge time based on the
  current highest ID in the target category, so collisions from the
  drafting agent aren't a concern.
- **"Verify via search, don't recall"** matters most for `friends` and
  `big-bang-theory` — those two are deep enough that memory-only drafting
  has a high duplicate/inaccuracy rate (see CLAUDE.md). For `general`,
  memory drafting still mostly works but benefits from search too as it
  grows.
- **Time-pinning superlatives** and **no hedge/meta answers** map directly
  to checks `check-draft.js` already runs — front-loading them in the
  prompt means fewer things get rejected after the fact.
