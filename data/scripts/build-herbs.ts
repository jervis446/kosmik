/**
 * Builds Kosmik's herb library from the Amidha Ayurveda Herb Database v2.0
 * (Sparsh Varshney, CC BY 4.0, github.com/sciencewithsaucee-sudo/herb-database), kept as-is in
 * data/sources/amidha-herbs.json.
 *
 * Changes made by Kosmik (CC BY 4.0 asks for them to be indicated):
 * - The short descriptions are rewritten by Gemini as traditional use only: no cures,
 *   treatments, diseases, dosages or modern health claims. A rewrite that fails the checks is
 *   replaced by a plain description built from the herb's properties.
 * - "tridosha" in the pacify list is expanded to Vata, Pitta and Kapha.
 * - Two controlled plants (opium poppy, cannabis) are left out; plants that classical texts
 *   class as poisonous get a caution line.
 * - Indications and actions (therapeutic claims) are not used.
 *
 * Writes data/herbs.json (the library), data/herb-meanings.json (one meaning per herb for
 * retrieval) and api/src/lib/herb-index.ts (names the Worker recognises in questions).
 * Rewrites are cached in data/raw/herb-descriptions.json, so re-running only writes new ones.
 *
 * Usage: GEMINI_API_KEY=... node data/scripts/build-herbs.ts [--no-ai]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { DEFAULT_CHAT_MODEL } from '../../api/src/ai.ts';
import { contentProblems } from '../../api/src/lib/safety.ts';
import { gemini } from './gemini.ts';

type Source = {
  name: string;
  botanical_name: string;
  family: string;
  english_name: string;
  sanskrit_synonyms: string[];
  part_used: string[];
  link: string;
  preview: string;
  pacify: string[];
  aggravate: string[];
  rasa: string[];
  guna: string[];
  virya: string;
  vipaka: string;
};

export type Dosha = 'vata' | 'pitta' | 'kapha';

export type Herb = {
  key: string;
  name: string;
  english: string;
  botanical: string;
  family: string;
  synonyms: string[];
  parts: string[];
  rasa: string[];
  guna: string[];
  virya: string;
  vipaka: string;
  pacify: Dosha[];
  aggravate: Dosha[];
  description: string;
  caution: boolean;
  link: string;
};

const root = new URL('../', import.meta.url);
const EXCLUDED = new Set(['Ahiphena', 'Bhanga']);
/** Classed as poisonous (visha / upavisha) in classical texts: used only after purification. */
const POISONOUS = new Set(['Vatsanabha', 'Bhallataka', 'Jayapala', 'Gunja', 'Karavira', 'Langali', 'Dhattura', 'Visha Tinduka', 'Snuhi', 'Arka', 'Alarka', 'Prativisha']);

/** Everyday Hindi and English names people type, beyond those in the source. */
const COMMON_NAMES: Record<string, string[]> = {
  ardraka: ['ginger', 'adrak'],
  shunthi: ['saunth', 'sonth', 'sounth'],
  kamala: ['lotus', 'kamal'],
  jeeraka: ['cumin', 'jeera', 'jira'],
  dhanyaka: ['dhaniya', 'dhania'],
  haridra: ['haldi'],
  maricha: ['kali mirch', 'black pepper'],
  pippali: ['pipli', 'long pepper'],
  yastimadhu: ['mulethi', 'mulethi', 'mulhatti', 'liquorice'],
  rasona: ['lahsun', 'lehsun'],
  tulsi: ['tulasi'],
  amla: ['amalaki', 'awla', 'aonla', 'amla fruit'],
  giloy: ['guduchi'],
  ashwagandha: ['asgandh'],
  methi: ['fenugreek'],
  ela: ['elaichi', 'cardamom'],
  lavanga: ['laung', 'clove', 'cloves'],
  twak: ['dalchini'],
  kumkuma: ['kesar'],
  haritaki: ['harad', 'harada', 'harde'],
  bibhitaki: ['baheda', 'bahera'],
  bhringraj: ['bhringraja'],
  brahmi: ['brahmi booti'],
  shatavari: ['satavar'],
  arjuna: ['arjun'],
  chandana: ['chandan', 'sandalwood'],
  hingu: ['hing', 'asafoetida'],
  kumari: ['aloe vera', 'aloe', 'gwarpatha'],
};

/** Words a herb description must not use, on top of Kosmik's general content rules. */
export const HERB_CLAIMS =
  /\b(cures?|curing|treat(s|ed|ing|ment|ments)?|heal(s|ed|ing)?|remed(y|ies)|boost(s|ed|ing)?|prevent(s|ed|ing|ion)?|fights?|combat(s|ing)?|dose|doses|dosage|mg|grams?|teaspoons?|tablets?|capsules?|diabet\w*|cancer\w*|tumou?rs?|infections?|vitamins?|immun\w*|disorders?|clinical\w*|proven|scientific\w*|antibiotic|antiviral|antibacterial|anti-inflammatory|blood sugar|cholesterol|pressure)\b/i;

