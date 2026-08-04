## Food & Drink

```
You are drafting trivia questions for a multiple-choice trivia app. You have no access to my codebase — just generate the content below and I'll hand it to another AI to review, dedupe, and merge into the database myself.

TOPIC: Food & Drink — cuisine, ingredients, cooking, beverages, culinary history and traditions.

COUNT: 100 questions.

Use web search to verify every fact — do not rely on memory alone. Prefer authoritative sources (culinary references, encyclopedic sources) over guessing. For each question, actually find the fact via search rather than recalling it, especially for obscure details (specific origins, lesser- known dishes/ingredients).

If any fact involves a "current record," "most," "latest," or similar superlative, pin it to a specific time (e.g. "as of 2026") rather than stating it as a timeless fact, since these claims go stale.

OUTPUT FORMAT: A single JavaScript file, CommonJS style, like this:

module.exports = [
  {
    "difficulty": "easy" | "medium" | "hard",
    "category": "food-drink",
    "question": "What is...?",
    "options": ["Correct answer", "Wrong option 1", "Wrong option 2", "Wrong option 3"],
    "answer": "Correct answer"
  },
  ...
];

Rules for each entry:
- Do NOT include an "id" field — I'll assign that myself.
- Every entry MUST include "category": "food-drink" exactly as written (all lowercase, with the hyphen) — don't vary it, translate it, or use the topic name instead.
- Exactly 4 options, all non-empty, all distinct from each other.
- "answer" must be an exact string match (character-for-character) to one of the 4 "options".
- The correct answer's position in the options array should be varied/randomized across questions — don't always put it first or in the same slot.
- "question" must not leak the answer in the question text itself (e.g. don't write "What type of animal is Geppetto's cat?" if the answer is "cat").
- Options should be short answer phrases, not full sentences.
- Do NOT use hedge or meta answers as options (e.g. "This isn't a real plot point," "None of the above," "It's unclear") — every option should be a real, specific, plausible-sounding answer.
- Avoid the most well-known/obvious trivia chestnuts for this topic if possible — I likely already have those. Favor specific, lesser-known facts over headline facts.
- Distractor (wrong) options should be plausible, not absurd, and should not themselves be true statements about the topic (a wrong answer that's secretly also correct elsewhere is a common trivia bug).

AVOID THESE ANGLES (facts already asked, in some cases more than once — don't draft a question that tests the same underlying fact even if worded differently):
- Which spice comes from the crocus flower / is the most expensive by weight (saffron)
- What pasta shape resembles small grains of rice, used in soups (orzo)
- Main/base ingredient of hummus (chickpeas)
- Cheese traditionally used on a Margherita pizza (mozzarella)
- Main ingredient of guacamole (avocado)
- Vegetable fermented to make sauerkraut (cabbage)
- Main ingredient of Spanish gazpacho (tomato)
- The three vegetables in a French mirepoix (onions, carrots, celery) — already asked both as "name the mixture" and "name the missing third vegetable"
- Who/what the sandwich is named after (John Montagu, 4th Earl of Sandwich)
- What plant tequila must legally be distilled from (blue agave)
- Minimum corn percentage required for a whiskey to be called bourbon (51%)
- What winemaking byproduct grappa is distilled from (grape pomace)
- What fruit Calvados brandy is distilled from (apples)
- What kvass is made from (fermented rye bread)
- What three ingredients make up Turkish ayran (yogurt, water, salt) — already asked in both directions ("what's the third ingredient" and "what's this yogurt drink called")
- What cut of pork guanciale is made from (pork cheek/jowl) — already asked in both directions
- What natto is made of (fermented soybeans) — already asked as "name this fermented soybean dish" from the description side
- What kombu is (a type of edible kelp/seaweed) — already asked as "what seaweed is used for dashi" from the other direction
- What part of the tree cinnamon comes from (the inner bark) — already asked in the reverse direction ("which spice comes from tree bark")
- What part of the clove tree the spice comes from (unexpanded flower buds) — already asked in the reverse direction
- What natural casing haggis is boiled in (a sheep's stomach)
- What gives Earl Grey tea its flavor (bergamot oil/citrus)
- Primary ingredient in risotto (Arborio rice)
- Country Caesar salad was actually invented in (Mexico, despite the Italian-sounding name)
- City chicken tikka masala is widely believed to have been invented in (Glasgow) — already asked at both city and country (Scotland) granularity; don't draft either again
- Which country butter tarts / Tire d'érable sur la neige (maple taffy on snow) come from (Canada)
- What gives Canadian "tiger tail" ice cream its black stripes (licorice)
- Which indigenous peoples made beaver tail / what fish isinglass comes from (sturgeon) / which hotel claims to have invented the brownie (Palmer House, Chicago) — all already asked in both directions (name the food → answer, and describe the food → name it)
- Main ingredient in Greek tzatziki besides yogurt (cucumber)
- Primary dairy ingredient in Indian lassi (yogurt)
- What Ethiopian/Eritrean injera flatbread is made from (teff flour)
- The French culinary term for combining a dry-heat sear with a covered, moist-heat slow cook (braising)
- What fish katsuobushi is made from (skipjack tuna) — already asked in both directions
- Which of the five French mother sauces is an emulsion rather than roux-based (hollandaise)
- Casu marzu containing live insect larvae/maggots — already asked in both directions (name the cheese → organism, and describe the organism → name the cheese)
- What grain sake is made from (rice) — already asked many times over, heavily saturated
- What mirin is (a sweet Japanese rice wine) — already asked in both directions
- What jamón Ibérico de bellota pigs feed on during the montanera (acorns)
- Sous vide as vacuum-sealed, temperature-controlled water bath cooking
- Ajo blanco as a chilled Spanish almond-garlic-bread soup predating gazpacho
- Halloumi's high melting point letting it be grilled/fried — already asked in both directions
- Which Austrian pastry the French croissant descends from (Kipferl)
- What Italian Christmas bread Dresden's Stollen equivalent is / naming Stollen from a "Dresden Christmas fruit bread" clue
- What cheese makes up tiramisu's creamy layer (mascarpone)
- What animal's milk authentic mozzarella di bufala is made from (water buffalo)
- What liquid nasi lemak rice is cooked in (coconut milk)
- Which Japanese noodle is made from buckwheat flour (soba)
- Naming tom yum from a "sour spicy Thai soup with shrimp/lemongrass" clue
- What fruit gives sinigang its sourness (tamarind) — already asked in both directions
- Naming Jollof rice from a "West African rivalry / Jollof Wars" clue
- Main ingredient of baba ghanoush (eggplant/roasted vegetable)
- Naming biltong from a "South African jerky-like cured meat" clue
- Naming tagine from a "Moroccan stew named after its conical pot" clue
- Naming berbere from its distinctive spice-blend ingredients
- Main ingredient of tabbouleh (parsley)
- What root vegetable gives borscht its red color (beet)
- Naming quiche Lorraine's namesake region, or Madeira wine's namesake island, or Pisco Sour's base spirit — all self-leaking since the dish/drink name already contains the answer word; don't draft these framings, ask something else about the item instead
- What beer style uses wild Brettanomyces/spontaneous fermentation in open coolships (lambic)
- What compound makes chili peppers hot (capsaicin) — already asked from the "deters mammals, not birds" angle
- What nut, besides basil and olive oil, goes into pesto (pine nuts)
- The French term for cooking food slow and low sealed in its own fat (confit)
- Naming hollandaise from an "egg yolk, lemon, clarified butter" description
- What cheese is fried in Greek saganaki (kefalotyri)
- Naming doenjang from a "Korean fermented soybean paste" description
- Main/centerpiece vegetable of ratatouille (eggplant)
- What spice gives paella its yellow color (saffron) — already asked in both directions
- What spirit is the base of a Mojito (rum)

Avoid drafting a question whose dish name already contains the answer (e.g. asking what tuber "pounded yam" is pounded from, when the answer is literally "yam"; or what grain "farro salad" is made from, when the answer is "farro") — these are self-answering and get cut regardless of whether the underlying fact is otherwise fresh.

Watch especially for the *reversed-direction* duplicate pattern in this category: an existing question that describes an ingredient/process and asks for the dish's name, versus a new question that names the dish and asks for the ingredient/process — these test the same fact from opposite ends and both count as the same duplicate even though word overlap is low and neither literally repeats the other's phrasing.

Output just the JS file content, nothing else.
```
