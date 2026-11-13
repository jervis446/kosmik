/**
 * Answers a question in four layers, using AI only when nothing cheaper can:
 *   1. direct    — recognised questions answered from the libraries (no AI)
 *   2. exact     — the same question asked before (normalised text, hashed)
 *   3. semantic  — a question with the same meaning asked before (embeddings)
 *   4. ai        — RAG: retrieve verses and meanings, Gemini writes the answer, then it is cached
 * Answers about one person's own life are never stored in the shared cache.
 */
import type { AiClient } from './ai.ts';
import { matchIntent, type Intent } from './lib/intents.ts';
import { planFor, type Plan } from './lib/limits.ts';
import { contentProblems, HELPLINE, isCrisis } from './lib/safety.ts';
import { detectLang, type Lang, LANGS, normalizeQuestion, sha256 } from './lib/text.ts';
import { GRAHAS, ordinal, RASHIS, NAKSHATRAS, TAROT } from './lib/catalog.ts';
import { calculateChart, type Chart, describeChart } from './lib/chart.ts';
import { type Profile, type Profiles, toBirth } from './profiles.ts';
import type { AnswerCache, History, Library, Usage, VectorSearch } from './store.ts';
import { type Ayurveda, dominant, type Dosha, herbBlock, type Prakriti, prakritiBlock, prakritiLabel } from './ayurveda.ts';
import type { AskResult, Block, CacheEntry, Layer, Meaning, Verse } from './types.ts';

export const MAX_QUESTION = 500;
/**
 * Cosine similarity (gemini-embedding-2, 768 dims) above which two questions count as the same.
 * Measured: paraphrases 0.92–0.98; different questions up to 0.91 ("karma" vs "dharma" in the
 * Gita). Set above that, so a near miss costs one AI call rather than giving a wrong answer.
 */
export const SAME_MEANING = 0.93;
const VERSE_MIN = 0.45;
const MEANING_MIN = 0.5;

export type Identity = { kind: 'user'; id: string; premium: boolean } | { kind: 'guest'; subject: string };

export type Deps = {
  library: Library;
  cache: AnswerCache;
  vectors: VectorSearch;
  usage: Usage;
  history: History;
  ai: AiClient;
  profiles: Profiles;
  ayurveda: Ayurveda;
  now?: () => number;
  random?: (n: number) => number;
};

export class BadQuestion extends Error {}

