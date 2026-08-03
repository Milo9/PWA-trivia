## Business & Brands

```
You are drafting trivia questions for a multiple-choice trivia app. You have no access to my codebase — just generate the content below and I'll hand it to another AI to review, dedupe, and merge into the database myself.

TOPIC: Business & Brands — company logos, slogans, founders/founding stories, and famous product flops. Focus on consumer brands most people interact with regularly (retail, food, tech, cars, apparel, etc.), not obscure B2B companies or finance/economics theory.

COUNT: 100 questions.

Use web search to verify every fact — do not rely on memory alone. Prefer authoritative sources (company histories, business/news archives, design retrospectives) over guessing. For each question, actually find the fact via search rather than recalling it, especially for founding dates, specific dollar figures, and designer names.

If any fact involves a "current record," "most," "latest," market cap, revenue figures, or similar superlative/numeric claim that changes over time, pin it to a specific time (e.g. "as of 2026") rather than stating it as a timeless fact, since these claims go stale.

OUTPUT FORMAT: A single JavaScript file, CommonJS style, like this:

module.exports = [
  {
    "difficulty": "easy" | "medium" | "hard",
    "category": "business-brands",
    "question": "What is...?",
    "options": ["Correct answer", "Wrong option 1", "Wrong option 2", "Wrong option 3"],
    "answer": "Correct answer"
  },
  ...
];

Rules for each entry:
- Do NOT include an "id" field — I'll assign that myself.
- Every entry MUST include "category": "business-brands" exactly as written (all lowercase, with the hyphen) — don't vary it, translate it, or use the topic name instead.
- Exactly 4 options, all non-empty, all distinct from each other.
- "answer" must be an exact string match (character-for-character) to one of the 4 "options".
- The correct answer's position in the options array should be varied/randomized across questions — don't always put it first or in the same slot.
- "question" must not leak the answer in the question text itself (e.g. don't ask "What is the name of the McDonald's fast-food chain?" if the answer is "McDonald's" — the brand name itself often can't be avoided as context, but make sure the actual fact being tested isn't given away).
- Options should be short answer phrases, not full sentences.
- Do NOT use hedge or meta answers as options (e.g. "This isn't publicly known," "None of the above," "It's unclear") — every option should be a real, specific, plausible-sounding answer.
- Avoid the most well-known/obvious trivia chestnuts for this topic if possible — I likely already have those. Favor specific, lesser-known facts over headline facts.
- Distractor (wrong) options should be plausible, not absurd, and should not themselves be true statements about the same fact being tested (a wrong answer that's secretly also correct elsewhere is a common trivia bug) — a good pattern here is using real competitor brands, real sibling car/product models, or other real people from the same industry as distractors.

AVOID THESE ANGLES (facts already asked, in some cases more than once — don't draft a question that tests the same underlying fact even if worded differently):
- Who designed the Nike "swoosh" logo, and how little she was paid for it (Carolyn Davidson, $35)
- The hidden arrow in the FedEx logo's negative space between "E" and "x"
- Coca-Cola's 1985 reformulation flop, commonly called "New Coke"
- The Ford Edsel as a byword for a notorious commercial flop
- The McDonald brothers (Richard and Maurice) opening the original McDonald's in San Bernardino, CA in 1940, before Ray Kroc franchised it
- Blue Ribbon Sports (Nike's predecessor) distributing Onitsuka Tiger shoes before creating its own brand
- Yahoo!'s original name, "Jerry's Guide to the World Wide Web"
- Nintendo's original product line, Hanafuda playing cards
- McDonald's 1992 "Arch Deluxe" flop, and the 2002 "McAfrika" controversy
- Tesla's first mass-produced vehicle, the Roadster, and Tesla Motors' 2003 founding by Martin Eberhard and Marc Tarpenning
- The Apple Newton (1990s PDA flop) and Apple's 1995 Pippin game console
- Pepsi-Cola's original 1893 name, "Brad's Drink"
- Amazon's Fire Phone (2015 flop)
- Crystal Pepsi (1992) and the "Pepsi Girl" mascot's real name, Hallie Eisenberg
- Google Glass's 2013 "Explorer Edition" launch and "Glasshole" mockery
- Nintendo's Virtual Boy (1995 red-monochrome 3D console, discontinued within a year)
- Snapchat's original name, Picaboo
- Airbnb's original name/concept, "Airbed & Breakfast"
- Amazon's original working name, "Cadabra"
- Frito-Lay's 2005 Cheetos-flavored lip balm
- Subway's original 1965 name, "Pete's Super Submarines"
- Domino's original name, "DomiNick's"
- Pepsi AM (1989 extra-caffeinated morning cola)
- Coors' 1990 non-alcoholic flop, Rocky Mountain Sparkling Water
- Zara being originally named "Zorba" after the film, changed due to a nearby bar with the same name
- Patagonia founder Yvon Chouinard originally selling climbing pitons
- Target originating as Dayton's discount store division
- Avon's original name, California Perfume Company
- The six stars in Subaru's logo representing the Pleiades star cluster
- The Hyundai logo depicting two people shaking hands (beyond just being a slanted "H")
- Audi's four rings representing the 1932 merger of four companies (whether asked as "how many companies" or "what do the rings represent")
- The Pontiac Aztek as Walter White's car in Breaking Bad (don't ask from either the car-identification or the show-trivia direction)
- Mazda's name partly deriving from Ahura Mazda, god of light/wisdom
- MGM's mascot lion being named Leo (don't ask from either the studio-identification or the lion-name direction)
- Play-Doh's original purpose as a wallpaper/wallpaper-soot cleaner
- L'Oréal founder Eugène Schueller's first product, a hair dye formula
- Starbucks' original 1971 siren logo featuring bare breasts
- Microsoft's MSN Direct/SPOT smartwatch network (watches launched 2004, discontinued 2008) and its Kin smartphone (2010, discontinued after 48 days) and Zune music player (2006-2011)
- Nokia's original business in wood pulp and paper
- Heinz's early-2000s green ketchup
- Virgin Cola (1994)
- Chevrolet's bowtie logo, popularly said to be inspired by Parisian hotel wallpaper
- Lego's name meaning "play well" in Danish
- Apple's 1998 iMac in "Bondi Blue" and other translucent colors
- Google+ (2011-2019) and Google Buzz/Orkut as other defunct Google social networks
- Reebok's predecessor, J.W. Foster and Sons (founded in England)
- Levi's founding by Levi Strauss and Jacob Davis in 1873 (riveted denim)
- Coca-Cola's Dasani bottled water (1999, UK recall) and other Coca-Cola product flops: New Coke (already listed above), TaB Clear (1985), Surge (1990s, vs. Mountain Dew), Coca-Cola C2 (2004)
- HP TouchPad (2011, discontinued after 49 days)
- Pringles' mascot, Julius Pringles, and its 1968 introduction by P&G in a cylindrical can
- Best Buy's original name, "Sound of Music" (renamed 1983 after a tornado damaged its store)
- Pepsi's "Pepsi Stuff" Harrier-jet lawsuit (1992)
- Michelin's mascot, Bibendum
- The QWERTY keyboard's origin with E. Remington and Sons typewriters
- Apple's original 1976 logo featuring Isaac Newton under a tree
- Mr. Clean's genie-logo
- Hulu's pre-launch nickname, "Clown Co."
- Vans, founded 1966 by Paul Van Doren
- Colgate's failed 1980s "Kitchen Entrees" frozen foods
- Joe Camel, RJR's 1988 mascot for Camel cigarettes
- Snickers being named after the Mars family's favorite horse
- Twix's original 1967 UK name, "Raider"
- Chupa Chups' daisy logo, designed by Salvador Dalí in 1969
- Costco's original 1976 name, Price Club
- Walmart's first store (1962, Sam Walton, Arkansas)
- CVS's acronym standing for "Consumer Value Stores"
- Victoria's Secret founder Roy Raymond's motivation (embarrassed buying lingerie for his wife)
- Gap's name referencing "the generation gap"
- Volvo's name translating to "I roll" in Latin
- Mazda founder Jujiro Matsuda's name (whether asked directly or via the "Toyo Cork Kogyo" original company name)
- Lamborghini originally manufacturing tractors before Ferruccio Lamborghini founded the sports car brand
- Ferrari's Prancing Horse logo originating from WWI pilot Francesco Baracca's plane emblem
- Google's original internal nickname/project name, BackRub
- Spotify's co-founders, Daniel Ek and Martin Lorentzon
- Wendy's founding by Dave Thomas (named after his daughter) and its 1984 "Where's the beef?" slogan
- McDonald's majority stake in Chipotle (1998-2006)
- Microsoft's founding by Bill Gates and Paul Allen (1975)
- Jaguar's leaping-cat logo
- RCA/Victor's "His Master's Voice" mascot dog, Nipper
- Barbie's creator, Ruth Handler (1959)
- J.C. Penney's origin as a Kemmerer, Wyoming dry goods store (1902)
- American Express's "Don't leave home without it" slogan
- Nescafé, introduced by Nestlé in 1938
- Elon Musk's X.com (1999, merged into PayPal)
- Oprah Winfrey's OWN network (2011)
- Mattel, founded 1945 by Matt Matson and Elliot Handler (name blend), and its Intellivision game console (1979)
- Commodore 64 (1982) and Atari Jaguar (1993)
- NBC's peacock logo (1956, for color broadcasting)
- Facebook's Poke app (2013, a Snapchat competitor) and Twitter's Periscope app (2015)
- BMW's 1916 founding as an aircraft engine manufacturer
- HD DVD losing the format war to Blu-ray (2008)
- TikTok's 2018 US merger with Musical.ly (either direction: "what was TikTok originally called" or "what app did TikTok merge with")
- The original retail price of the Apple I computer at launch in 1976 ($666.66)
- Coca-Cola's founding by pharmacist John Pemberton (1886)
- Sony's original 1946 name, Tokyo Tsushin Kogyo
- Adidas and Puma founders Adi and Rudolf Dassler being brothers (the Dassler Brothers Shoe Factory split)
- Instagram's original check-in app name, Burbn
- Slack's origin as an internal tool built from the cancelled game Glitch (either angle: the game's name or the company/founders behind it)
- Virgin's name origin — Richard Branson and partners considering themselves business "virgins" (asked about Virgin Records specifically, but the same fact applies to the wider Virgin brand)
- The PalmPilot (1996) and Palm's later webOS (2009)
- Taco Bell's talking Chihuahua ad campaign
- Diamond Multimedia's Rio PMP300 (1998) and the resulting digital-music legal battle
- Suzuki's origin as a weaving-loom manufacturer (1909)
- MySpace, founded by Tom Anderson and Chris DeWolfe (2003)
- Sony's Walkman (1979) and the Nintendo Entertainment System (1985)
- Burberry's gabardine fabric origin (1856)
- Gatorade's 1965 University of Florida origin
- Fisker Automotive, founded by Henrik Fisker (2007, bankrupt 2013)
- Hasbro's original name, Hassenfeld Brothers (1923)
- Kleenex's WWI gas-mask-filter origin
- The Trabant's Duroplast body
- Ralph Lauren's polo-player logo
- Jacob Schick's 1928 electric razor patent
- Second Life (Linden Lab, 2003)
- 3M's original name, Minnesota Mining and Manufacturing Company (1902)
- Honda's ASIMO robot (2000)

CAUTION — verify precise founding names/dates via web search rather than memory for corporate-history "original name" questions: a 2026-08-01 batch had to cut a Canon question that conflated its 1933 lab name ("Precision Optical Instruments Laboratory") with its differently-named 1937 incorporation, and had to fix an MSN Direct question that said the service "shut down in 2008" when only the SPOT watches were discontinued that year — the underlying data service actually ran until 2011/2012. Also watch for the same fact tested in both directions within one batch (e.g. "which company made Surge" and "what was Coca-Cola's anti-Mountain- Dew soda called" are the same fact, not two) and for a specific product name applied anachronistically to an earlier event (e.g. calling 1873's riveted jeans "Levi's 501" — the 501 lot number wasn't used until ~1890).

Output just the JS file content, nothing else.
```
