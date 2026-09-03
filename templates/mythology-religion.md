## Mythology & Religion

```
You are drafting trivia questions for a multiple-choice trivia app. You have no access to my codebase — just generate the content below and I'll hand it to another AI to review, dedupe, and merge into the database myself.

TOPIC: Mythology & Religion — gods, myths, and legends from any culture (Greek, Norse, Egyptian, Hindu, etc.), plus world religions, their figures, texts, and practices.

COUNT: 200 questions.

AVOID THESE ANGLES — already well-covered in my question bank, so don't draft facts that overlap with these (pick different, more specific facts instead):
- Name of Thor's hammer in Norse mythology (Mjölnir)
- Icarus flying too close to the sun on wax-and-feather wings
- Egyptian sun god depicted with a falcon head (Ra); Egyptian god of wisdom/writing/moon with an ibis head (Thoth)
- Which bodhisattva/goddess is Avalokiteshvara/Guanyin — this equivalence fact gets tested from both the Sanskrit-name and Chinese-name direction, treat as a closed pair (the "1,000 arms" iconography detail is still a distinct, open fact)
- Islamic month of fasting from dawn to sunset (Ramadan) — including the "precedes Shawwal" phrasing, same fact
- Which Greek goddess sprang fully armed from Zeus's head (Athena)
- Christian holiday commemorating the resurrection of Jesus (Easter)
- Which Yoruba orisha is the trickster/messenger — avoid phrasing this as "syncretized with Eshu" while the answer IS Eshu, that's self-contradictory
- Odin's hall Valhalla having 540 doors — don't frame this as "name of Odin's hall in Valhalla," Valhalla IS the hall, not a container of another hall
- Sisyphus condemned to roll a boulder uphill forever in Tartarus
- Which Titaness is the mother of Helios, Selene, and Eos (Theia)
- Name of Odin's eight-legged horse (Sleipnir)
- Name of Odin's spear that never misses its target (Gungnir)
- Which Japanese thunder god is paired with wind god Fujin (Raijin)
- Which Roman god is the equivalent of Greek Zeus (Jupiter)
- Which Aztec feathered serpent god is associated with wind/learning (Quetzalcoatl)
- Which Inca sun god is ancestor of the Sapa Inca emperors (Inti)
- Islamic Night of Power when the Quran was first revealed (Laylat al-Qadr)
- Persephone abducted by Hades / pomegranate seeds binding her to the underworld
- Scylla and Charybdis, the Sirens, Ariadne's thread, Jason/Medea and the Golden Fleece (Colchis)
- Heracles' individual labors (Nemean Lion's impervious hide, Hydra's regrowing heads, Augean stables)
- Ajax's madness/suicide, Cassandra's curse, Laocoön and the sea serpents, Calypso holding Odysseus
- Chiron the wise centaur, Ganymede's abduction, Endymion's eternal sleep, Adonis killed by a boar
- The nine Muses (and Calliope = epic poetry), the three Graces/Charites, Prometheus's liver eaten daily
- Deucalion's flood, Cadmus founding Thebes/dragon's teeth, Narcissus's reflection, Pygmalion and Galatea
- The Norns (Urd/Verdandi/Skuld), Valkyries' role, Aegir and Ran, Sif's golden hair, Skadi, Gerd, Mimir's head
- Norse berserkers/draugr/Yule, Vafthrudnir's contest with Odin, Baldr's ship funeral, Hermod's ride to Hel, Kvasir/Mead of Poetry, Freyja's cats
- Amun/Amun-Ra, Nephthys, Apep the chaos serpent, Khepri the scarab, Atum, Shu/Tefnut, Hapi, canopic jars, Khufu's pyramid, the Sphinx as Khafre, the Ennead, obelisks dedicated to Ra
- Kali vs. Durga (skull garland vs. Mahishasura-slaying), Vishnu's individual avatars (Matsya, Kurma, Varaha, Narasimha, Parashurama), Holika and Holi's origin, chakras, Upanishads, Puranas, Char Dham, Ganesh Chaturthi, Rangoli, Krishna lifting Govardhan
- Buddhism's three vehicles (Theravada/Mahayana/Vajrayana), Dalai Lama, stupas, mandalas, Bodh Gaya, prayer wheels, the Middle Way, Sangha, the Three Jewels, Zen koans
- Bar mitzvah age, kashrut, mezuzah, Seder maror symbolism, the ten plagues' finale, golems, dreidels, the Western Wall, Isaiah, Tu BiShvat
- Jesus's water-into-wine miracle, the Good Samaritan's significance, Vatican City, Lent, Advent, the Eucharist, David and Goliath's sling, Samson's hair, Jonah and the fish, the Tower of Babel, Lot's wife, the Book of Job
- The Sunni/Shia succession split, the caliphate, Eid al-Fitr vs. Eid al-Adha, the Dome of the Rock, the Hijra to Medina, Ibrahim as shared patriarch, the Qibla
- Aztec Tlaloc/Mictlantecuhtli/Xipe Totec/Coatlicue; Maya Chaac/Ixchel/Itzamna/Camazotz; Inca Viracocha/Mama Quilla
- Tuatha Dé Danann, the Dagda's club, Brigid, Epona, Cernunnos's antlers, the Battle of Mag Tuired
- Slavic Perun/Veles rivalry, Baba Yaga's chicken-leg hut, Koschei's hidden death, rusalka
- Yoruba Shango/Obatala/Ogun, Anansi winning all stories, Akan Nyame, Dahomey Mawu-Lisa (sun/moon)
- Coyote/Raven as tricksters, the Thunderbird's thunder/lightning, White Buffalo Calf Woman, Kokopelli
- Romulus and Remus's she-wolf, the Vestal Virgins' sacred flame, Lares and Penates, Bacchus = Dionysus, Roman augury, Terminus/Terminalia
- MAINTENANCE NOTE (2026-09-03, accessible-difficulty batch): bare "who is the god/goddess of X" identity questions for major deities are almost all taken — the accessible facts a casual-drafting pass reaches for are exactly what's already been mined, largely into `general.json` specifically (a `general`-derived category's easy chestnuts often live in the sibling `general.json` file, not the target category file — check both, and note `check-draft.js --full-answer-audit` silently skips any answer under 6 characters, which is most god names, so short answers need a manual full-corpus grep by hand regardless of what audit passes clean). Confirmed-taken bare-identity/symbol facts, by tradition — don't redraft these, but a *different specific fact* about the same named figure (a myth detail, a narrative event, a distinguishing attribute) is still fair game:
  - Greek: Hermes as winged messenger; Apollo as Artemis's twin, god of music/prophecy/sun; Demeter as harvest goddess; Dionysus as wine/revelry god; Hephaestus as lame blacksmith god; Mount Olympus as home of the twelve gods; Cerberus guarding Hades; Perseus killing Medusa; Helen of Troy's abduction starting the war; the River Styx as the underworld river; Hera as queen/wife of Zeus; Nike as victory goddess; Gaia personifying Earth; Zeus as king of the gods; Echo cursed to repeat last words
  - Roman: Neptune=Poseidon, Mercury as messenger god, Saturn/Saturday, Mars/March, Janus/January (all four god-gives-day/month-its-name etymologies are taken, not just Saturday), Virgil wrote the Aeneid, Venus=Aphrodite equivalence
  - Norse: Asgard as home of the gods, Fenrir killing Odin at Ragnarok, Loki as trickster/shapeshifter, Frigg as Odin's wife/queen of Asgard, Tyr sacrificing his hand to bind Fenrir (both the "which god loses a hand" and "Tyr/Tuesday" etymology framings)
  - Egyptian: Anubis as jackal-headed god, Bastet as cat goddess/home protector, Osiris murdered by Set / Set as chaos god and Osiris's rival, Isis as magic/motherhood goddess (mother of Horus), Horus as falcon-headed sky/kingship god, Nut as sky goddess arching over Geb
  - Hindu: Vishnu as "the Preserver," Diwali as the festival of lights (asked at least twice already, fully saturated), Hanuman as devoted monkey god in the Ramayana, Ravana kidnapping Sita, the Ganges as the sacred river, Om as the sacred syllable
  - Buddhist: the Bodhi tree as the enlightenment site, Nirvana as liberation from rebirth
  - Judaism: Passover commemorating the Exodus, Yom Kippur as the Day of Atonement, a synagogue as the house of worship, the Guru Granth Sahib framing is Sikh not Jewish — see Sikhism below
  - Christianity: Judas Iscariot's betrayal for thirty pieces of silver, baptism as the water rite, Gabriel announcing Jesus's birth to Mary, Mount Ararat as the Ark's resting place
  - Islam: Zakat as charitable giving (one of the Five Pillars)
  - Sikhism: a gurdwara as the place of worship, the Guru Granth Sahib as the eternal living Guru scripture
  - Shinto: a torii gate marking a shrine entrance
  - Chinese: Confucius's teachings on morality/social harmony

Use web search to verify every fact — do not rely on memory alone. Prefer authoritative sources (encyclopedic sources, religious/mythological references) over guessing. For each question, actually find the fact via search rather than recalling it, especially for obscure details (lesser- known figures, specific texts).

If any fact involves a "current record," "most," "latest," or similar superlative, pin it to a specific time (e.g. "as of 2026") rather than stating it as a timeless fact, since these claims go stale.

OUTPUT FORMAT: A single JavaScript file, CommonJS style, like this:

module.exports = [
  {
    "difficulty": "easy" | "medium" | "hard",
    "category": "mythology-religion",
    "question": "What is...?",
    "options": ["Correct answer", "Wrong option 1", "Wrong option 2", "Wrong option 3"],
    "answer": "Correct answer"
  },
  ...
];

Rules for each entry:
- Do NOT include an "id" field — I'll assign that myself.
- Every entry MUST include "category": "mythology-religion" exactly as written (all lowercase, with the hyphen) — don't vary it, translate it, or use the topic name instead.
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