const T = {
  verseIntro: { en: 'Here is the verse:', hi: 'यह रहा श्लोक:', hinglish: 'Yeh raha shlok:' },
  verseOfDay: { en: 'Your verse for today:', hi: 'आज का श्लोक:', hinglish: 'Aaj ka shlok:' },
  verseMissing: {
    en: 'The Bhagavad Gita has 18 chapters, and that verse number isn’t in our library. Try a reference like Gita 2.47.',
    hi: 'भगवद गीता में 18 अध्याय हैं, और यह श्लोक संख्या हमारी लाइब्रेरी में नहीं है। जैसे गीता 2.47 लिखकर देखें।',
    hinglish: 'Bhagavad Gita mein 18 adhyay hain, aur yeh shlok number humari library mein nahi hai. Gita 2.47 jaisa likh kar dekhiye.',
  },
  tarot: { en: 'Here are your cards. Read them as reflection, not a fixed fate.', hi: 'ये रहे आपके कार्ड। इन्हें मार्गदर्शन की तरह पढ़ें, तय भविष्य की तरह नहीं।', hinglish: 'Yeh rahe aapke cards. Inhe guidance ki tarah padhiye, fixed future ki tarah nahi.' },
  meaning: { en: 'In Vedic tradition:', hi: 'वैदिक परंपरा में:', hinglish: 'Vedic parampara mein:' },
  tarotMeaning: { en: 'In tarot:', hi: 'टैरो में:', hinglish: 'Tarot mein:' },
  needsChart: {
    en: 'That depends on your own birth chart. Personal kundli readings are coming soon: you’ll add your date, time and place of birth, and Kosmik will read your chart for you.',
    hi: 'यह आपकी अपनी जन्म कुंडली पर निर्भर करता है। व्यक्तिगत कुंडली जल्द आ रही है: आप जन्म की तारीख, समय और स्थान जोड़ेंगे और Kosmik आपकी कुंडली पढ़ेगा।',
    hinglish: 'Yeh aapki apni janam kundli par depend karta hai. Personal kundli jaldi aa rahi hai: aap janam ki date, time aur jagah add karenge aur Kosmik aapki kundli padhega.',
  },
  horoscope: {
    en: 'Daily rashifal is coming soon, written fresh for each rashi every morning. Meanwhile, ask about your rashi or a planet placement.',
    hi: 'दैनिक राशिफल जल्द आ रहा है, हर सुबह हर राशि के लिए नया। तब तक अपनी राशि या किसी ग्रह की स्थिति के बारे में पूछें।',
    hinglish: 'Daily rashifal jaldi aa raha hai, har subah har rashi ke liye naya. Tab tak apni rashi ya kisi graha placement ke baare mein poochiye.',
  },
  crisis: {
    en: 'I’m really sorry you’re feeling this way. You deserve support from a person right now. Please call Tele-MANAS, free and 24×7 in India, or reach someone you trust.',
    hi: 'मुझे बहुत दुख है कि आप ऐसा महसूस कर रहे हैं। अभी किसी इंसान से बात करना ज़रूरी है। कृपया Tele-MANAS को कॉल करें, जो भारत में मुफ़्त और 24×7 है, या किसी भरोसेमंद व्यक्ति से बात करें।',
    hinglish: 'Mujhe bahut dukh hai ki aap aisa feel kar rahe hain. Abhi kisi insaan se baat karna zaroori hai. Please Tele-MANAS ko call kariye, India mein free aur 24×7, ya kisi bharose ke insaan se baat kariye.',
  },
  limitStarter: {
    en: 'You’ve used your 11 free questions this week. They refill on Monday, or go Premium for unlimited questions.',
    hi: 'आपने इस हफ़्ते के 11 मुफ़्त सवाल पूरे कर लिए हैं। सोमवार को फिर मिलेंगे, या असीमित सवालों के लिए Premium लें।',
    hinglish: 'Aapne is hafte ke 11 free sawaal use kar liye hain. Monday ko refill honge, ya unlimited ke liye Premium lijiye.',
  },
  limitGuest: {
    en: 'You’ve used today’s 3 guest questions. Sign in with your Asanoha account for 11 free questions every week.',
    hi: 'आपने आज के 3 मेहमान सवाल पूरे कर लिए हैं। हर हफ़्ते 11 मुफ़्त सवालों के लिए अपने Asanoha अकाउंट से साइन इन करें।',
    hinglish: 'Aapne aaj ke 3 guest sawaal use kar liye hain. Har hafte 11 free sawaalon ke liye Asanoha account se sign in kijiye.',
  },
  busy: {
    en: 'Kosmik is very busy right now and couldn’t write a new answer. This question wasn’t counted. Please try again in a little while, or ask about a verse, rashi, nakshatra or tarot card.',
    hi: 'Kosmik अभी बहुत व्यस्त है और नया जवाब नहीं लिख पाया। यह सवाल गिना नहीं गया। थोड़ी देर बाद फिर कोशिश करें, या किसी श्लोक, राशि, नक्षत्र या टैरो कार्ड के बारे में पूछें।',
    hinglish: 'Kosmik abhi bahut busy hai aur naya jawaab nahi likh paaya. Yeh sawaal count nahi hua. Thodi der baad phir try kijiye, ya kisi shlok, rashi, nakshatra ya tarot card ke baare mein poochhiye.',
  },
  needsDetails: {
    en: 'To read your own chart, Kosmik needs your date, time and place of birth. Add them once and every chart question uses them. This question wasn’t counted.',
    hi: 'आपकी अपनी कुंडली पढ़ने के लिए Kosmik को जन्म की तारीख, समय और स्थान चाहिए। एक बार जोड़ें, फिर हर कुंडली सवाल में काम आएगा। यह सवाल गिना नहीं गया।',
    hinglish: 'Aapki apni kundli padhne ke liye Kosmik ko janam ki date, time aur jagah chahiye. Ek baar add kijiye, phir har kundli sawaal mein kaam aayega. Yeh sawaal count nahi hua.',
  },
  needsPalm: {
    en: 'To read your palm, Kosmik needs photos of both palms. Add them once and every palm question uses them. This question wasn’t counted.',
    hi: 'आपकी हथेली पढ़ने के लिए Kosmik को दोनों हथेलियों की फ़ोटो चाहिए। एक बार जोड़ें, फिर हर हस्तरेखा सवाल में काम आएगी। यह सवाल गिना नहीं गया।',
    hinglish: 'Aapki hatheli padhne ke liye Kosmik ko dono hatheliyon ki photo chahiye. Ek baar add kijiye, phir har palm sawaal mein kaam aayegi. Yeh sawaal count nahi hua.',
  },
  chartIntro: { en: 'From your birth chart:', hi: 'आपकी जन्म कुंडली से:', hinglish: 'Aapki janam kundli se:' },
  palmIntro: { en: 'Your palm, as palmistry reads it:', hi: 'हस्तरेखा शास्त्र के अनुसार आपकी हथेली:', hinglish: 'Hast rekha ke hisaab se aapki hatheli:' },
  palmRetake: {
    en: 'I couldn’t see the lines clearly enough in your saved palm photos. Please replace them. This question wasn’t counted.',
    hi: 'आपकी सहेजी गई फ़ोटो में रेखाएँ साफ़ नहीं दिखीं। कृपया फ़ोटो बदलें। यह सवाल गिना नहीं गया।',
    hinglish: 'Aapki saved photos mein lines saaf nahi dikhi. Please photos badaliye. Yeh sawaal count nahi hua.',
  },
  palmNote: {
    en: 'Palmistry is for reflection, not prediction.',
    hi: 'हस्तरेखा आत्मचिंतन के लिए है, भविष्यवाणी के लिए नहीं।',
    hinglish: 'Palmistry reflection ke liye hai, prediction ke liye nahi.',
  },
  herbIntro: { en: 'In Ayurveda:', hi: 'आयुर्वेद में:', hinglish: 'Ayurveda mein:' },
  herbMissing: {
    en: 'That herb isn’t in Kosmik’s herb library yet. Try another name, or ask which herbs balance Vata, Pitta or Kapha.',
    hi: 'यह जड़ी-बूटी अभी Kosmik की लाइब्रेरी में नहीं है। कोई और नाम आज़माएँ, या पूछें कि कौन सी जड़ी-बूटियाँ वात, पित्त या कफ को संतुलित करती हैं।',
    hinglish: 'Yeh jadi-buti abhi Kosmik ki library mein nahi hai. Koi aur naam try kijiye, ya poochhiye ki kaun si herbs Vata, Pitta ya Kapha balance karti hain.',
  },
  herbHealth: {
    en: 'Kosmik shares Ayurveda as traditional knowledge, so it can’t say whether a herb helps a health problem, or how much to take. Please ask a doctor or a qualified Ayurvedic practitioner (vaidya), and don’t stop any medicine you’ve been prescribed.',
    hi: 'Kosmik आयुर्वेद को पारंपरिक ज्ञान के रूप में बताता है, इसलिए यह नहीं बता सकता कि कोई जड़ी-बूटी किसी स्वास्थ्य समस्या में मदद करेगी या कितनी लेनी है। कृपया डॉक्टर या योग्य वैद्य से पूछें, और डॉक्टर की दी हुई कोई दवा बंद न करें।',
    hinglish: 'Kosmik Ayurveda ko traditional knowledge ki tarah batata hai, isliye yeh nahi bata sakta ki koi jadi-buti kisi health problem mein madad karegi ya kitni leni hai. Please doctor ya qualified vaidya se poochhiye, aur doctor ki di hui koi dawai band mat kijiye.',
  },
  herbList: {
    en: 'Herbs Ayurveda describes this way. Tap one to learn more.',
    hi: 'आयुर्वेद इन जड़ी-बूटियों को ऐसा बताता है। किसी एक पर टैप करके और जानें।',
    hinglish: 'Ayurveda in herbs ko aisa batata hai. Kisi ek par tap karke aur jaaniye.',
  },
  needsPrakriti: {
    en: 'To answer from your own prakriti, Kosmik needs your dosha quiz. It takes about two minutes and is saved for next time. This question wasn’t counted.',
    hi: 'आपकी अपनी प्रकृति से जवाब देने के लिए Kosmik को आपका दोष क्विज़ चाहिए। लगभग दो मिनट लगते हैं और यह अगली बार के लिए सहेजा जाता है। यह सवाल गिना नहीं गया।',
    hinglish: 'Aapki apni prakriti se jawaab dene ke liye Kosmik ko aapka dosha quiz chahiye. Lagbhag do minute lagte hain aur agli baar ke liye save ho jaata hai. Yeh sawaal count nahi hua.',
  },
  takeQuiz: {
    en: 'Answer 12 quick questions about your body and nature, and Kosmik will save your prakriti.',
    hi: 'अपने शरीर और स्वभाव के बारे में 12 छोटे सवालों के जवाब दें, और Kosmik आपकी प्रकृति सहेज लेगा।',
    hinglish: 'Apne body aur nature ke baare mein 12 chhote sawaalon ke jawaab dijiye, aur Kosmik aapki prakriti save kar lega.',
  },
  prakritiIntro: {
    en: 'Your prakriti, from your dosha quiz. It’s a self-assessment for reflection, not a diagnosis.',
    hi: 'आपके दोष क्विज़ से आपकी प्रकृति। यह आत्म-मूल्यांकन है, निदान नहीं।',
    hinglish: 'Aapke dosha quiz se aapki prakriti. Yeh self-assessment hai, diagnosis nahi.',
  },
  unsure: {
    en: 'I couldn’t put together a reliable answer to that one. Try asking it a little differently.',
    hi: 'मैं इसका भरोसेमंद जवाब नहीं बना पाया। थोड़ा अलग तरह से पूछकर देखें।',
    hinglish: 'Main iska reliable jawaab nahi bana paaya. Thoda alag tarah se poochh kar dekhiye.',
  },
} satisfies Record<string, Record<Lang, string>>;

