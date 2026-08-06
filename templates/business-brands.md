## Business & Brands

```
You are drafting trivia questions for a multiple-choice trivia app. You have no access to my codebase — just generate the content below and I'll hand it to another AI to review, dedupe, and merge into the database myself.

TOPIC: Business & Brands — company logos, slogans, founders/founding stories, and famous product flops. Focus on consumer brands most people interact with regularly (retail, food, tech, cars, apparel, etc.), not obscure B2B companies or finance/economics theory.

COUNT: 200 questions.

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
- Harley-Davidson's 1990s cologne flop ("Hot Road," "Legend")
- Cosmopolitan magazine's 1999 low-fat yogurt line
- Microsoft Bob (1995, cartoon dog Rover, virtual-house interface)
- The Apple Lisa (1983, ~$10,000, first commercial GUI computer, flopped)
- Dunkin' Donuts' original 1948 name, "Open Kettle" (founder William Rosenberg)
- Cisco Systems' logo's vertical blue lines representing the Golden Gate Bridge
- Trader Joe's founder Joe Coulombe's prior convenience-store chain, "Pronto Markets" (renamed 1967)
- Toyota's pre-automotive business manufacturing automatic looms
- Marriott's 1927 origin as an A&W Root Beer stand (J. Willard Marriott, Washington D.C.)
- 7-Up's original name, Bib-Label Lithiated Lemon-Lime Soda
- Dr Pepper being invented/first served in Waco, Texas
- Mountain Dew's original purpose as a whiskey mixer/chaser
- Fanta being invented in Germany during WWII due to a Coca-Cola syrup embargo
- Grace Hopper popularizing the term "bug" after finding a moth
- Nupedia as the peer-reviewed encyclopedia that preceded/inspired Wikipedia
- The VW Beetle's original German name, KdF-Wagen
- Crocs' original marketing as a boating shoe
- Oakley's first product being motorcycle grips
- New Balance's original 1906 product being arch supports
- Skechers founder Robert Greenberg's prior company, L.A. Gear
- Lululemon founder Chip Wilson's reasoning for the name (Japanese consumers struggling with the letter "L")
- Dr. Martens being invented after Klaus Maertens injured his foot skiing
- Ray-Ban Aviators being commissioned for U.S. Army Air Corps pilots
- ASICS' name as an acronym for the Latin "a sound/healthy mind in a sound/healthy body"
- Apple's bitten-logo design avoiding confusion with a cherry
- The bear hidden in the Toblerone logo
- Twitter's blue bird logo being named after Larry Bird
- The IKEA acronym's letters standing for founder Ingvar Kamprad's name, farm, and hometown
- Kmart's original corporate name, S.S. Kresge
- 7-Eleven's original name, Tote'm Stores
- De Beers' "A Diamond Is Forever" slogan being written by Frances Gerety
- Wheaties as the cereal behind "Breakfast of Champions"
- Nike's "Just Do It" slogan being inspired by death-row inmate Gary Gilmore's last words
- Cisco being named after San Francisco
- What "Sega" stands for (Service Games)
- Adobe being named after Adobe Creek behind co-founder John Warnock's house
- Fisher-Price's founders Herman Fisher and Irving Price
- Crayola's name combining "craie" (chalk) with a suffix meaning oily/oleaginous
- Slinky inventor Richard James's profession as a naval engineer
- Etch A Sketch's original French name, L'Écran Magique ("The Magic Screen")
- Scrabble's original name, Criss-Crosswords
- Monopoly's predecessor (The Landlord's Game) being designed to teach the evils of monopolies
- Baskin-Robbins' "31 flavors" meaning one flavor per day of the month
- Jack in the Box's original name, Oscar's
- Justin Timberlake being paid ~$6 million to sing/perform McDonald's "I'm Lovin' It" jingle/falsetto hook (2003) — a drafting-agent loop asked this same fact 3 separate ways in one batch
- McDonald's product/mascot history, now also covered: original 1963 mascot Speedee (a winking chef, predates Ronald), the 1962 Filet-O-Fish (aimed at Catholics abstaining from meat on Fridays), the 1972 Egg McMuffin (invented by franchisee Herb Peterson), and the 1967 Big Mac (created by franchisee Jim Delligatti in Uniontown, PA)
- KFC founder Colonel Sanders starting to franchise at age 65, door-to-door
- Domino's "30-minute delivery guarantee or it's free" (US, 1979-1993)
- Chick-fil-A being closed on Sundays, founded 1967
- Dunkin' Donuts dropping "Donuts" from its name/rebranding (announced Sept. 2018, rolled out Jan. 2019)
- The Hermès Birkin bag's 1984 origin story (Jane Birkin on a flight)
- Converse's first athlete endorsement, Chuck Taylor (1921)
- Canada Goose's original name, Metro Sportswear
- What "TOMS" (shoes) stands for/originates from
- Adidas's trefoil logo debuting at the 1971 Munich Olympics (don't confuse with the later three-stripes-only logo)
- UGG boots being trademarked in the US in 1985 despite older Australian surf-culture origins
- Balenciaga's 1919 founding city (San Sebastián, Spain) by Cristóbal Balenciaga
- Magic Leap's AR headset flop (raised $2.7B, ~$2,300 headset, shut down consumer business 2020)
- Quibi, the short-form streaming flop (name from "Quick Bites," shut down Oct. 2020 after raising $1.75B)
- Amazon's other hardware flops, now also covered: the Echo Look fashion camera (2017-2020) and Facebook/Meta's Portal smart display (2018, consumer sales ended 2022)
- Twitter's Vine app shutting down in 2017 (six-second looping videos)
- Google's Project Loon (high-altitude balloon internet, 2013-2021) and Google Allo (messaging app with an AI assistant feature, 2016-2019)
- BlackBerry PlayBook tablet flop (April 2011, ~500,000 units sold) and Windows RT (2012 tablet OS restricted to Windows Store apps, doomed Surface RT)
- Nokia N-Gage, the taco-shaped gaming phone hybrid (Oct. 2003, ~3 million sold)
- The Segway's Dec. 2001 unveiling under code name "Ginger," invented by Dean Kamen
- Pebble, the Kickstarter smartwatch (2012, $43M raised) acquired and shut down by Fitbit (Dec. 2016)
- Kirkland Signature being named after Costco's original Kirkland, WA headquarters location
- Walmart retiring "Always Low Prices, Always" for "Save Money. Live Better." and Walmart's 2016 Jet.com acquisition ($3.3B)
- Amazon's smile-logo (an arrow from A to Z, introduced 2000)
- P&G/Unilever personal-care brand origin facts, now also covered: Dove Beauty Bar (1957, one-quarter moisturizing cream), L'Oréal's "Because You're Worth It" slogan (coined 1971 by 23-year-old copywriter Ilon Specht — note the correct wording is "You're," not "I'm"), Maybelline's name (founder's sister Mabel + Vaseline) and its "Maybe she's born with it" slogan debut year, Pantene's name origin (from panthenol), Head & Shoulders' launch year, Old Spice's original target gender (1937) and its acquisition by P&G, Gillette's founding of the American Safety Razor Company and its "The Best a Man Can Get" slogan debuting during a 1989 sporting event, Oil of Olay's 1952 South African founding, Estée Lauder's 1946 founding, Nivea's name (Latin "niveus," meaning snowy-white) and its blue-tin packaging introduction, Revlon's name (Revson brothers + chemist Charles Lachman's "L"), and Pond's Cream's 1846 origin as "Golden Treasure"
- Vaseline's 1859 origin: Robert Chesebrough noticing oil-rig workers using "rod wax" residue on wounds
- Bic's 1989 perfume flop that smelled like its lighters
- Under Armour's 1996 founding in Kevin Plank's grandmother's Washington D.C. basement
- eBay's original name, AuctionWeb (Pierre Omidyar, 1995)
- Pizza Hut's first location opening in Wichita, Kansas (1958, Dan and Frank Carney)
- Google Wave, the 2009-2010 real-time collaboration platform killed after low adoption
- The Atari 2600 "E.T. the Extra-Terrestrial" game cartridges buried in a New Mexico landfill (1983)
- The Samsung Galaxy Note 7's 2016 battery-fire recall
- Uber's original name at 2009 founding, UberCab
- Shopify's 2006 origin as an online snowboard store
- Porsche's rearing-horse logo being based on the Stuttgart coat of arms
- Frito-Lay's WOW! chips (1998) containing the fat substitute olestra, which caused digestive issues
- Juicero, the $400 Wi-Fi juicer mocked in 2017 after Bloomberg showed its packs could be hand-squeezed

CAUTION — verify precise founding names/dates via web search rather than memory for corporate-history "original name" questions: a 2026-08-01 batch had to cut a Canon question that conflated its 1933 lab name ("Precision Optical Instruments Laboratory") with its differently-named 1937 incorporation, and had to fix an MSN Direct question that said the service "shut down in 2008" when only the SPOT watches were discontinued that year — the underlying data service actually ran until 2011/2012. Also watch for the same fact tested in both directions within one batch (e.g. "which company made Surge" and "what was Coca-Cola's anti-Mountain- Dew soda called" are the same fact, not two) and for a specific product name applied anachronistically to an earlier event (e.g. calling 1873's riveted jeans "Levi's 501" — the 501 lot number wasn't used until ~1890).

Output just the JS file content, nothing else.
```
