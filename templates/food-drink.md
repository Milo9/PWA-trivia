## Food & Drink

```
You are drafting trivia questions for a multiple-choice trivia app. You have no access to my codebase — just generate the content below and I'll hand it to another AI to review, dedupe, and merge into the database myself.

TOPIC: Food & Drink — cuisine, ingredients, cooking, beverages, culinary history and traditions.

COUNT: 200 questions.

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
- Wormwood as absinthe's defining botanical; caraway as aquavit's dominant flavoring
- Surströmming as Sweden's pungent fermented herring; Lussekatter as Sweden's saffron Lucia-Day buns; brunost as Norway's caramelized-whey brown cheese
- Chimichurri (Argentine parsley-garlic-vinegar sauce); tomatillos as salsa verde's base; goulash's origin (Hungary); pho's origin (Vietnam) and its rice-noodle base
- Shabu-shabu as Japan's swished-in-broth hot pot; okonomiyaki as Japan's savory "as you like it" pancake; kouign-amann as the butter-laminated Breton pastry
- Main/centerpiece vegetable of ratatouille (eggplant)
- What spice gives paella its yellow color (saffron) — already asked in both directions
- What spirit is the base of a Mojito (rum)
- Parmigiano Reggiano's minimum PDO aging requirement (12 months)
- Poutine's origin in Quebec
- What "al dente" means for pasta (firm to the bite)
- Bouquet garni as the French term for a tied herb bundle used to flavor stocks
- Labneh as strained yogurt
- Botanically, the almond is not a true nut but a drupe/fruit type
- Pigment that gives carrots their orange color (beta-carotene)
- What acid cures fish in ceviche (citrus juice)
- Tonka beans' banned aromatic compound (coumarin)
- What powdered/whisked Japanese green tea is used in the tea ceremony (matcha)
- What sparkling wine replaces gin in a Negroni Sbagliato (Prosecco)
- Cocktail of whiskey, sweet vermouth and bitters (Manhattan)
- What gives sourdough its tangy flavor (lactic acid bacteria)
- What Brazilian feijoada's main legume is (black beans)
- Cured, rolled, sliced pork belly used in carbonara (pancetta)
- What coffee drink is espresso + steamed milk + foam (cappuccino)
- Definition/composition of yuzu kosho (chili, yuzu peel, salt paste)
- Definition of yerba mate (South American holly-leaf caffeine infusion)

Avoid drafting a question whose dish name already contains the answer (e.g. asking what tuber "pounded yam" is pounded from, when the answer is literally "yam"; or what grain "farro salad" is made from, when the answer is "farro") — these are self-answering and get cut regardless of whether the underlying fact is otherwise fresh.

Watch especially for the *reversed-direction* duplicate pattern in this category: an existing question that describes an ingredient/process and asks for the dish's name, versus a new question that names the dish and asks for the ingredient/process — these test the same fact from opposite ends and both count as the same duplicate even though word overlap is low and neither literally repeats the other's phrasing.

**Cheese/wine/spirit "which country does X come from" is a hidden mini-series — check by hand, not just check-draft.** A 2026-09-03 accessible-difficulty batch found Gruyère, Roquefort, Halloumi, and Cognac all already had a dedicated country-of-origin question sitting in the corpus (food-drink-168, -128, -002, -706) — none of these were flagged by the default check-draft pass ahead of time from a plain corpus grep (the grep found *other* facts about these same cheeses/spirits, not the country-of-origin phrasing specifically), only surfaced via `--full-answer-audit` after drafting. Before drafting a "which country is cheese/wine/spirit X from" question, grep the corpus for that specific name AND read every hit's full question text, not just whether a hit exists.
- Cheese/wine/spirit country-of-origin facts now covered: Gruyère (Switzerland), Roquefort (France), Halloumi (Cyprus), Edam (Netherlands), Gorgonzola (Italy), Comté (France), Cognac (France)
- Cocktail base-spirit facts now covered (name the cocktail → base spirit): Martini (gin), Cosmopolitan (vodka), Tom Collins (gin), Whiskey Sour (whiskey), Mai Tai (rum), Paloma (tequila), Daiquiri (rum), Piña Colada (rum), Margarita (tequila), Bloody Mary (vodka), Moscow Mule (vodka), Old Fashioned (whiskey, via garnish framing), Sazerac (rye whiskey), French 75 (gin), Aviation (gin)
- Cooking-technique term definitions now covered: deglaze, fond, mise en place, poaching, reduction, basting, searing, chiffonade, proofing (dough), zest, blanching, sautéing, braising, confit, sous vide, al dente
- "What gives sourdough its tang" (lactic acid bacteria) — covered at least twice already; "what's the fifth taste, umami" — covered at least twice already (once via the Japanese-word-origin angle, once via the plain definition)
- Myth-busting "invented in the US, not the country you'd assume" facts now covered: fortune cookies (US, via Japanese immigrants in early-1900s California), chop suey (US), General Tso's chicken (unknown in China), chili con carne (Texas/American Southwest, not Mexico), pasta NOT via Marco Polo
- **Premise-reveals-the-answer trap, a new instance:** an existing question already names "Ignacio Anaya" as nachos' inventor in its own stem (food-drink-803) — a new question asking "what was he nicknamed" is redundant even though it nominally tests a different fact (the dish's name vs. the inventor's nickname), because "Nacho" is simply the common Spanish nickname for "Ignacio" and is trivially inferable from the existing question's own premise. Same principle as the Jack Woltz/horse's-head example in CLAUDE.md — check whether a candidate fact is already given away as background in an existing question before drafting it as the "answer" of a new one.
- Packaged snack/pantry-staple brand origin stories, a 2026-09-03 addition (part of the same household-brand pivot documented in `templates/business-brands.md`): Old Bay (Gustav Brunn, German immigrant, 1939 Baltimore; named for a steamship line; McCormick acquired it in 1990), Cheez-It (Dayton, Ohio, 1921; Kellogg's acquired it in 2001), Ritz Crackers (Nabisco, 1934, named to evoke Depression-era luxury; seven perforations per cracker), Fritos (Charles Doolin, recipe/equipment bought from cook Gustavo Olguin, first made in his mother's kitchen), Little Debbie (O.D. McKee, 1960, named after his granddaughter; Oatmeal Creme Pies was the first product), Goldfish crackers (created 1958 by a Swiss biscuit company; Pepperidge Farm brought them to the US in 1962), Kraft Macaroni and Cheese (originally "Kraft Dinner," 1937; relies on James L. Kraft's 1916 processed-cheese patent), Velveeta (1918, invented to salvage broken wheels of Swiss cheese; sold to Kraft in 1927), Cool Whip (1966, first frozen non-dairy whipped topping; inventor William A. Mitchell also invented Pop Rocks), Heinz Ketchup (labeled "Catsup" at its 1876 debut; the "57 Varieties" slogan was inspired by a shoe ad Heinz saw in 1896), French's Mustard (debuted at the 1904 St. Louis World's Fair; turmeric gives it its yellow color), Spam (Hormel, 1937, to use up surplus pork shoulder; the name is thought to abbreviate "spiced ham"), and Nutella (Pietro Ferrero's postwar chocolate-hazelnut paste, developed to stretch scarce cocoa; renamed from "Supercrema" in 1963 after Italy banned superlative product names)
- Basic product-identity facts (what a brand sells/is used for, NOT origin stories or founders) for packaged-food and beverage brands, a 2026-09-03 accessible-difficulty addition covering ~65 brands largely untouched above: spreads (Skippy, Jif, Welch's, Smucker's, Peter Pan); baking (Bisquick's name blend, Crisco's acronym, Duncan Hines the real restaurant critic, Log Cabin, Karo, Domino sugar); snacks/crackers (Cheez Whiz, Triscuit, Wheat Thins, Nilla Wafers, Chips Ahoy!, Saltines, Pop-Tarts, Toaster Strudel); condiments/dairy (Philadelphia's actual New York origin, Land O'Lakes, Hellmann's/Best Foods regional-name split, Grey Poupon's luxury-car ad, Frank's RedHot/Buffalo wings, Kikkoman, McCormick, Hunt's, A.1., Tapatío, Cholula, Lawry's, Yoplait, Chobani, Dannon, Babybel, Sargento, Coffee-Mate, International Delight, Claussen, Bragg apple cider vinegar); beverages (Lipton tea and its onion-soup-mix dip, Ocean Spray, Capri Sun's foil pouch, V8's eight-vegetable name, Powerade/Coca-Cola, Tropicana, Minute Maid, Arizona's 99-cent can, Sunny D, Hawaiian Punch, Evian/France); frozen/canned (Hot Pockets, Stouffer's, Birds Eye/Clarence Birdseye's flash-freezing, Chef Boyardee's phonetic name-spelling, Progresso, Bush's Best/Jay Bush's dog Duke, Del Monte, Reddi-wip); ice cream (Breyers, Magnum, Good Humor, Klondike's ad slogan); cereal (Cheerios, Cinnamon Toast Crunch, Kashi, Special K, Lucky Charms); and savory/meat (Swanson, Ragu, Prego, Jimmy Dean, Butterball) — see CLAUDE.md's "Accessibility-constrained drafting" section for why this angle survives dedup so much better than the origin-story angle this template otherwise favors

Output just the JS file content, nothing else.
```