/** About the asker's own chart or life: answered, but never stored in the shared cache. */
const PERSONAL_CONTEXT =
  /\b(my|mera|meri|mere|mujhe|mujhko|hamara|hamari)\b.{0,40}\b(kundli|kundali|chart|horoscope|lagna|ascendant|dasha|mahadasha|nakshatra|rashi|marriage|shaadi|shadi|husband|wife|partner|boyfriend|girlfriend|ex|career|job|naukri|exam|result|health|baby|child|family|future)\b|(मेरा|मेरी|मेरे|मुझे).{0,40}(कुंडली|राशि|शादी|विवाह|नौकरी|करियर|भविष्य|परिवार)/i;
/** Anything that looks like birth details or contact information. */
const PRIVATE_DATA = /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{1,2}:\d{2}\b|\b(19|20)\d{2}\b|@|\b\d{10}\b|\+91/;

export function cacheable(question: string, personal: boolean): boolean {
  return !personal && !PERSONAL_CONTEXT.test(question) && !PRIVATE_DATA.test(question);
}

const verseBlock = (v: Verse): Block => ({ type: 'verse', ref: v.ref, sanskrit: v.sanskrit, iast: v.iast, translation: v.translation, translator: v.translator });

type Turn = { plan: Plan; used: number; finish: (layer: Layer, blocks: Block[], opts: { count: boolean; cacheId?: number | null }) => Promise<AskResult> };