export function herbProblems(text: string): string[] {
  const problems = contentProblems(text);
  const claim = HERB_CLAIMS.exec(text);
  if (claim) problems.push(`claim: ${claim[0]}`);
  const words = text.trim().split(/\s+/).length;
  if (words < 20) problems.push('too short');
  if (words > 90) problems.push('too long');
  return problems;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const DOSHAS: Dosha[] = ['vata', 'pitta', 'kapha'];
function doshas(list: string[]): Dosha[] {
  const set = new Set<Dosha>();
  for (const d of list.map((x) => x.toLowerCase().trim())) {
    if (d === 'tridosha') DOSHAS.forEach((x) => set.add(x));
    else if ((DOSHAS as string[]).includes(d)) set.add(d as Dosha);
  }
  return DOSHAS.filter((d) => set.has(d));
}

const cap = (d: string) => d[0].toUpperCase() + d.slice(1);
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const VIRYA: Record<string, string> = { Ushna: 'heating (ushna)', Sheeta: 'cooling (sheeta)' };

/** The fallback description: only what the properties say. */
export function plainDescription(h: Omit<Herb, 'description'>): string {
  const parts = [
    `In Ayurveda, ${h.name}${h.english ? ` (${h.english})` : ''} is described as ${list(h.rasa.map((r) => r.toLowerCase()))} in taste (rasa)${h.guna.length ? ` and ${list(h.guna.map((g) => g.toLowerCase()))} in quality (guna)` : ''}.`,
    `Its potency (virya) is ${VIRYA[h.virya] ?? h.virya.toLowerCase()} and its post-digestive effect (vipaka) is ${h.vipaka.toLowerCase()}.`,
  ];
  if (h.pacify.length === 3) parts.push('Classical texts describe it as balancing all three doshas.');
  else if (h.pacify.length) parts.push(`Classical texts describe it as balancing ${list(h.pacify.map(cap))}${h.aggravate.length ? ` and possibly increasing ${list(h.aggravate.map(cap))}` : ''}.`);
  return parts.join(' ');
}

const PROMPT = `You write short descriptions of Ayurvedic herbs for Kosmik, a spiritual-guidance app in India.
For each herb, write 35 to 70 words in plain English describing how Ayurveda traditionally views and uses it.
Rules, always:
- Describe traditional use only: "In Ayurveda, ... is traditionally used to support ...", "classical texts describe it as ...". Use its properties (rasa, guna, virya, vipaka, doshas).
- Never say it cures, treats, heals, prevents, fights or boosts anything. No diseases, disorders, infections, immunity, vitamins, blood sugar, cholesterol or blood pressure. No modern scientific or clinical claims.
- No doses, quantities, preparations to make at home, or instructions to take it.
- Do not mention poison or toxicity (Kosmik adds its own caution line).
- Neutral, factual tone. No marketing words, no exclamation marks.
Reply with JSON only: {"items": [{"key": "...", "description": "..."}]}.`;

async function rewrite(batch: (Omit<Herb, 'description'> & { preview: string })[], stricter: boolean): Promise<Record<string, string>> {
  const input = batch.map((h) => ({
    key: h.key,
    name: h.name,
    english: h.english,
    botanical: h.botanical,
    rasa: h.rasa,
    guna: h.guna,
    virya: h.virya,
    vipaka: h.vipaka,
    balances: h.pacify,
    may_increase: h.aggravate,
    parts_used: h.parts,
    original_summary: h.preview,
  }));
  const out = await gemini<{ choices?: { message?: { content?: string } }[] }>('/chat/completions', {
    model: DEFAULT_CHAT_MODEL,
    reasoning_effort: 'none',
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: PROMPT },
      { role: 'user', content: `${stricter ? 'Your previous descriptions broke the rules. Follow every rule strictly.\n' : ''}${JSON.stringify(input)}` },
    ],
  });
  const text = out.choices?.[0]?.message?.content ?? '{}';
  const items = (JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { items?: { key: string; description: string }[] }).items ?? [];
  return Object.fromEntries(items.map((i) => [i.key, String(i.description ?? '').trim()]));
}

