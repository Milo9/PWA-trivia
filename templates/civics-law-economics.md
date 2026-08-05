## Civics, Law & Economics

```
You are drafting trivia questions for a multiple-choice trivia app. You have no access to my codebase — just generate the content below and I'll hand it to another AI to review, dedupe, and merge into the database myself.

TOPIC: Civics, Law & Economics — definitions and concepts covering systems of government, legal principles and terms, economic theory/indicators, and international governmental organizations. Think "what is the term for..." style questions about concepts, not questions about a specific dated historical event (that's a History question) or a specific company/product (that's a Business & Brands question).

COUNT: 100 questions.

AVOID THESE ANGLES — already well-covered in my question bank, so don't draft facts that overlap with these (pick different, more specific facts instead):
- Federation as the term for power divided between a central authority and constituent regions
- The World Health Organization (WHO), headquartered in Geneva
- Inflation as the term for the general rise in prices over time
- Free market capitalism / Adam Smith's "invisible hand"
- Pension as regular post-retirement payments
- Presumption of innocence ("innocent until proven guilty")
- Direct democracy vs. representative democracy
- Fiat currency (legal tender not backed by a physical commodity like gold)
- Gross Domestic Product (GDP) as the measure of a country's total output
- Double jeopardy (the principle against being tried twice for the same offense)
- Dictator as a term for a leader with absolute, often oppressive power
- Recession, defined as two consecutive quarters of negative economic growth
- Oligarchy as government by a small, powerful group
- The UN Security Council having 5 permanent veto-holding members
- Alimony as post-divorce spousal support payments
- The World Economic Forum's annual Davos, Switzerland gathering
- "Crowding out" as the effect where government borrowing/spending reduces private investment
- Frictional unemployment (workers between jobs or searching for their first job)
- Fixed/pegged exchange rate system
- Presidential system (head of state and head of government combined, elected separately from the legislature for a fixed term)
- Tragedy of the commons
- Externality (cost/benefit imposed on an uninvolved third party)
- Ex post facto law
- Eminent domain
- Gini coefficient (income inequality index, 0 to 1)
- Caveat emptor ("let the buyer beware")
- Opportunity cost
- Quorum (minimum members present to conduct business)
- Caucus (party meeting to select candidates/policy)
- Regressive tax (takes a larger share from lower incomes)
- Phillips curve (inverse unemployment/inflation relationship)
- Fiscal deficit (spending exceeds revenue)
- Mediation (neutral facilitator, non-binding, distinct from arbitration)
- Dumping (exporting below cost to gain market share)
- Amicus curiae ("friend of the court")
- Res judicata (matter already judged, can't be relitigated)
- Jus cogens (peremptory international-law norm)
- Class action lawsuit
- Preponderance of the evidence (civil standard of proof)
- Copyright (protects literary/artistic/musical works)
- Structural unemployment (skills-jobs mismatch)
- Deposition (sworn out-of-court testimony) — note this is a different fact/answer from the science-technology category's "deposition" (gas-to-solid phase change); same word, unrelated meanings, not a cross-category duplicate
- Checks and balances
- Unicameral legislature
- Laffer curve (tax rate vs. revenue)
- Liquidity trap (near-zero interest rates, ineffective monetary policy)
- Monopoly as a market structure (one seller) — distinct from the board game of the same name
- Jus sanguinis (citizenship by blood descent)
- ILO (International Labour Organization) headquarters, Geneva
- Theocracy
- Patent (protects inventions)
- OPEC headquarters, Vienna
- Stratocracy (rule by the military)
- Separation of powers
- Oligopoly (few large sellers dominate)
- Tariff (tax on imports)
- Civil law legal system (codified statutes, as in continental Europe)
- Logrolling (legislators trading votes)
- Defamation (libel/slander, false statements harming reputation)
- Technocracy (rule by technical experts)
- Legal standing (sufficient stake to bring a lawsuit)
- Pro bono (free legal work for the public good)
- Trademark (protects brand names/logos/slogans)
- NATO headquarters, Brussels
- Absolute monarchy
- Jurisdiction (court's authority to hear a case)
- Protectionism (tariffs/quotas shielding domestic industry)
- Filibuster (US Senate delay tactic, cloture requires 60 votes)
- Actus reus (the guilty act element of a crime)
- Fiscal policy (government taxing/spending to influence the economy) — distinct from monetary policy
- Gerrymandering
- Progressive tax (higher rate on higher incomes)
- Impeachment (formal process to remove an official)
- Purchasing power parity
- Constitutional monarchy
- Statute of limitations
- Diarchy (joint rule by two people/powers)
- Judicial review
- Perjury (lying under oath)
- Price ceiling (government-imposed maximum price)
- Naturalization (foreign-born person becoming a citizen)
- Monetarism (Milton Friedman, controlling money supply)
- Monopsony (single buyer market)
- Deadweight loss (efficiency loss from market distortion)
- Watch for a drafting agent looping and repeating the same ~100-150 topics multiple times with slightly reworded phrasing across a single large batch — always run an exact-question-text dedup pass on drafts from this category before check-draft, not just check-draft's own internal-duplicate detection

Use web search to verify every fact — do not rely on memory alone. Prefer authoritative sources (reference databases, textbooks, official organization sites) over guessing. For each question, actually find or confirm the fact via search rather than recalling it, especially for specific figures, dates, and membership counts.

If any fact involves a "current record," membership count, headquarters location, or similar detail that can change over time, pin it to a specific time (e.g. "as of 2026") rather than stating it as a timeless fact, since these claims go stale.

OUTPUT FORMAT: A single JavaScript file, CommonJS style, like this:

module.exports = [
  {
    "difficulty": "easy" | "medium" | "hard",
    "category": "civics-law-economics",
    "question": "What is...?",
    "options": ["Correct answer", "Wrong option 1", "Wrong option 2", "Wrong option 3"],
    "answer": "Correct answer"
  },
  ...
];

Rules for each entry:
- Do NOT include an "id" field — I'll assign that myself.
- Every entry MUST include "category": "civics-law-economics" exactly as written (all lowercase, with hyphens) — don't vary it, translate it, or use the topic name instead.
- Exactly 4 options, all non-empty, all distinct from each other.
- "answer" must be an exact string match (character-for-character) to one of the 4 "options".
- The correct answer's position in the options array should be varied/randomized across questions — don't always put it first or in the same slot.
- "question" must not leak the answer in the question text itself (e.g. don't ask "What is the term for a government led by a small, powerful group, known as an oligarchy?" if the answer is "Oligarchy").
- Options should be short answer phrases, not full sentences.
- Do NOT use hedge or meta answers as options (e.g. "This isn't defined," "None of the above," "It's unclear") — every option should be a real, specific, plausible-sounding answer.
- Avoid the most well-known/obvious trivia chestnuts for this topic if possible — I likely already have those. Favor specific, lesser-known facts over headline facts.
- Distractor (wrong) options should be plausible, not absurd, and should not themselves be true statements about the same fact being tested (a wrong answer that's secretly also correct elsewhere is a common trivia bug) — a good pattern here is using real related terms/systems/organizations as distractors (e.g. other forms of government, other economic indicators, other international bodies).
- Don't draft a question about a specific historical event, person, or date tied to a founding/war/treaty — that belongs in the History category, not here. Don't draft a question about a specific company, product, or brand's economics — that belongs in Business & Brands.

Output just the JS file content, nothing else.
```