/** Limits and history shared by every kind of question (text or palm photo). */
async function startTurn(deps: Deps, identity: Identity, conversationId: string | null | undefined, question: string, lang: Lang, now: number): Promise<Turn> {
  const plan = planFor(identity.kind === 'guest' ? 'guest' : identity.premium ? 'premium' : 'starter', now);
  const subject = identity.kind === 'guest' ? identity.subject : `user:${identity.id}`;
  const used = plan.limit === null ? 0 : await deps.usage.count(subject, plan.period);
  const finish: Turn['finish'] = async (layer, blocks, opts) => {
    if (opts.count) await deps.usage.increment(subject, plan.period);
    const total = used + (opts.count ? 1 : 0);
    let ids = { conversationId: null as string | null, messageId: null as string | null };
    if (identity.kind === 'user' && layer !== 'limit') {
      ids = await deps.history.record({ userId: identity.id, conversationId, question, blocks, layer, cacheId: opts.cacheId ?? null, now });
    }
    return { ...ids, layer, lang, blocks, remaining: plan.limit === null ? null : Math.max(0, plan.limit - total) };
  };
  return { plan, used, finish };
}

const limitReached = (turn: Turn) => turn.plan.limit !== null && turn.used >= turn.plan.limit;
const limitBlock = (turn: Turn, lang: Lang): Block[] => [
  { type: 'notice', kind: turn.plan.kind === 'guest' ? 'sign-in' : 'limit', text: turn.plan.kind === 'guest' ? T.limitGuest[lang] : T.limitStarter[lang] },
];

