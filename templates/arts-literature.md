## Arts & Literature

```
You are drafting trivia questions for a multiple-choice trivia app. You have
no access to my codebase — just generate the content below and I'll hand it
to another AI to review, dedupe, and merge into the database myself.

TOPIC: Arts & Literature — books, authors, painting, sculpture, poetry,
classic literature and fine art. Film/TV and music have their own
categories — don't draft those here.

COUNT: 100 questions.

AVOID THESE ANGLES — already well-covered in my question bank, so don't
draft facts that overlap with these (pick different, more specific facts
instead):
- Who wrote "The Divine Comedy" (Dante Alighieri)
- Who wrote "Crime and Punishment" (Fyodor Dostoevsky)
- Who wrote "Pride and Prejudice" (Jane Austen)
- Who wrote "War and Peace" (Leo Tolstoy)
- Who painted the "Mona Lisa" (Leonardo da Vinci)
- Who painted "The Starry Night" (Vincent van Gogh)
- Who wrote "Don Quixote" (Miguel de Cervantes)
- Which fairy tale character leaves a glass slipper (Cinderella)
- Who wrote "Romeo and Juliet" (William Shakespeare) — this one collided
  three separate times across different drafting agents in a single batch
- Who wrote "The Odyssey"/"The Iliad" (Homer)
- Who wrote "The Aeneid" (Virgil)
- Who wrote "The Canterbury Tales" (Geoffrey Chaucer)
- Who wrote "Frankenstein" (Mary Shelley)
- Who wrote "Wuthering Heights"/"Jane Eyre" (Emily/Charlotte Brontë)
- Who wrote "Moby-Dick" (Herman Melville)
- Who wrote "The Picture of Dorian Gray" (Oscar Wilde)
- Who wrote "The Great Gatsby" (F. Scott Fitzgerald)
- Who wrote "To Kill a Mockingbird" (Harper Lee)
- Who wrote "1984"/"Brave New World" (George Orwell/Aldous Huxley)
- Who wrote "The Sound and the Fury" (William Faulkner)
- Who wrote "The Catcher in the Rye" (J.D. Salinger)
- Who wrote "One Hundred Years of Solitude" (Gabriel García Márquez)
- Who wrote "The Bell Jar" (Sylvia Plath)
- Who wrote "The Waste Land" (T.S. Eliot)
- Who wrote "The Raven" (Edgar Allan Poe) — note "Annabel Lee" (also Poe) is
  a different poem and NOT a duplicate of this
- Who wrote "Leaves of Grass" (Walt Whitman)
- Who wrote "Paradise Lost" (John Milton)
- Who painted "Guernica" (Pablo Picasso)
- Who painted "The Persistence of Memory" (Salvador Dalí)
- Who painted "The Scream" (Edvard Munch)
- Who painted "Girl with a Pearl Earring" (Johannes Vermeer)
- Who painted "The Birth of Venus" (Sandro Botticelli)
- Who painted "The Night Watch" (Rembrandt van Rijn)
- Who painted "The School of Athens" (Raphael)
- Who sculpted "The Thinker"/"The Pietà"/"David" (Auguste Rodin/Michelangelo)
- Who designed/sculpted the Statue of Liberty (Frédéric Auguste Bartholdi)
- Who painted "The Creation of Adam" — same fact as "who painted the
  Sistine Chapel ceiling," since it's that ceiling's central/title panel
- Who painted "American Gothic" (Grant Wood)
- Which art movement is Salvador Dalí/Surrealism, Picasso/Cubism, or
  Monet-Renoir-Degas/Impressionism most associated with — already covered
  via "which movement, pioneered/associated with [artist], ..." framing
- Who wrote "The Importance of Being Earnest" (Oscar Wilde)
- Who wrote "A Streetcar Named Desire" (Tennessee Williams)
- Who wrote "Death of a Salesman" (Arthur Miller)
- Who painted "Las Meninas" (Diego Velázquez)
- Who painted "The Third of May 1808" (Francisco Goya)
- Which artist/technique is "A Sunday on La Grande Jatte" (Georges Seurat,
  Pointillism)
- Who painted "The Kiss" (Gustav Klimt)
- Who sculpted "The Ecstasy of Saint Teresa" (Gian Lorenzo Bernini)
- Who wrote "Les Misérables" (Victor Hugo)
- Which Dickens novel has Pip and Miss Havisham (Great Expectations) —
  already covered via the Havisham-in-wedding-dress framing
- Who wrote "The Stranger" (Albert Camus)
- Name of the regime in Margaret Atwood's "The Handmaid's Tale" (Gilead)
- Guy Montag's profession in "Fahrenheit 451" (Fireman)
- Which Steinbeck novel follows the Joad family (The Grapes of Wrath)
- Who wrote "Who's Afraid of Virginia Woolf?" (Edward Albee)
- Name of the monster in "Beowulf" (Grendel) — already covered via the
  John Gardner "Grendel" retelling-novel framing

CAUTION — a same-author reuse isn't automatically a duplicate: e.g. Arthur
Miller wrote both "Death of a Salesman" (covered above) and "The Crucible"
(not covered, a genuinely different question); Tennessee Williams wrote
both "A Streetcar Named Desire" (covered) and "The Glass Menagerie" (not);
Michelangelo, Picasso, and Rodin especially have many genuinely distinct
works each — only treat it as a duplicate when the *specific work* matches
one already listed above, not just the artist/author.

Use web search to verify every fact — do not rely on memory alone. Prefer
authoritative sources (encyclopedic sources, literary references) over
guessing. For each question, actually find the fact via search rather than
recalling it, especially for obscure details (lesser-known works,
specific dates).

If any fact involves a "current record," "most," "latest," or similar
superlative, pin it to a specific time (e.g. "as of 2026") rather than
stating it as a timeless fact, since these claims go stale.

OUTPUT FORMAT: A single JavaScript file, CommonJS style, like this:

module.exports = [
  {
    "difficulty": "easy" | "medium" | "hard",
    "category": "arts-literature",
    "question": "What is...?",
    "options": ["Correct answer", "Wrong option 1", "Wrong option 2", "Wrong option 3"],
    "answer": "Correct answer"
  },
  ...
];

Rules for each entry:
- Do NOT include an "id" field — I'll assign that myself.
- Every entry MUST include "category": "arts-literature" exactly as written
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