async function main() {
  const useAi = !process.argv.includes('--no-ai');
  const source: Source[] = JSON.parse(readFileSync(new URL('sources/amidha-herbs.json', root), 'utf8'));
  const seen = new Set<string>();
  const herbs = source
    .filter((s) => !EXCLUDED.has(s.name))
    .map((s) => {
      let key = slug(s.name);
      while (seen.has(key)) key += '-2';
      seen.add(key);
      const link = s.link.startsWith('http') ? s.link : `https://www.amidhaayurveda.com${s.link.startsWith('/') ? '' : '/'}${s.link}`;
      return {
        key,
        name: s.name.trim(),
        english: s.english_name.trim(),
        botanical: s.botanical_name.trim(),
        family: s.family.trim(),
        synonyms: s.sanskrit_synonyms.map((x) => x.trim()).filter(Boolean),
        parts: s.part_used.map((x) => x.trim()).filter(Boolean),
        rasa: s.rasa,
        guna: s.guna,
        virya: s.virya,
        vipaka: s.vipaka,
        pacify: doshas(s.pacify),
        aggravate: doshas(s.aggravate).filter((d) => !doshas(s.pacify).includes(d)),
        caution: POISONOUS.has(s.name.trim()),
        link,
        preview: s.preview,
      };
    });

  const cachePath = new URL('raw/herb-descriptions.json', root);
  mkdirSync(new URL('raw/', root), { recursive: true });
  const cache: Record<string, string> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
  if (useAi) {
    const todo = herbs.filter((h) => !cache[h.key]);
    for (let i = 0; i < todo.length; i += 20) {
      const batch = todo.slice(i, i + 20);
      let got = await rewrite(batch, false);
      const bad = batch.filter((h) => !got[h.key] || herbProblems(got[h.key]).length);
      if (bad.length) got = { ...got, ...(await rewrite(bad, true)) };
      for (const h of batch) if (got[h.key] && !herbProblems(got[h.key]).length) cache[h.key] = got[h.key];
      writeFileSync(cachePath, JSON.stringify(cache, null, 1) + '\n');
      process.stdout.write(`\r${Math.min(i + 20, todo.length)}/${todo.length} rewritten`);
    }
    if (todo.length) console.log();
  }

  let fallbacks = 0;
  const out: Herb[] = herbs.map(({ preview: _preview, ...h }) => {
    const ai = cache[h.key];
    const description = ai && !herbProblems(ai).length ? ai : (fallbacks++, plainDescription(h));
    return { ...h, description };
  });
  writeFileSync(new URL('herbs.json', root), JSON.stringify(out, null, 1) + '\n');

  // One meaning per herb, so questions about herbs find them by meaning (RAG and citations).
  const meanings = out.map((h) => ({
    kind: 'herb',
    key: h.key,
    lang: 'en',
    title: `${h.name}${h.english ? ` (${h.english})` : ''}`,
    body: `${h.description} Botanical name ${h.botanical}. Rasa ${h.rasa.join(', ')}; guna ${h.guna.join(', ')}; virya ${h.virya}; vipaka ${h.vipaka}. Balances ${h.pacify.map(cap).join(', ') || 'none listed'}${h.aggravate.length ? `; may increase ${h.aggravate.map(cap).join(', ')}` : ''}.`,
    reviewed: false,
  }));
  writeFileSync(new URL('herb-meanings.json', root), JSON.stringify(meanings, null, 1) + '\n');

  // Names the Worker recognises. Main names first, so a synonym never hides another herb's name.
  const index = out.map((h) => {
    const names = [...(COMMON_NAMES[h.key] ?? []), h.name, ...(h.name.match(/\(([^)]+)\)/g) ?? []).map((m) => m.slice(1, -1)), h.name.replace(/\s*\(.*?\)\s*/g, ' ').trim(), h.english, h.botanical];
    const aliases = [...new Set(names.map((n) => n.toLowerCase().trim()).filter((n) => n.length >= 3))];
    const synonyms = [...new Set(h.synonyms.map((n) => n.toLowerCase()).filter((n) => n.length >= 4 && !aliases.includes(n)))];
    return [h.key, aliases, synonyms];
  });
  writeFileSync(
    new URL('../api/src/lib/herb-index.ts', root),
    `// Generated by data/scripts/build-herbs.ts from the Amidha Ayurveda Herb Database v2.0 (CC BY 4.0). Do not edit.\n` +
      `/** [key, names (name, English, botanical), Sanskrit synonyms] */\n` +
      `export const HERB_INDEX: [string, string[], string[]][] = ${JSON.stringify(index)};\n`,
  );
  const unknown = Object.keys(COMMON_NAMES).filter((k) => !out.some((h) => h.key === k));
  if (unknown.length) console.log(`Common names for herbs not in the library (ignored): ${unknown.join(', ')}`);
  console.log(`${out.length} herbs (${out.length - fallbacks} rewritten by AI, ${fallbacks} from properties), ${out.filter((h) => h.caution).length} with a caution line`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