export async function ask(
  deps: Deps,
  input: { question: string; lang?: string; identity: Identity; conversationId?: string | null },
): Promise<AskResult> {
  const now = deps.now?.() ?? Date.now();
  const question = input.question.replace(/\s+/g, ' ').trim();
  if (question.length < 2) throw new BadQuestion('Ask a question to get started.');
  if (question.length > MAX_QUESTION) throw new BadQuestion(`Questions can be up to ${MAX_QUESTION} characters.`);
  const lang: Lang = LANGS.includes(input.lang as Lang) ? (input.lang as Lang) : detectLang(question);
  const turn = await startTurn(deps, input.identity, input.conversationId, question, lang, now);
  const { finish } = turn;
  // The AI layer failing never costs a question: say so politely instead.
  const busy = (err: unknown) => {
    console.error('ai layer failed', err instanceof Error ? err.message : err);
    return finish('ai', [{ type: 'notice', kind: 'busy', text: T.busy[lang] }], { count: false });
  };
  const chartOutcome = async (profile: Profile) => {
    let blocks: Block[];
    try {
      blocks = await chartAnswer(deps, question, lang, profile);
    } catch (err) {
      return busy(err);
    }
    return finish('ai', blocks, { count: blocks[0]?.type !== 'notice' });
  };

  // Someone in distress gets a person to talk to, before anything else and free of charge.
  if (isCrisis(question)) {
    return finish('safety', [
      { type: 'text', text: T.crisis[lang] },
      { type: 'notice', kind: 'helpline', text: `${HELPLINE.name}: ${HELPLINE.number}` },
    ], { count: false });
  }

  if (limitReached(turn)) return finish('limit', limitBlock(turn, lang), { count: false });

  const intent = matchIntent(question);
  const userId = input.identity.kind === 'user' ? input.identity.id : null;

  // Palm questions read the person's saved palm photos.
  if (intent?.type === 'palm') {
    const photos = userId ? await deps.profiles.palms(userId) : [];
    if (!photos.length) return finish('direct', [{ type: 'notice', kind: 'needs-palm', text: T.needsPalm[lang] }], { count: false });
    let blocks: Block[];
    try {
      blocks = await palmAnswer(deps, question, lang, photos);
    } catch (err) {
      return busy(err);
    }
    return finish('ai', blocks, { count: blocks[0]?.type !== 'notice' });
  }

  // Questions about the person's own chart use their saved birth details.
  if (intent?.type === 'needs-chart') {
    const profile = userId ? await deps.profiles.get(userId) : null;
    if (!profile) return finish('direct', [{ type: 'notice', kind: 'needs-details', text: T.needsDetails[lang] }], { count: false });
    return chartOutcome(profile);
  }

  // Ayurveda for the person's own prakriti uses their saved quiz result.
  if (intent?.type === 'prakriti' || intent?.type === 'prakriti-advice') {
    const prakriti = userId ? await deps.ayurveda.prakriti(userId) : null;
    if (!prakriti || (intent.type === 'prakriti' && intent.quiz)) {
      return finish('direct', [{ type: 'notice', kind: 'needs-prakriti', text: prakriti ? T.takeQuiz[lang] : T.needsPrakriti[lang] }], { count: false });
    }
    if (intent.type === 'prakriti') return finish('direct', await prakritiAnswer(deps, prakriti, lang), { count: false });
    let blocks: Block[];
    try {
      blocks = await prakritiAdvice(deps, question, lang, prakriti);
    } catch (err) {
      return busy(err);
    }
    return finish('ai', blocks, { count: blocks[0]?.type !== 'notice' });
  }

  // 1. Direct answers from the libraries.
  if (intent) {
    const direct = await answerDirect(deps, intent, lang, now);
    if (direct) return finish('direct', direct.blocks, { count: direct.counts });
  }

  // 2. The same question, word for word (after normalising).
  const normalized = normalizeQuestion(question);
  const hash = await sha256(normalized);
  const exact = await deps.cache.exact(lang, hash);
  if (exact && (await stillCurrent(deps, exact))) {
    await deps.cache.hit(exact.id);
    return finish('exact', exact.blocks, { count: true, cacheId: exact.id });
  }

  // 3 and 4 need the AI model. If it is down or out of quota, say so politely and don't count it;
  // layers 1 and 2 above keep working.
  // Only the AI calls are guarded, so a database error still surfaces as an error.
  let outcome: Outcome;
  try {
    outcome = await semanticOrGenerated();
  } catch (err) {
    console.error('ai layer failed', err instanceof Error ? err.message : err);
    outcome = { layer: 'ai', blocks: [{ type: 'notice', kind: 'busy', text: T.busy[lang] }], count: false, cacheId: null };
  }
  // The model found the question is about the person: answer from their chart if we have it.
  if (outcome.personal && userId) {
    const profile = await deps.profiles.get(userId);
    if (profile) return chartOutcome(profile);
  }
  if (outcome.cache) {
    const { blocks, embedding, sources, sourcesHash } = outcome.cache;
    outcome.cacheId = await deps.cache.put({ lang, question: normalized, hash, blocks, sources, sourcesHash, model: deps.ai.model, embedding });
    await deps.vectors.add(`cache:${lang}`, String(outcome.cacheId), embedding);
  }
  if (outcome.layer === 'semantic' && outcome.cacheId !== null) await deps.cache.hit(outcome.cacheId);
  return finish(outcome.layer, outcome.blocks, { count: outcome.count, cacheId: outcome.cacheId });

  async function semanticOrGenerated(): Promise<Outcome> {
    // 3. A question with the same meaning.
    const embedding = await deps.ai.embed(question);
    const [similar] = await deps.vectors.search(`cache:${lang}`, embedding, 1, SAME_MEANING);
    if (similar) {
      const entry = await deps.cache.byId(Number(similar.id));
      if (entry && (await stillCurrent(deps, entry))) return { layer: 'semantic', blocks: entry.blocks, count: true, cacheId: entry.id };
    }

    // 4. Retrieve sources and ask the model.
    const [verseHits, meaningHits] = await Promise.all([
      deps.vectors.search('verses', embedding, 5, VERSE_MIN),
      deps.vectors.search('meanings', embedding, 4, MEANING_MIN),
    ]);
    const [verses, meanings] = await Promise.all([deps.library.verses(verseHits.map((h) => h.id)), deps.library.meanings(meaningHits.map((h) => h.id))]);

    let grounded = await deps.ai.answer(question, lang, { verses, meanings });
    if (contentProblems(grounded.answer).length) grounded = await deps.ai.answer(question, lang, { verses, meanings }, true);
    if (contentProblems(grounded.answer).length) {
      return { layer: 'ai', blocks: [{ type: 'text', text: T.unsure[lang] }], count: false, cacheId: null };
    }

    // Keep only citations the model was actually given.
    const verseRefs = new Set(verses.map((v) => v.ref));
    const meaningIds = new Set(meanings.map((m) => `${m.kind}/${m.key}`));
    const citedVerses = verses.filter((v) => grounded.cited.includes(v.ref)).slice(0, 3);
    const citedMeanings = meanings.filter((m) => grounded.cited.includes(`${m.kind}/${m.key}`)).slice(0, 2);
    const sources = grounded.cited.filter((c) => verseRefs.has(c) || meaningIds.has(c));

    const blocks: Block[] = [
      { type: 'text', text: grounded.answer },
      ...citedVerses.map(verseBlock),
      ...(await meaningBlocks(deps, citedMeanings)),
    ];
    if (grounded.personal) blocks.push({ type: 'notice', kind: 'needs-details', text: T.needsDetails[lang] });

    if (!cacheable(question, grounded.personal)) return { layer: 'ai', blocks, count: true, cacheId: null, personal: grounded.personal };
    const sourcesHash = await sourcesFingerprint(
      verses.filter((v) => sources.includes(v.ref)),
      meanings.filter((m) => sources.includes(`${m.kind}/${m.key}`)),
    );
    return { layer: 'ai', blocks, count: true, cacheId: null, cache: { blocks, sources, sourcesHash, embedding } };
  }
}

