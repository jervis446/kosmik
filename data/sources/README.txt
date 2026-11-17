amidha-herbs.json: Amidha Ayurveda Herb Database v2.0 by Sparsh Varshney,
https://github.com/sciencewithsaucee-sudo/herb-database, licensed CC BY 4.0 (amidha-herbs.LICENSE).
Kept unmodified here; the changes Kosmik makes are listed in data/scripts/build-herbs.ts.

Shanti passages (data/passages.json) are chosen from public-domain translations, word for word:
- The Mahabharata, tr. Kisari Mohan Ganguli (1883–1896), public domain (translator d. 1908).
  Project Gutenberg eBooks 15474–15477. The raw texts are not kept in git; fetch them with:
    mkdir -p data/sources/raw/mahabharata-ganguli
    for n in 15474 15475 15476 15477; do curl -s -o data/sources/raw/mahabharata-ganguli/pg$n.txt https://gutenberg.pglaf.org/cache/epub/$n/pg$n.txt; done
  Only the translators' public-domain wording is used; Project Gutenberg's header, footer and
  name are not reproduced.
- The Ramayana, tr. Ralph T. H. Griffith (1870–1874), public domain (d. 1906). Gutenberg eBook 24869.
- The Upanishads (Isa, Katha, Kena), tr. Swami Paramananda (1919), public domain (d. 1940). Gutenberg
  eBook 3283. (Max Müller's Sacred Books of the East scans were too garbled to quote word for word.)
- The Yoga-Vasishtha Maharamayana, tr. Vihari-Lala Mitra (1891–1899), public domain. Vol. 3 part 2 is
  Gutenberg eBook 46531; vols. 2 and 4 are Internet Archive scans, used only where every word reads
  cleanly (vol. 1's scan is too poor to use).
  Fetch:
    mkdir -p data/sources/raw/ramayana-griffith data/sources/raw/upanishads-paramananda data/sources/raw/yoga-vasishtha-mitra
    curl -s -o data/sources/raw/ramayana-griffith/pg24869.txt https://gutenberg.pglaf.org/cache/epub/24869/pg24869.txt
    curl -s -o data/sources/raw/upanishads-paramananda/pg3283.txt https://gutenberg.pglaf.org/cache/epub/3283/pg3283.txt
    curl -s -o data/sources/raw/yoga-vasishtha-mitra/pg46531.txt https://gutenberg.pglaf.org/cache/epub/46531/pg46531.txt
    curl -sL -o data/sources/raw/yoga-vasishtha-mitra/vol2_djvu.txt https://archive.org/download/yogavasishthamah0002unse/yogavasishthamah0002unse_djvu.txt
    curl -sL -o data/sources/raw/yoga-vasishtha-mitra/vol4_djvu.txt https://archive.org/download/in.ernet.dli.2015.96046/2015.96046.The-Yoga-vasishtha-maharamayana-Of-Valmikivol4_djvu.txt
Then build: GEMINI_API_KEY=… node data/scripts/build-passages.ts