type Outcome = {
  layer: Layer;
  blocks: Block[];
  count: boolean;
  cacheId: number | null;
  /** The model says this needs the person's own chart. */
  personal?: boolean;
  /** Set when a fresh answer should be stored in the shared cache. */
  cache?: { blocks: Block[]; sources: string[]; sourcesHash: string; embedding: number[] };
};

/**
 * Fingerprint of the library text an answer was built from. Changes when a cited verse or
 * meaning is edited, or a meaning is reviewed (the "Draft" badge is part of the cached answer).
 */
export async function sourcesFingerprint(verses: Verse[], meanings: Meaning[]): Promise<string> {
  const parts = [
    ...verses.map((v) => [v.ref, v.translation, v.translator].join('\u0000')),
    ...meanings.map((m) => [`${m.kind}/${m.key}`, m.title, m.body, m.reviewed ? 1 : 0].join('\u0000')),
  ];
  return sha256(parts.sort().join('\u0001'));
}

/** Whether a cached answer still matches the library. If not, it is retired and a fresh one is written. */
async function stillCurrent(deps: Deps, entry: CacheEntry): Promise<boolean> {
  let current = false;
  if (entry.sourcesHash) {
    // Verse refs look like "BG 2.47"; meaning ids are "kind/key".
    const refs = entry.sources.filter((s) => !s.includes('/'));
    const ids = entry.sources.filter((s) => s.includes('/'));
    const [verses, meanings] = await Promise.all([deps.library.verses(refs), deps.library.meanings(ids)]);
    current = verses.length + meanings.length === entry.sources.length && (await sourcesFingerprint(verses, meanings)) === entry.sourcesHash;
  }
  if (!current) await deps.cache.retire(entry.id);
  return current;
}

async function answerDirect(deps: Deps, intent: Intent, lang: Lang, now: number): Promise<{ blocks: Block[]; counts: boolean } | null> {
  switch (intent.type) {
    case 'verse': {
      const v = await deps.library.verse(intent.chapter, intent.verse);
      return v
        ? { blocks: [{ type: 'text', text: T.verseIntro[lang] }, verseBlock(v)], counts: true }
        : { blocks: [{ type: 'text', text: T.verseMissing[lang] }], counts: false };
    }
    case 'verse-of-the-day': {
      const v = await verseOfTheDay(deps.library, now);
      return v ? { blocks: [{ type: 'text', text: T.verseOfDay[lang] }, verseBlock(v)], counts: true } : null;
    }
    case 'tarot-draw': {
      const blocks = await drawTarot(deps, intent.count);
      return { blocks: [{ type: 'text', text: T.tarot[lang] }, blocks], counts: true };
    }
    case 'meaning': {
      const m = await deps.library.meaning(intent.kind, intent.key);
      if (!m) return null;
      const intro = intent.kind.startsWith('tarot') ? T.tarotMeaning[lang] : T.meaning[lang];
      return { blocks: [{ type: 'text', text: intro }, { type: 'meaning', ...m }], counts: true };
    }
    case 'herb': {
      const h = await deps.ayurveda.herb(intent.key);
      return h
        ? { blocks: [{ type: 'text', text: T.herbIntro[lang] }, herbBlock(h)], counts: true }
        : { blocks: [{ type: 'text', text: T.herbMissing[lang] }], counts: false };
    }
    case 'herb-health': {
      const h = intent.key ? await deps.ayurveda.herb(intent.key) : null;
      return { blocks: [{ type: 'text', text: T.herbHealth[lang] }, ...(h ? [herbBlock(h)] : [])], counts: false };
    }
    case 'herb-list': {
      const { herbs, total } = await deps.ayurveda.findHerbs(intent, HERB_LIST);
      if (!herbs.length) return null;
      return {
        blocks: [
          { type: 'text', text: T.herbList[lang] },
          { type: 'herb-list', title: herbListTitle(intent), total, herbs: herbs.map((h) => ({ key: h.key, name: h.name, english: h.english, virya: h.virya })) },
        ],
        counts: true,
      };
    }
    case 'needs-chart':
    case 'palm':
    case 'prakriti':
    case 'prakriti-advice':
      return null; // handled in ask(): they need the person's saved details
    case 'daily-horoscope':
      return { blocks: [{ type: 'notice', kind: 'coming-soon', text: T.horoscope[lang] }], counts: false };
  }
}

/** The same verse for everyone on a given India-time day. */
export async function verseOfTheDay(library: Library, now: number): Promise<Verse | null> {
  const day = new Date(now + 330 * 60 * 1000).toISOString().slice(0, 10);
  const count = await library.verseCount();
  if (!count) return null;
  const index = parseInt((await sha256(`verse-of-the-day:${day}`)).slice(0, 8), 16) % count;
  return library.verseAt(index);
}

const secureRandom = (n: number) => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % n;
};

async function drawTarot(deps: Deps, count: 1 | 3): Promise<Block> {
  const random = deps.random ?? secureRandom;
  const deck = [...TAROT];
  const positions = count === 1 ? ['Your card'] : ['Past', 'Present', 'Future'];
  const cards = [];
  for (const position of positions) {
    const card = deck.splice(random(deck.length), 1)[0];
    const reversed = random(3) === 0;
    const meaning = await deps.library.meaning(reversed ? 'tarot-reversed' : 'tarot-upright', card.key);
    cards.push({ key: card.key, name: card.name, reversed, position, meaning: meaning?.body ?? '' });
  }
  return { type: 'tarot', cards };
}

/** Houses a question is about, so the right placement meanings are given to the model. */
const TOPIC_HOUSES: [RegExp, number[]][] = [
  [/\b(marriage|marry|shaadi|shadi|vivah|spouse|partner|husband|wife|pati|patni|relationship|love|pyaar)\b|शादी|विवाह/, [7]],
  [/\b(career|job|naukri|work|business|profession|promotion|kaam)\b|नौकरी|करियर/, [10, 6]],
  [/\b(money|paisa|paise|wealth|finance|dhan|income|savings)\b|धन|पैसा/, [2, 11]],
  [/\b(education|study|studies|padhai|exam|college|learning)\b|पढ़ाई/, [4, 5]],
  [/\b(child|children|kids|baby|bachche|bacche|santan)\b|संतान/, [5]],
  [/\b(family|parents|mother|father|maa|papa|home|ghar)\b|परिवार/, [4, 2]],
  [/\b(friends|social|gains)\b/, [11]],
];

/** Picks the library meanings that explain this person's chart for this question (at most six). */
export function chartSources(chart: Chart, question: string): string[] {
  const q = question.toLowerCase();
  const ids: string[] = [];
  const add = (id: string) => !ids.includes(id) && ids.push(id);
  const at = (g: string) => chart.grahas.find((p) => p.graha === g)!;
  for (const g of GRAHAS) {
    if (g.aliases.some((a) => new RegExp(`(^|[^\\p{L}])${a}($|[^\\p{L}])`, 'u').test(q))) {
      const p = at(g.key);
      add(p.house ? `graha-house/${g.key}:${p.house}` : `graha-rashi/${g.key}:${p.rashi}`);
    }
  }
  const houses = TOPIC_HOUSES.filter(([re]) => re.test(q)).flatMap(([, h]) => h);
  for (const h of houses) for (const p of chart.grahas.filter((x) => x.house === h)) add(`graha-house/${p.graha}:${h}`);
  if (chart.lagna) add(`rashi/${chart.lagna.rashi}`);
  const moon = at('moon');
  add(`graha-rashi/moon:${moon.rashi}`);
  add(`nakshatra/${chart.moonNakshatra.key}`);
  return ids.slice(0, 6);
}

const nameOf = {
  rashi: (k: string) => RASHIS.find((r) => r.key === k)!,
  graha: (k: string) => GRAHAS.find((g) => g.key === k)!,
};

export function chartBlock(chart: Chart): Block {
  const r = (k: string) => `${nameOf.rashi(k).name} (${nameOf.rashi(k).english})`;
  const nak = NAKSHATRAS.find((n) => n.key === chart.moonNakshatra.key)!;
  return {
    type: 'chart',
    lagna: chart.lagna ? r(chart.lagna.rashi) : null,
    moon: r(chart.grahas.find((p) => p.graha === 'moon')!.rashi),
    nakshatra: `${nak.name}, pada ${chart.moonNakshatra.pada}`,
    rows: chart.grahas.map((p) => ({
      graha: `${nameOf.graha(p.graha).name} (${nameOf.graha(p.graha).english})`,
      rashi: r(p.rashi),
      house: p.house ? ordinal(p.house) : null,
      retrograde: p.retrograde && p.graha !== 'rahu' && p.graha !== 'ketu',
    })),
  };
}

/** Answers a question about the person's own chart, calculated from their saved birth details. */
async function chartAnswer(deps: Deps, question: string, lang: Lang, profile: Profile): Promise<Block[]> {
  const chart = calculateChart(toBirth(profile));
  const meanings = await deps.library.meanings(chartSources(chart, question));
  const facts = `CHART (calculated, sidereal, Lahiri, whole-sign houses):\n${describeChart(chart)}`;
  let grounded = await deps.ai.answer(question, lang, { verses: [], meanings }, false, facts);
  if (contentProblems(grounded.answer).length) grounded = await deps.ai.answer(question, lang, { verses: [], meanings }, true, facts);
  if (contentProblems(grounded.answer).length) return [{ type: 'notice', kind: 'busy', text: T.unsure[lang] }];
  const cited = meanings.filter((m) => grounded.cited.includes(`${m.kind}/${m.key}`)).slice(0, 3);
  return [
    { type: 'text', text: grounded.answer },
    chartBlock(chart),
    ...cited.map((m): Block => ({ type: 'meaning', ...m })),
  ];
}

/** Reads the person's saved palm photos, with their question in mind. */
async function palmAnswer(deps: Deps, question: string, lang: Lang, photos: { hand: 'left' | 'right'; mime: string; data: string }[]): Promise<Block[]> {
  const images = photos.map((p) => ({ data: p.data, mime: p.mime, hand: p.hand }));
  const safe = (r: { overview: string; lines: { reading: string }[] }) => ![r.overview, ...r.lines.map((l) => l.reading)].some((t) => contentProblems(t).length);
  let reading = await deps.ai.readPalm(images, lang, { question });
  if (reading.isPalm && !safe(reading)) reading = await deps.ai.readPalm(images, lang, { question, stricter: true });
  if (!reading.isPalm) return [{ type: 'notice', kind: 'retake', text: `${T.palmRetake[lang]} ${reading.overview}` }];
  if (!safe(reading)) return [{ type: 'notice', kind: 'busy', text: T.unsure[lang] }];
  return [
    { type: 'text', text: `${T.palmIntro[lang]} ${reading.overview}` },
    { type: 'palm', lines: reading.lines },
    { type: 'text', text: T.palmNote[lang] },
  ];
}

const HERB_LIST = 12;
const cap = (d: string) => d[0].toUpperCase() + d.slice(1);

export function herbListTitle(f: { dosha?: Dosha; effect: 'pacify' | 'aggravate'; virya?: string }): string {
  if (f.dosha) return f.effect === 'pacify' ? `Herbs that balance ${cap(f.dosha)}` : `Herbs that may increase ${cap(f.dosha)}`;
  return f.virya === 'Sheeta' ? 'Cooling (sheeta) herbs' : 'Heating (ushna) herbs';
}

/** Library meanings as cards: herbs get their full herb card. */
async function meaningBlocks(deps: Deps, meanings: Meaning[]): Promise<Block[]> {
  const herbs = await deps.ayurveda.herbs(meanings.filter((m) => m.kind === 'herb').map((m) => m.key));
  return meanings.flatMap((m): Block[] => {
    if (m.kind !== 'herb') return [{ type: 'meaning', ...m }];
    const h = herbs.find((x) => x.key === m.key);
    return h ? [herbBlock(h)] : [];
  });
}

/** The person's saved prakriti, with the dosha guidance for their leading dosha(s). */
async function prakritiAnswer(deps: Deps, p: Prakriti, lang: Lang): Promise<Block[]> {
  const lead = dominant(p).slice(0, 2);
  const care = await deps.library.meanings(lead.map((d) => `prakriti-care/${d}`));
  return [{ type: 'text', text: T.prakritiIntro[lang] }, prakritiBlock(p), ...care.map((m): Block => ({ type: 'meaning', ...m }))];
}

/** Diet, routine or herb questions about the person's own prakriti, answered from their quiz result. */
async function prakritiAdvice(deps: Deps, question: string, lang: Lang, p: Prakriti): Promise<Block[]> {
  const lead = dominant(p).slice(0, 2);
  const { herbs } = await deps.ayurveda.findHerbs({ dosha: lead[0], effect: 'pacify' }, 4);
  const meanings = await deps.library.meanings([...lead.flatMap((d) => [`dosha/${d}`, `prakriti-care/${d}`]), ...herbs.map((h) => `herb/${h.key}`)]);
  const facts = `PRAKRITI (the person's own dosha self-assessment quiz): Vata ${p.vata}%, Pitta ${p.pitta}%, Kapha ${p.kapha}% (${prakritiLabel(p)}).`;
  let grounded = await deps.ai.answer(question, lang, { verses: [], meanings }, false, facts);
  if (contentProblems(grounded.answer).length) grounded = await deps.ai.answer(question, lang, { verses: [], meanings }, true, facts);
  if (contentProblems(grounded.answer).length) return [{ type: 'notice', kind: 'busy', text: T.unsure[lang] }];
  const cited = meanings.filter((m) => grounded.cited.includes(`${m.kind}/${m.key}`)).slice(0, 3);
  return [{ type: 'text', text: grounded.answer }, prakritiBlock(p), ...(await meaningBlocks(deps, cited))];
}
