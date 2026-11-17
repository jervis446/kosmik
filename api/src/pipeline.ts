/**
 * Answers a question in four layers, using AI only when nothing cheaper can:
 *   1. direct    — recognised questions answered from the libraries (no AI)
 *   2. exact     — the same question asked before (normalised text, hashed)
 *   3. semantic  — a question with the same meaning asked before (embeddings)
 *   4. ai        — RAG: retrieve verses and meanings, Gemini writes the answer, then it is cached
 * Answers about one person's own life are never stored in the shared cache.
 */
import type { AiClient, AstroMode } from './ai.ts';
import { dashaLine, deepChart, devanagari, fmtDateHi } from './lib/jyotish.ts';
import { matchIntent, type Intent } from './lib/intents.ts';
import { CONTEXT_MESSAGES, describeConversation, isFollowUp } from './lib/conversation.ts';
import { planFor, type Plan } from './lib/limits.ts';
import { contentProblems, HELPLINE, isCrisis, shantiProblems } from './lib/safety.ts';
import { detectLang, type Lang, LANGS, normalizeQuestion, requestedLang, sha256 } from './lib/text.ts';
import { GRAHAS, ordinal, RASHIS, NAKSHATRAS, TAROT } from './lib/catalog.ts';
import { calculateChart, type Chart } from './lib/chart.ts';
import { type Profile, type Profiles, toBirth } from './profiles.ts';
import type { AnswerCache, History, Library, Namespace, Usage, VectorSearch } from './store.ts';
import { aggravated, AGNI_LABEL, type Ayurveda, dominant, type Dosha, herbBlock, type HerbFilter, type Prakriti, prakritiBlock, prakritiLabel, type Vikriti, vikritiBlock } from './ayurveda.ts';
import { rituAt, RITUS_HI } from './lib/ritu.ts';
import { describeTropical, MOON_VIBE_HI, MOON_VIBE_HINGLISH, SIGNS, SIGNS_HI, SUN_VIBE_HI, SUN_VIBE_HINGLISH, zodiac, zodiacHi } from './lib/tropical.ts';
import type { AskResult, Block, CacheEntry, ChatKind, Layer, Meaning, Passage, Verse } from './types.ts';

/** Up to 250 letters a question, counting characters as people see them; spaces don't count. */
export const MAX_LETTERS = 250;
const letters = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
/** Characters as people see them, without spaces: "fff fff" is 6, "नमस्ते" is 3. */
export const letterCount = (t: string) => [...letters.segment(t.replace(/\s+/g, ''))].length;
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
  /** Records a failure in the error log (the AI model being down, for example). */
  report?: (kind: string, message: string) => void;
  /** 'open' (testing): chart readings may predict events and dates; see ai.ts. */
  astroMode?: AstroMode;
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
  tarot: { en: 'Here are your cards.', hi: 'ये रहे आपके कार्ड।', hinglish: 'Yeh rahe aapke cards.' },
  tarotPick: {
    en: 'Hold your question in mind, then pick the card you feel drawn to.',
    hi: 'अपना सवाल मन में रखें, फिर वह कार्ड चुनें जिसकी ओर आप खिंचाव महसूस करें।',
    hinglish: 'Apna sawaal mann mein rakhiye, phir woh card chuniye jiski taraf aap khinchav mehsoos karein.',
  },
  tarotPickThree: {
    en: 'Hold your question in mind and pick three cards: past, present and future.',
    hi: 'अपना सवाल मन में रखें और तीन कार्ड चुनें: अतीत, वर्तमान और भविष्य।',
    hinglish: 'Apna sawaal mann mein rakhiye aur teen cards chuniye: past, present aur future.',
  },
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
  vedicIntro: { en: 'Vedic astrology (your kundli):', hi: 'वैदिक ज्योतिष (आपकी कुंडली):', hinglish: 'Vedic astrology (aapki kundli):' },
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
  useAyurveda: {
    en: 'Health and Ayurveda questions have their own chats, so this one stays about your stars. Ask it in an Ayurveda chat instead. This question wasn’t counted.',
    hi: 'सेहत और आयुर्वेद के सवालों की अलग चैट होती है, ताकि यह चैट आपके सितारों के बारे में रहे। यह सवाल आयुर्वेद चैट में पूछिए। यह सवाल गिना नहीं गया।',
    hinglish: 'Health aur Ayurveda ke sawaalon ki alag chat hoti hai, taaki yeh chat aapke sitaaron ke baare mein rahe. Yeh sawaal Ayurveda chat mein poochhiye. Yeh sawaal count nahi hua.',
  },
  useKosmik: {
    en: 'Shanti is for talking things through, so it stays away from charts and cards. Ask this in a Kosmik chat for your palm, tarot or kundli. This question wasn’t counted.',
    hi: 'शांति मन की बात के लिए है, इसलिए यहाँ कुंडली और कार्ड नहीं होते। हस्तरेखा, टैरो या कुंडली के लिए यह सवाल Kosmik चैट में पूछिए। यह सवाल गिना नहीं गया।',
    hinglish: 'Shanti mann ki baat ke liye hai, isliye yahan kundli aur cards nahi hote. Palm, tarot ya kundli ke liye yeh sawaal Kosmik chat mein poochhiye. Yeh sawaal count nahi hua.',
  },
  shantiLow: {
    en: 'If this has felt heavy for a while, please talk to someone you trust, or a counsellor. You don’t have to carry it alone.',
    hi: 'अगर यह बोझ कुछ समय से है, तो किसी भरोसेमंद व्यक्ति या काउंसलर से बात कीजिए। आपको यह अकेले नहीं उठाना है।',
    hinglish: 'Agar yeh bojh kuch samay se hai, toh kisi bharosemand insaan ya counsellor se baat kijiye. Aapko yeh akele nahi uthana hai.',
  },
  emergency: { en: 'In danger right now', hi: 'अभी ख़तरे में हों तो', hinglish: 'Abhi khatre mein hon toh' },
  useShanti: {
    en: 'Gita and life questions have their own space now: Shanti. Open a Shanti chat to talk it through; this chat stays about your palm, tarot and kundli. This question wasn’t counted.',
    hi: 'गीता और ज़िंदगी के सवालों की अब अपनी जगह है: शांति। खुलकर बात करने के लिए शांति चैट खोलिए; यह चैट आपकी हस्तरेखा, टैरो और कुंडली के लिए है। यह सवाल गिना नहीं गया।',
    hinglish: 'Gita aur zindagi ke sawaalon ki ab apni jagah hai: Shanti. Khulkar baat karne ke liye Shanti chat kholiye; yeh chat aapke palm, tarot aur kundli ke liye hai. Yeh sawaal count nahi hua.',
  },
  needsVikriti: {
    en: 'To see your current state (vikriti), answer 10 quick questions about the last few weeks. It also tells you your agni (digestive fire). This question wasn’t counted.',
    hi: 'अपनी वर्तमान अवस्था (विकृति) जानने के लिए पिछले कुछ हफ़्तों के बारे में 10 छोटे सवालों के जवाब दें। इससे आपकी अग्नि भी पता चलेगी। यह सवाल गिना नहीं गया।',
    hinglish: 'Apni current state (vikriti) jaanne ke liye pichhle kuch hafton ke baare mein 10 chhote sawaalon ke jawaab dijiye. Isse aapki agni bhi pata chalegi. Yeh sawaal count nahi hua.',
  },
  vikritiIntro: {
    en: 'Your current state (vikriti), from your check. It is a self-assessment for reflection, not a diagnosis.',
    hi: 'आपकी जाँच से आपकी वर्तमान अवस्था (विकृति)। यह आत्म-मूल्यांकन है, निदान नहीं।',
    hinglish: 'Aapke check se aapki current state (vikriti). Yeh self-assessment hai, diagnosis nahi.',
  },
  rituIntro: {
    en: 'The ritu (Ayurvedic season) right now, worked out from the Sun’s sidereal sign:',
    hi: 'अभी की ऋतु, सूर्य की निरयन राशि से निकाली गई:',
    hinglish: 'Abhi ki ritu (Ayurvedic season), Surya ki sidereal rashi se nikaali gayi:',
  },
  zodiacIntro: {
    en: 'Your Western (tropical) signs, from the moment you were born. Kosmik’s kundli uses the sidereal (Vedic) zodiac, about 24° behind, so your rashi can differ.',
    hi: 'आपकी पश्चिमी (सायन) राशियाँ, जन्म के क्षण से। Kosmik की कुंडली निरयन (वैदिक) राशिचक्र से बनती है, जो लगभग 24° पीछे है, इसलिए आपकी राशि अलग हो सकती है।',
    hinglish: 'Aapke Western (tropical) signs, janam ke pal se. Kosmik ki kundli sidereal (Vedic) zodiac se banti hai, jo lagbhag 24° peeche hai, isliye aapki rashi alag ho sakti hai.',
  },
  compareIntro: { en: 'Side by side, as Dravyaguna describes them:', hi: 'द्रव्यगुण के अनुसार, साथ-साथ:', hinglish: 'Dravyaguna ke hisaab se, side by side:' },
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
/** Astrology, tarot and palm words: questions with these stay in a Kosmik chat. */
const ASTRO =
  /\b(kundli|kundali|chart|horoscope|rashi|raashi|nakshatra|dasha|mahadasha|antardasha|transit|gochar|graha|planets?|saturn|shani|jupiter|guru|mars|mangal|manglik|venus|shukra|mercury|budh|moon|chandra|sun|surya|rahu|ketu|lagna|ascendant|houses?|bhav|bhava|zodiac|signs?|retrograde|sade ?sati|astrolog\w*|jyotish\w*|tarot|cards?|palm\w*|hast ?rekha|milan|muhurat|yoga in my chart)\b|कुंडली|कुण्डली|राशि|ग्रह|शनि|नक्षत्र|दशा|ज्योतिष|हस्तरेखा|टैरो/i;

/** Words that make a question an Ayurveda one (the Ayurveda library, never the Gita). */
const AYURVEDIC = /ayurved|dosha|herb|prakriti|vikriti|vaidya|agni|vata|pitta|kapha|ritu|dinacharya|jadi|buti|nuskh/i;

/** Shanti messages about the person's own pain or the people in it: answered, never cached. */
const SHANTI_PERSONAL =
  /\b(break ?up|broke up|my ex|ex[- ](boyfriend|girlfriend|husband|wife)|divorce\w*|cheated|died|passed away|lost my|alone|lonely|my (boyfriend|girlfriend|bf|gf|husband|wife|partner|fianc\w*|mother|mom|mummy|father|dad|papa|brother|sister|son|daughter|friend|boss)|dhokha|chhod (diya|di|gaya|gayi)|akela|akeli)\b|अकेला|अकेली|धोखा|तलाक/i;

/** Pain that needs comfort more than a chart: a breakup, a loss, loneliness. */
export const EMOTIONAL =
  /\b(break ?up|broke up|broken up|heart ?broken|heartbreak|left me|dumped|cheated|betray\w*|divorce\w*|lonely|alone|depress\w*|grief|griev\w*|died|passed away|lost my|miss (him|her|them)|can'?t move on|move on|hopeless|empty inside|dhokha|chhod (diya|di|gaya|gayi)|akela|akeli|udaas|dukh)\b|अकेला|अकेली|धोखा|तलाक|दुख|उदास|छोड़ (दिया|गया|गई)/i;

/** A question for a Shanti chat: a Gita verse, or anything with no astrology, tarot or palm in it. */
export const isShantiQuestion = (intent: Intent | null | undefined, q: string): boolean =>
  intent?.type === 'verse' || intent?.type === 'verse-of-the-day' || (!intent && !ASTRO.test(q));

const PERSONAL_CONTEXT =
  /\b(my|mera|meri|mere|mujhe|mujhko|hamara|hamari)\b.{0,40}\b(kundli|kundali|chart|horoscope|lagna|ascendant|dasha|mahadasha|nakshatra|rashi|marriage|shaadi|shadi|husband|wife|partner|boyfriend|girlfriend|ex|career|job|naukri|exam|result|health|baby|child|family|future)\b|(मेरा|मेरी|मेरे|मुझे).{0,40}(कुंडली|राशि|शादी|विवाह|नौकरी|करियर|भविष्य|परिवार)/i;
/** Anything that looks like birth details or contact information. */
const PRIVATE_DATA = /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{1,2}:\d{2}\b|\b(19|20)\d{2}\b|@|\b\d{10}\b|\+91/;

/** Decisions and timing in someone's own life ("can I open my startup this year?", "when will I…"). */
const LIFE_DECISION =
  /\b(my|mera|meri|mere|apna|apni)\b.{0,30}\b(startup|business|company|shop|venture|money|salary|income|promotion|loan|debt|property|house|flat|visa|abroad|love|relationship|crush|life|studies|degree|interview|transfer)\b|\b(can|should|will|shall|do|could) i\b.{0,60}\b(this|next|coming) (year|month|week)\b|\bwhen will i\b|\bwill i (get|be|find|marry|go|have|pass|crack)\b|\b(kab|kya) (main|mai|mera|meri)\b/i;

export function cacheable(question: string, personal: boolean): boolean {
  return !personal && !PERSONAL_CONTEXT.test(question) && !LIFE_DECISION.test(question) && !PRIVATE_DATA.test(question);
}

const verseBlock = (v: Verse): Block => ({ type: 'verse', ref: v.ref, sanskrit: v.sanskrit, iast: v.iast, translation: v.translation, translator: v.translator });

type Turn = { plan: Plan; used: number; finish: (layer: Layer, blocks: Block[], opts: { count: boolean; cacheId?: number | null }) => Promise<AskResult> };

/** Limits and history shared by every kind of question (text or palm photo). */
/** Ayurveda answers: a chat whose first answer is one of these becomes an Ayurveda chat. */
const AYURVEDA_INTENTS = new Set(['ayur-consult', 'herb', 'herb-compare', 'herb-list', 'ritu', 'prakriti', 'prakriti-advice', 'vikriti']);
const AYURVEDA_BLOCKS = new Set(['ayur-plan', 'ayur-intake', 'herb', 'herb-list', 'herb-compare', 'ritu', 'prakriti', 'vikriti']);
export const chatKindOf = (blocks: Block[]): ChatKind =>
  blocks.some((b) => AYURVEDA_BLOCKS.has(b.type) || (b.type === 'notice' && (b.kind === 'needs-prakriti' || b.kind === 'needs-vikriti'))) ? 'ayurveda' : 'kosmik';

async function startTurn(deps: Deps, identity: Identity, conversationId: string | null | undefined, question: string, langOf: () => Lang, now: number, modeOf: () => ChatKind | null = () => null): Promise<Turn> {
  const plan = planFor(identity.kind === 'guest' ? 'guest' : identity.premium ? 'premium' : 'starter', now);
  const subject = identity.kind === 'guest' ? identity.subject : `user:${identity.id}`;
  const used = plan.limit === null ? 0 : await deps.usage.count(subject, plan.period);
  const finish: Turn['finish'] = async (layer, blocks, opts) => {
    if (opts.count) await deps.usage.increment(subject, plan.period);
    const total = used + (opts.count ? 1 : 0);
    let ids = { conversationId: null as string | null, messageId: null as string | null };
    let kind: ChatKind = modeOf() ?? chatKindOf(blocks);
    if (identity.kind === 'user' && layer !== 'limit') {
      const rec = await deps.history.record({ userId: identity.id, conversationId, question, blocks, layer, cacheId: opts.cacheId ?? null, now, kind: modeOf() ?? chatKindOf(blocks) });
      ids = { conversationId: rec.conversationId, messageId: rec.messageId };
      kind = rec.kind ?? kind;
    }
    return { ...ids, layer, lang: langOf(), blocks, remaining: plan.limit === null ? null : Math.max(0, plan.limit - total), kind };
  };
  return { plan, used, finish };
}

const limitReached = (turn: Turn) => turn.plan.limit !== null && turn.used >= turn.plan.limit;
const limitBlock = (turn: Turn, lang: Lang): Block[] => [
  { type: 'notice', kind: turn.plan.kind === 'guest' ? 'sign-in' : 'limit', text: turn.plan.kind === 'guest' ? T.limitGuest[lang] : T.limitStarter[lang] },
];

export async function ask(
  deps: Deps,
  input: { question: string; lang?: string; identity: Identity; conversationId?: string | null; tarot?: { count: 1 | 3 }; mode?: ChatKind },
): Promise<AskResult> {
  const now = deps.now?.() ?? Date.now();
  const question = input.question.replace(/\s+/g, ' ').trim();
  if (question.length < 2) throw new BadQuestion('Ask a question to get started.');
  if (letterCount(question) > MAX_LETTERS) throw new BadQuestion(`Questions can be up to ${MAX_LETTERS} letters.`);
  const chosen = LANGS.includes(input.lang as Lang) ? (input.lang as Lang) : undefined;
  let lang: Lang = chosen ?? requestedLang(question) ?? detectLang(question);
  // The libraries answer in the chat's language: Hindi text where it exists, English otherwise.
  const localize = () => {
    deps = { ...deps, library: deps.library.inLang?.(lang) ?? deps.library, ayurveda: deps.ayurveda.inLang?.(lang) ?? deps.ayurveda };
  };
  localize();
  // An Ayurveda chat stays Ayurveda: picked when it was started, or remembered from its first answer.
  const userIdEarly = input.identity.kind === 'user' ? input.identity.id : null;
  const mode: ChatKind | null =
    input.mode ?? (userIdEarly && input.conversationId ? ((await deps.history.kindOf?.(userIdEarly, input.conversationId)) ?? null) : null);
  // The kind this turn is answered as: the chat's own, or (in a new chat) the one its first answer picks.
  let routed: ChatKind | null = mode;
  const turn = await startTurn(deps, input.identity, input.conversationId, question, () => lang, now, () => routed);
  const { finish } = turn;
  // The AI layer failing never costs a question: say so politely instead.
  const busy = (err: unknown) => {
    console.error('ai layer failed', err instanceof Error ? err.message : err);
    deps.report?.('ai', err instanceof Error ? err.message : String(err));
    return finish('ai', [{ type: 'notice', kind: 'busy', text: T.busy[lang] }], { count: false });
  };
  const chartOutcome = async (profile: Profile) => {
    let blocks: Block[];
    try {
      blocks = await chartAnswer(deps, q, lang, profile, conversation, now);
    } catch (err) {
      return busy(err);
    }
    return finish('ai', blocks, { count: blocks[0]?.type !== 'notice' });
  };

  // The person picked their tarot card(s): draw them and read them for their question.
  if (input.tarot) {
    if (limitReached(turn)) return finish('limit', limitBlock(turn, lang), { count: false });
    let blocks: Block[];
    try {
      blocks = await tarotReading(deps, question, lang, input.tarot.count, input.identity.kind === 'user' ? input.identity.id : null, input.conversationId ?? null);
    } catch (err) {
      return busy(err);
    }
    return finish('ai', blocks, { count: true });
  }

  // Someone in distress gets a person to talk to, before anything else and free of charge.
  if (isCrisis(question)) {
    return finish('safety', [
      { type: 'text', text: T.crisis[lang] },
      { type: 'notice', kind: 'helpline', text: `${HELPLINE.name}: ${HELPLINE.number}` },
    ], { count: false });
  }

  if (limitReached(turn)) return finish('limit', limitBlock(turn, lang), { count: false });

  const userId = input.identity.kind === 'user' ? input.identity.id : null;
  const ownIntent = matchIntent(question);

  // Memory within a chat: a follow-up ("tell me more", "aur batao", "and Rahu?") is rewritten as a
  // question that stands on its own, so the libraries and the cache work as usual, and the model
  // sees the earlier turns. The original wording is what goes into the history.
  let q = question;
  let conversation: string | undefined;
  if (userId && input.conversationId && isFollowUp(question, !!ownIntent)) {
    const past = await deps.history.recent(userId, input.conversationId, CONTEXT_MESSAGES);
    if (past.length) {
      conversation = describeConversation(past);
      // "tell me more" carries no language of its own: keep the one the chat is in.
      const lastAsked = past.filter((m) => m.role === 'user').at(-1)?.content;
      if (!chosen && !requestedLang(question) && lastAsked && normalizeQuestion(question).split(' ').length <= 4) {
        lang = detectLang(lastAsked);
        localize();
      }
      try {
        q = await deps.ai.standalone(question, conversation);
      } catch (err) {
        console.error('follow-up rewrite failed', err instanceof Error ? err.message : err);
      }
      if (isCrisis(q)) {
        return finish('safety', [
          { type: 'text', text: T.crisis[lang] },
          { type: 'notice', kind: 'helpline', text: `${HELPLINE.name}: ${HELPLINE.number}` },
        ], { count: false });
      }
    }
  }
  let intent = q === question ? ownIntent : matchIntent(q);
  // A reply to the consultation's intake questions continues the consultation.
  if (userId && input.conversationId && intent?.type !== 'ayur-consult') {
    const last = (await deps.history.recent(userId, input.conversationId, 1))[0];
    if (last?.role === 'assistant' && last.blocks?.some((b) => b.type === 'ayur-intake')) {
      intent = { type: 'ayur-consult' };
      if (!conversation) conversation = describeConversation(await deps.history.recent(userId, input.conversationId, CONTEXT_MESSAGES));
    }
  }

  // In an Ayurveda chat, everything is an Ayurveda question: library look-ups (herbs, doshas, ritu)
  // are answered from the library, anything else goes to the consultation.
  if (mode === 'ayurveda' && !AYURVEDA_INTENTS.has(intent?.type ?? '')) intent = { type: 'ayur-consult' };
  // And a Kosmik chat stays about the stars: health questions are offered an Ayurveda chat instead.
  if (mode === 'kosmik' && input.conversationId && AYURVEDA_INTENTS.has(intent?.type ?? '')) {
    return finish('direct', [{ type: 'notice', kind: 'use-ayurveda', text: T.useAyurveda[lang], question }], { count: false });
  }
  // Gita and life questions have their own chats (Shanti): a Kosmik chat keeps to palm, tarot and the
  // kundli. A question about the person's own life still goes to their chart when it is saved, unless
  // it is plainly about pain (a breakup, a loss), which is Shanti's.
  if (mode === 'kosmik' && input.conversationId && isShantiQuestion(intent, q)) {
    const toChart = !EMOTIONAL.test(q) && !!userId && (PERSONAL_CONTEXT.test(q) || LIFE_DECISION.test(q)) && !!(await deps.profiles.get(userId));
    if (!toChart) return finish('direct', [{ type: 'notice', kind: 'use-shanti', text: T.useShanti[lang], question }], { count: false });
  }

  // Shanti: comfort from the scriptures, for someone hurting. It never reads the chart, tarot or palm:
  // those are offered a Kosmik chat, health an Ayurveda chat. A Gita reference is still answered directly.
  let shanti = false;
  const verseIntent = intent?.type === 'verse' || intent?.type === 'verse-of-the-day';
  if (mode === 'shanti') {
    // Pain that shows up in the body ("he left me and I can't sleep") is still Shanti's; a herb or dosha question isn't.
    const health = AYURVEDA_INTENTS.has(intent?.type ?? '') && (!EMOTIONAL.test(q) || /^herb/.test(intent?.type ?? ''));
    if (health || (intent?.type === 'meaning' && (intent.kind === 'ayurveda' || intent.kind === 'dosha'))) {
      return finish('direct', [{ type: 'notice', kind: 'use-ayurveda', text: T.useAyurveda[lang], question }], { count: false });
    }
    if ((intent && !verseIntent && !AYURVEDA_INTENTS.has(intent.type)) || (ASTRO.test(q) && !EMOTIONAL.test(q))) {
      return finish('direct', [{ type: 'notice', kind: 'use-kosmik', text: T.useKosmik[lang], question }], { count: false });
    }
    shanti = !verseIntent;
    if (shanti) intent = undefined;
  } else if (mode === null && isShantiQuestion(intent, q) && !AYURVEDIC.test(q)) {
    // A new chat whose first question is a Gita or life question becomes a Shanti chat, unless it is
    // about the person's own life and their chart is saved (then it stays a kundli reading).
    const toChart = !EMOTIONAL.test(q) && !!userId && (PERSONAL_CONTEXT.test(q) || LIFE_DECISION.test(q)) && !!(await deps.profiles.get(userId));
    if (!toChart) {
      routed = 'shanti';
      shanti = !verseIntent;
    }
  }
  // Shanti speaks to the person by name. Answers carry a {name} token (so a cached answer greets each
  // person by their own name); it is filled in just before the answer is shown.
  const shantiName = shanti && userId ? firstName((await deps.profiles.get(userId))?.name) : null;
  const named = (blocks: Block[]) => (shanti ? personalize(blocks, shantiName) : blocks);
  // A Shanti chat is one conversation: every turn sees the earlier ones.
  if (shanti && userId && input.conversationId && !conversation) {
    const past = await deps.history.recent(userId, input.conversationId, CONTEXT_MESSAGES);
    if (past.length) conversation = describeConversation(past);
  }

  // Health and wellness: an Ayurveda consultation, never the birth chart.
  if (intent?.type === 'ayur-consult') {
    let blocks: Block[];
    try {
      blocks = await ayurConsult(deps, q, lang, userId, intent.herb, conversation, now);
    } catch (err) {
      return busy(err);
    }
    return finish('ai', blocks, { count: true });
  }

  // Palm questions read the person's saved palm photos.
  if (intent?.type === 'palm') {
    const photos = userId ? await deps.profiles.palms(userId) : [];
    if (!photos.length) return finish('direct', [{ type: 'notice', kind: 'needs-palm', text: T.needsPalm[lang] }], { count: false });
    let blocks: Block[];
    try {
      blocks = await palmAnswer(deps, q, lang, photos);
    } catch (err) {
      return busy(err);
    }
    return finish('ai', blocks, { count: blocks[0]?.type !== 'notice' });
  }

  // Western signs, the Sun on their birthday and the solar return, from their saved birth details.
  if (intent?.type === 'zodiac') {
    const profile = userId ? await deps.profiles.get(userId) : null;
    if (!profile) return finish('direct', [{ type: 'notice', kind: 'needs-details', text: T.needsDetails[lang] }], { count: false });
    const z = zodiac(calculateChart(toBirth(profile)), new Date(now));
    if (lang === 'hi') {
      z.sun = zodiacHi(z.sun, 'sun');
      z.moon = zodiacHi(z.moon, 'moon');
      z.rising = z.rising ? zodiacHi(z.rising, 'rising') : null;
    }
    return finish('direct', [{ type: 'text', text: T.zodiacIntro[lang] }, { type: 'zodiac', sun: z.sun, moon: z.moon, rising: z.rising, planets: z.planets.map(({ graha, sign, glyph, degree }) => ({ graha, sign, glyph, degree })), siderealSun: z.siderealSun, cusp: z.cusp, solarReturn: z.solarReturn }], { count: false });
  }

  // Questions about the person's own chart use their saved birth details.
  if (intent?.type === 'needs-chart') {
    const profile = userId ? await deps.profiles.get(userId) : null;
    if (!profile) return finish('direct', [{ type: 'notice', kind: 'needs-details', text: T.needsDetails[lang] }], { count: false });
    return chartOutcome(profile);
  }

  // The person's current state (vikriti), from its own short check.
  if (intent?.type === 'vikriti') {
    const v = userId ? await deps.ayurveda.vikriti(userId) : null;
    if (!v || intent.quiz) return finish('direct', [{ type: 'notice', kind: 'needs-vikriti', text: T.needsVikriti[lang] }], { count: false });
    const p = userId ? await deps.ayurveda.prakriti(userId) : null;
    const up = aggravated(v);
    const care = await deps.library.meanings(up.slice(0, 2).map((d) => `prakriti-care/${d}`));
    return finish('direct', [{ type: 'text', text: T.vikritiIntro[lang] }, vikritiBlock(v, p), ...care.map((m): Block => ({ type: 'meaning', ...m }))], { count: false });
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
      const current = userId ? await deps.ayurveda.vikriti(userId) : null;
      blocks = await prakritiAdvice(deps, q, lang, prakriti, conversation, current);
    } catch (err) {
      return busy(err);
    }
    return finish('ai', blocks, { count: blocks[0]?.type !== 'notice' });
  }

  // 1. Direct answers from the libraries.
  if (intent) {
    const direct = await answerDirect(deps, intent, lang, now, question);
    if (direct) return finish('direct', direct.blocks, { count: direct.counts });
  }

  // A question plainly about the person's own life, with their birth details saved: read their chart
  // straight away (one model call), instead of a general answer that turns out to be personal first.
  if (!shanti && userId && (PERSONAL_CONTEXT.test(q) || LIFE_DECISION.test(q))) {
    const profile = await deps.profiles.get(userId);
    if (profile) return chartOutcome(profile);
  }

  // 2. The same question, word for word (after normalising).
  const normalized = normalizeQuestion(q);
  // Shanti answers live in their own part of the cache, so the two kinds of chat never swap answers.
  const hash = await sha256(shanti ? `shanti|${normalized}` : normalized);
  const cacheNs: Namespace = shanti ? `cache:shanti:${lang}` : `cache:${lang}`;
  // A follow-up wants something beyond what this chat has already shown, so saved answers are skipped.
  const exact = conversation ? null : await deps.cache.exact(lang, hash);
  if (exact && (await stillCurrent(deps, exact))) {
    await deps.cache.hit(exact.id);
    return finish('exact', named(exact.blocks), { count: true, cacheId: exact.id });
  }

  // 3 and 4 need the AI model. If it is down or out of quota, say so politely and don't count it;
  // layers 1 and 2 above keep working.
  // Only the AI calls are guarded, so a database error still surfaces as an error.
  let outcome: Outcome;
  try {
    outcome = await semanticOrGenerated();
  } catch (err) {
    console.error('ai layer failed', err instanceof Error ? err.message : err);
    deps.report?.('ai', err instanceof Error ? err.message : String(err));
    outcome = { layer: 'ai', blocks: [{ type: 'notice', kind: 'busy', text: T.busy[lang] }], count: false, cacheId: null };
  }
  // The model found the question is about the person: answer from their chart if we have it.
  if (!shanti && outcome.personal && userId) {
    const profile = await deps.profiles.get(userId);
    if (profile) return chartOutcome(profile);
  }
  if (outcome.cache) {
    const { blocks, embedding, sources, sourcesHash } = outcome.cache;
    outcome.cacheId = await deps.cache.put({ lang, question: normalized, hash, blocks, sources, sourcesHash, model: deps.ai.model, embedding, kind: shanti ? 'shanti' : 'kosmik' });
    await deps.vectors.add(cacheNs, String(outcome.cacheId), embedding);
  }
  if (outcome.layer === 'semantic' && outcome.cacheId !== null) await deps.cache.hit(outcome.cacheId);
  return finish(outcome.layer, named(outcome.blocks), { count: outcome.count, cacheId: outcome.cacheId });

  async function semanticOrGenerated(): Promise<Outcome> {
    // 3. A question with the same meaning.
    const embedding = await deps.ai.embed(q);
    const [similar] = conversation ? [] : await deps.vectors.search(cacheNs, embedding, 1, SAME_MEANING);
    if (similar) {
      const entry = await deps.cache.byId(Number(similar.id));
      if (entry && (await stillCurrent(deps, entry))) return { layer: 'semantic', blocks: entry.blocks, count: true, cacheId: entry.id };
    }

    // 4. Retrieve sources and ask the model.
    if (shanti) return shantiGenerate(embedding);
    // Ayurveda questions draw on the Ayurveda library only, never Gita verses.
    const ayurvedic = AYURVEDIC.test(q);
    const [verseHits, meaningHits] = await Promise.all([
      ayurvedic ? Promise.resolve([]) : deps.vectors.search('verses', embedding, 5, VERSE_MIN),
      deps.vectors.search('meanings', embedding, 4, MEANING_MIN),
    ]);
    const [verses, meanings] = await Promise.all([deps.library.verses(verseHits.map((h) => h.id)), deps.library.meanings(meaningHits.map((h) => h.id))]);

    let grounded = await deps.ai.answer(q, lang, { verses, meanings }, false, undefined, conversation);
    if (contentProblems(grounded.answer).length) grounded = await deps.ai.answer(q, lang, { verses, meanings }, true, undefined, conversation);
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
      ...extras(grounded),
    ];
    if (grounded.personal) blocks.push({ type: 'notice', kind: 'needs-details', text: T.needsDetails[lang] });

    // An answer written with the earlier turns in view is for this chat only.
    if (conversation || !cacheable(q, grounded.personal)) return { layer: 'ai', blocks, count: true, cacheId: null, personal: grounded.personal };
    const sourcesHash = await sourcesFingerprint(
      verses.filter((v) => sources.includes(v.ref)),
      meanings.filter((m) => sources.includes(`${m.kind}/${m.key}`)),
    );
    return { layer: 'ai', blocks, count: true, cacheId: null, cache: { blocks, sources, sourcesHash, embedding } };
  }

  /** Layer 4 for Shanti: the closest Gita verses, a comforting answer, and an alert when it is needed. */
  async function shantiGenerate(embedding: number[]): Promise<Outcome> {
    if (!deps.ai.shanti) throw new Error('Shanti is not available');
    const [hits, passageHits] = await Promise.all([deps.vectors.search('verses', embedding, 5, VERSE_MIN), deps.vectors.search('passages', embedding, 4, VERSE_MIN)]);
    const [verses, passages] = await Promise.all([deps.library.verses(hits.map((h) => h.id)), deps.library.passages?.(passageHits.map((h) => h.id)) ?? []]);
    const sources = { verses, passages };
    const bad = (t: string) => contentProblems(t).length > 0 || shantiProblems(t).length > 0;
    let reply = await deps.ai.shanti(q, lang, sources, false, conversation);
    if (bad(reply.answer)) reply = await deps.ai.shanti(q, lang, sources, true, conversation);
    if (bad(reply.answer)) return { layer: 'ai', blocks: [{ type: 'text', text: T.unsure[lang] }], count: false, cacheId: null };

    const cited = verses.filter((v) => reply.cited.includes(v.ref)).slice(0, 3);
    const citedPassages = passages.filter((p) => reply.cited.includes(p.ref)).slice(0, 2);
    const blocks: Block[] = [
      { type: 'text', text: reply.answer },
      ...cited.map(verseBlock),
      ...citedPassages.map((p): Block => ({ type: 'passage', ref: p.ref, work: p.work, location: p.location, text: p.text, translator: p.translator, reviewed: p.reviewed })),
    ];
    if (reply.concern === 'high') blocks.push({ type: 'notice', kind: 'helpline', text: `${HELPLINE.name}: ${HELPLINE.number} · ${T.emergency[lang]}: 112` });
    if (reply.concern === 'low') blocks.push({ type: 'text', text: T.shantiLow[lang] });
    const followUps = reply.followUps.filter((t) => !bad(t));
    if (followUps.length) blocks.push({ type: 'followups', questions: followUps });

    // Only general questions, with nothing worrying in them, go in the shared cache.
    if (conversation || reply.concern !== 'none' || !cacheable(q, false) || SHANTI_PERSONAL.test(q)) return { layer: 'ai', blocks, count: true, cacheId: null };
    const sourceIds = [...cited.map((v) => v.ref), ...citedPassages.map((p) => p.ref)];
    const sourcesHash = await sourcesFingerprint(cited, [], citedPassages);
    return { layer: 'ai', blocks, count: true, cacheId: null, cache: { blocks, sources: sourceIds, sourcesHash, embedding } };
  }
}

/** The first word of a saved name ("Adarsh Kumar" → "Adarsh"), or null. */
export function firstName(name: string | null | undefined): string | null {
  return name?.trim().split(/\s+/)[0] || null;
}

/** Fills the {name} token in Shanti's text; without a name, the token and its comma go, and the sentence still reads. */
export function personalize(blocks: Block[], name: string | null): Block[] {
  const fill = (t: string) =>
    name
      ? t.split('{name}').join(name)
      : t
          .replace(/(^|[.!?।]\s+)\{name\},?\s*(\S)/gu, (_m, start: string, c: string) => start + c.toUpperCase())
          .replace(/,?\s*\{name\}/g, '');
  return blocks.map((b) => (b.type === 'text' && b.text.includes('{name}') ? { ...b, text: fill(b.text) } : b));
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
export async function sourcesFingerprint(verses: Verse[], meanings: Meaning[], passages: Passage[] = []): Promise<string> {
  const parts = [
    ...verses.map((v) => [v.ref, v.translation, v.translator].join('\u0000')),
    ...passages.map((p) => [p.ref, p.text, p.translator, p.reviewed ? 1 : 0].join('\u0000')),
    ...meanings.map((m) => [`${m.kind}/${m.key}`, m.title, m.body, m.reviewed ? 1 : 0].join('\u0000')),
  ];
  return sha256(parts.sort().join('\u0001'));
}

/** Whether a cached answer still matches the library. If not, it is retired and a fresh one is written. */
async function stillCurrent(deps: Deps, entry: CacheEntry): Promise<boolean> {
  let current = false;
  if (entry.sourcesHash) {
    // Verse refs look like "BG 2.47"; meaning ids are "kind/key"; passage refs anything else ("MBh 11.2.1a").
    const refs = entry.sources.filter((s) => s.startsWith('BG '));
    const ids = entry.sources.filter((s) => s.includes('/'));
    const other = entry.sources.filter((s) => !s.startsWith('BG ') && !s.includes('/'));
    const [verses, meanings, passages] = await Promise.all([deps.library.verses(refs), deps.library.meanings(ids), other.length ? (deps.library.passages?.(other) ?? []) : []]);
    current =
      verses.length + meanings.length + passages.length === entry.sources.length && (await sourcesFingerprint(verses, meanings, passages)) === entry.sourcesHash;
  }
  if (!current) await deps.cache.retire(entry.id);
  return current;
}

async function answerDirect(deps: Deps, intent: Intent, lang: Lang, now: number, question = ''): Promise<{ blocks: Block[]; counts: boolean } | null> {
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
    case 'tarot-draw':
      // The person picks the card(s) themselves; nothing is drawn or counted until they do.
      return { blocks: [{ type: 'text', text: intent.count === 3 ? T.tarotPickThree[lang] : T.tarotPick[lang] }, { type: 'tarot-pick', count: intent.count, question }], counts: false };
    case 'meaning': {
      const m = await deps.library.meaning(intent.kind, intent.key);
      if (!m) return null;
      const intro = intent.kind.startsWith('tarot') ? T.tarotMeaning[lang] : ['ayurveda', 'dosha', 'prakriti-care'].includes(intent.kind) ? T.herbIntro[lang] : T.meaning[lang];
      return { blocks: [{ type: 'text', text: intro }, { type: 'meaning', ...m }], counts: true };
    }
    case 'herb': {
      const h = await deps.ayurveda.herb(intent.key);
      return h
        ? { blocks: [{ type: 'text', text: T.herbIntro[lang] }, herbBlock(h)], counts: true }
        : { blocks: [{ type: 'text', text: T.herbMissing[lang] }], counts: false };
    }
    case 'herb-list': {
      const filter: HerbFilter = { dosha: intent.dosha, effect: intent.effect, virya: intent.virya, rasa: intent.rasa, guna: intent.guna, vipaka: intent.vipaka };
      const { herbs, total } = await deps.ayurveda.findHerbs(filter, HERB_LIST);
      if (!herbs.length) return null;
      return {
        blocks: [
          { type: 'text', text: T.herbList[lang] },
          { type: 'herb-list', title: lang === 'hi' ? herbListTitleHi(intent) : herbListTitle(intent), total, herbs: herbs.map((h) => ({ key: h.key, name: h.name, english: h.english, virya: h.virya })) },
        ],
        counts: true,
      };
    }
    case 'herb-compare': {
      const hs = await deps.ayurveda.herbs(intent.keys);
      if (hs.length < 2) return null;
      return {
        blocks: [
          { type: 'text', text: T.compareIntro[lang] },
          {
            type: 'herb-compare',
            herbs: hs.map((h) => ({ key: h.key, name: h.name, english: h.english, botanical: h.botanical, rasa: h.rasa, guna: h.guna, virya: h.virya, vipaka: h.vipaka, pacify: h.pacify, aggravate: h.aggravate, parts: h.parts })),
          },
        ],
        counts: true,
      };
    }
    case 'ritu': {
      const { now: rEn, next: nextEn, nextFrom } = rituAt(new Date(now));
      const hi = lang === 'hi';
      const r = hi ? { ...rEn, ...RITUS_HI[rEn.key] } : rEn;
      const next = hi ? { ...nextEn, ...RITUS_HI[nextEn.key] } : nextEn;
      return {
        blocks: [
          { type: 'text', text: T.rituIntro[lang] },
          {
            type: 'ritu',
            ritu: r.ritu,
            sanskrit: r.sanskrit,
            months: r.months,
            ayana: r.ayana,
            strength: r.strength,
            rasa: r.rasa,
            doshas: r.doshas,
            favour: r.favour,
            avoid: r.avoid,
            routine: r.routine,
            next: hi
              ? `${next.ritu} लगभग ${fmtDateHi(new Date(nextFrom))} से शुरू`
              : `${next.ritu} begins around ${new Date(nextFrom).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })}`,
          },
        ],
        counts: true,
      };
    }
    case 'zodiac':
    case 'ayur-consult':
    case 'needs-chart':
    case 'palm':
    case 'prakriti':
    case 'prakriti-advice':
    case 'vikriti':
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

export function chartBlock(chart: Chart, now?: Date, lang: Lang = 'en'): Block {
  const hi = lang === 'hi';
  const r = (k: string) => (hi ? devanagari(nameOf.rashi(k)) : `${nameOf.rashi(k).name} (${nameOf.rashi(k).english})`);
  const nak = NAKSHATRAS.find((n) => n.key === chart.moonNakshatra.key)!;
  return {
    type: 'chart',
    lagna: chart.lagna ? r(chart.lagna.rashi) : null,
    moon: r(chart.grahas.find((p) => p.graha === 'moon')!.rashi),
    nakshatra: hi ? `${devanagari(nak)}, पद ${chart.moonNakshatra.pada}` : `${nak.name}, pada ${chart.moonNakshatra.pada}`,
    dasha: now ? dashaLine(chart, now, lang) : null,
    rows: chart.grahas.map((p) => ({
      graha: hi ? devanagari(nameOf.graha(p.graha)) : `${nameOf.graha(p.graha).name} (${nameOf.graha(p.graha).english})`,
      rashi: r(p.rashi),
      house: p.house ? (hi ? `भाव ${p.house}` : ordinal(p.house)) : null,
      retrograde: p.retrograde && p.graha !== 'rahu' && p.graha !== 'ketu',
    })),
  };
}

/** Asking for the kundli or birth chart itself ("read my kundli", "meri kundli dikhao"), not a topic in it. */
export const KUNDLI_ITSELF =
  /^\W*((please|pls|can you|could you|kindly)\s+)?((read|show|analy[sz]e|explain|see|check|open|make|give|tell me about)( me)?\s+)?(my|meri|mera)\s+(janam\s+)?(kundli|kundali|birth\s*chart|natal\s*chart|chart|horoscope)(\s+(dikhao|batao|padho|banao|please|pls|reading))?\W*$|^\W*(मेरी|मेरा)\s+(जन्म\s+)?(कुंडली|कुण्डली)(\s+(दिखाओ|बताओ|दिखाइए|बताइए|पढ़ो))?\W*$|\b(sun sign|star sign|zodiac|western|tropical|big three|rising sign)\b/i;

/** Answers a question about the person's own chart, calculated from their saved birth details. */
async function chartAnswer(deps: Deps, question: string, lang: Lang, profile: Profile, conversation: string | undefined, now: number): Promise<Block[]> {
  const chart = calculateChart(toBirth(profile));
  const meanings = await deps.library.meanings(chartSources(chart, question));
  const western = westernIntro(chart, now, lang);
  // The two Western lines only when the person asks for their kundli itself, once per chat; any
  // other chart question goes straight to the reading.
  const showWestern = KUNDLI_ITSELF.test(question) && !/Western astrology:|पश्चिमी ज्योतिष:/.test(conversation ?? '');
  const facts = `CHART (calculated, sidereal, Lahiri, whole-sign houses, Vimshottari dasha):\n${deepChart(chart, new Date(now), profile.name)}\n\nWESTERN (tropical). ${showWestern ? 'The app already shows the person this two-line Western summary just above your answer, so do NOT repeat it; write only the Vedic reading from the kundli' : 'Use only if they ask about Western astrology or sun signs. Start with their first name and the verdict; no heading or label before it'}:\n${describeTropical(chart, new Date(now))}`;
  const open = deps.astroMode === 'open';
  let grounded = await deps.ai.answer(question, lang, { verses: [], meanings }, false, facts, conversation);
  if (contentProblems(grounded.answer, [], { open }).length) grounded = await deps.ai.answer(question, lang, { verses: [], meanings }, true, facts, conversation);
  if (contentProblems(grounded.answer, [], { open }).length) return [{ type: 'notice', kind: 'busy', text: T.unsure[lang] }];
  const cited = meanings.filter((m) => grounded.cited.includes(`${m.kind}/${m.key}`)).slice(0, 3);
  return [
    ...(showWestern ? [{ type: 'text', text: western } as Block] : []),
    { type: 'text', text: showWestern ? `${T.vedicIntro[lang]} ${grounded.answer}` : grounded.answer },
    ...extras(grounded, (t) => !contentProblems(t, [], { open }).length).filter((b) => b.type === 'behind'),
    chartBlock(chart, new Date(now), lang),
    ...cited.map((m): Block => ({ type: 'meaning', ...m })),
    ...extras(grounded, (t) => !contentProblems(t, [], { open }).length).filter((b) => b.type === 'followups'),
  ];
}

/** Two lines of Western (tropical) astrology, shown before the Vedic reading, in the chat's language. */
export function westernIntro(chart: Parameters<typeof zodiac>[0], now: number, lang: Lang = 'en'): string {
  const z = zodiac(chart, new Date(now));
  const sign = (lon: number) => Math.floor((((lon % 360) + 360) % 360) / 30);
  const deg = (lon: number) => `${Math.floor(lon % 30)}°${String(Math.floor(((lon % 30) % 1) * 60)).padStart(2, '0')}′`;
  const name = (lon: number) => (lang === 'hi' ? `${SIGNS_HI[sign(lon)]} (${SIGNS[sign(lon)]})` : SIGNS[sign(lon)]);
  const label = { en: ['Western astrology', 'Sun', 'Moon', 'Rising'], hi: ['पश्चिमी ज्योतिष', 'सूर्य', 'चंद्र', 'लग्न (राइज़िंग)'], hinglish: ['Western astrology', 'Sun', 'Moon', 'Rising'] }[lang];
  const parts = [
    `${label[1]} ${z.sun.glyph} ${deg(z.sun.lon)} ${name(z.sun.lon)}`,
    `${label[2]} ${z.moon.glyph} ${deg(z.moon.lon)} ${name(z.moon.lon)}`,
    z.rising ? `${label[3]} ${z.rising.glyph} ${deg(z.rising.lon)} ${name(z.rising.lon)}` : null,
  ].filter(Boolean);
  const vibe = lang === 'hi' ? [SUN_VIBE_HI[sign(z.sun.lon)], MOON_VIBE_HI[sign(z.moon.lon)]] : lang === 'hinglish' ? [SUN_VIBE_HINGLISH[sign(z.sun.lon)], MOON_VIBE_HINGLISH[sign(z.moon.lon)]] : [z.sun.vibe, z.moon.vibe];
  const cusp = z.cusp ? (lang === 'hi' ? ` (${z.cusp} पर जन्म)` : ` (born on the ${z.cusp})`) : '';
  return `${label[0]}: ${parts.join(' · ')}${cusp}${lang === 'hi' ? '।' : '.'}\n${vibe.join(' ')}`;
}

/** Reads the person's saved palm photos, with their question in mind. */
async function palmAnswer(deps: Deps, question: string, lang: Lang, photos: { hand: 'left' | 'right'; mime: string; data: string }[]): Promise<Block[]> {
  const images = photos.map((p) => ({ data: p.data, mime: p.mime, hand: p.hand }));
  const open = deps.astroMode === 'open';
  const safe = (r: { overview: string; lines: { reading: string }[] }) => ![r.overview, ...r.lines.map((l) => l.reading)].some((t) => contentProblems(t, [], { open }).length);
  let reading = await deps.ai.readPalm(images, lang, { question });
  if (reading.isPalm && !safe(reading)) reading = await deps.ai.readPalm(images, lang, { question, stricter: true });
  if (!reading.isPalm) return [{ type: 'notice', kind: 'retake', text: `${T.palmRetake[lang]} ${reading.overview}` }];
  if (!safe(reading)) return [{ type: 'notice', kind: 'busy', text: T.unsure[lang] }];
  return [
    { type: 'text', text: `${T.palmIntro[lang]} ${reading.overview}` },
    { type: 'palm', lines: reading.lines },
  ];
}

const HERB_LIST = 12;

/** The fold-out reasoning and the ask-next questions that close an AI answer. */
function extras(g: { followUps?: string[]; behind?: string[]; offTopic?: boolean }, contentOk = (t: string) => !contentProblems(t).length): Block[] {
  const out: Block[] = [];
  const behind = (g.behind ?? []).filter(contentOk);
  const next = (g.followUps ?? []).filter(contentOk);
  if (behind.length) out.push({ type: 'behind', points: behind });
  if (next.length && !g.offTopic) out.push({ type: 'followups', questions: next });
  return out;
}
const cap = (d: string) => d[0].toUpperCase() + d.slice(1);

export function herbListTitle(f: { dosha?: Dosha; effect: 'pacify' | 'aggravate'; virya?: string; rasa?: string[]; guna?: string[]; vipaka?: string }): string {
  const props = [
    ...(f.rasa ?? []).map((r) => `${r.toLowerCase()} rasa`),
    ...(f.guna ?? []).map((g) => g.toLowerCase()),
    ...(f.virya ? [f.virya === 'Sheeta' ? 'sheeta (cooling) virya' : 'ushna (heating) virya'] : []),
    ...(f.vipaka ? [`${f.vipaka.toLowerCase()} vipaka`] : []),
  ];
  const base = f.dosha ? (f.effect === 'pacify' ? `Herbs that balance ${cap(f.dosha)}` : `Herbs that may increase ${cap(f.dosha)}`) : 'Herbs';
  if (!props.length) return f.dosha ? base : f.virya === 'Sheeta' ? 'Cooling (sheeta) herbs' : 'Heating (ushna) herbs';
  return `${base} with ${props.join(', ')}`;
}

const DOSHA_HI: Record<string, string> = { vata: 'वात', pitta: 'पित्त', kapha: 'कफ' };
const TERM_HI: Record<string, string> = {
  Katu: 'कटु', Tikta: 'तिक्त', Amla: 'अम्ल', Kashaya: 'कषाय', Madhura: 'मधुर', Lavana: 'लवण',
  Laghu: 'लघु', Ruksha: 'रूक्ष', Snigdha: 'स्निग्ध', Guru: 'गुरु', Sara: 'सर', Tikshna: 'तीक्ष्ण',
};

/** The herb list title in Hindi, e.g. "पित्त को संतुलित करने वाली जड़ी-बूटियाँ (मधुर रस)". */
export function herbListTitleHi(f: { dosha?: Dosha; effect: 'pacify' | 'aggravate'; virya?: string; rasa?: string[]; guna?: string[]; vipaka?: string }): string {
  const props = [
    ...(f.rasa ?? []).map((r) => `${TERM_HI[r] ?? r} रस`),
    ...(f.guna ?? []).map((g) => TERM_HI[g] ?? g),
    ...(f.virya ? [f.virya === 'Sheeta' ? 'शीत वीर्य' : 'उष्ण वीर्य'] : []),
    ...(f.vipaka ? [`${TERM_HI[f.vipaka] ?? f.vipaka} विपाक`] : []),
  ];
  const base = f.dosha
    ? f.effect === 'pacify'
      ? `${DOSHA_HI[f.dosha]} को संतुलित करने वाली जड़ी-बूटियाँ`
      : `${DOSHA_HI[f.dosha]} बढ़ा सकने वाली जड़ी-बूटियाँ`
    : f.virya === 'Sheeta'
      ? 'शीत (ठंडक देने वाली) जड़ी-बूटियाँ'
      : f.virya === 'Ushna' && !props.length
        ? 'उष्ण (गर्म) जड़ी-बूटियाँ'
        : 'जड़ी-बूटियाँ';
  return props.length ? `${base} (${props.join(', ')})` : base;
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
async function prakritiAdvice(deps: Deps, question: string, lang: Lang, p: Prakriti, conversation: string | undefined, v: Vikriti | null): Promise<Block[]> {
  const lead = dominant(p).slice(0, 2);
  const { herbs } = await deps.ayurveda.findHerbs({ dosha: lead[0], effect: 'pacify' }, 4);
  const meanings = await deps.library.meanings([...lead.flatMap((d) => [`dosha/${d}`, `prakriti-care/${d}`]), ...herbs.map((h) => `herb/${h.key}`)]);
  const facts = `PRAKRITI (the person's own dosha self-assessment quiz): Vata ${p.vata}%, Pitta ${p.pitta}%, Kapha ${p.kapha}% (${prakritiLabel(p)}).${
    v ? `\nVIKRITI now (short check of the last few weeks; signs out of 10): Vata ${v.vata}, Pitta ${v.pitta}, Kapha ${v.kapha}; raised: ${aggravated(v).join(', ') || 'none'}; ${AGNI_LABEL[v.agni]}. Balance the raised dosha first.` : ''
  }`;
  let grounded = await deps.ai.answer(question, lang, { verses: [], meanings }, false, facts, conversation);
  if (contentProblems(grounded.answer).length) grounded = await deps.ai.answer(question, lang, { verses: [], meanings }, true, facts, conversation);
  if (contentProblems(grounded.answer).length) return [{ type: 'notice', kind: 'busy', text: T.unsure[lang] }];
  const cited = meanings.filter((m) => grounded.cited.includes(`${m.kind}/${m.key}`)).slice(0, 3);
  return [{ type: 'text', text: grounded.answer }, prakritiBlock(p), ...(await meaningBlocks(deps, cited)), ...extras(grounded)];
}

/** An Ayurveda consultation turn: intake questions first if needed, then an assessment and plan. */
async function ayurConsult(deps: Deps, question: string, lang: Lang, userId: string | null, herb: string | undefined, conversation: string | undefined, now: number): Promise<Block[]> {
  if (!deps.ai.ayurveda) throw new Error('Ayurveda consultations are not available');
  const [profile, prakriti, vikriti] = userId ? await Promise.all([deps.profiles.get(userId), deps.ayurveda.prakriti(userId), deps.ayurveda.vikriti(userId)]) : [null, null, null];
  const embedding = await deps.ai.embed(question);
  const hits = await deps.vectors.search('meanings', embedding, 10, 0.4);
  const ids = [...(herb ? [`herb/${herb}`] : []), ...hits.map((h) => h.id).filter((id) => /^(herb|ayurveda|dosha|prakriti-care)\//.test(id))].slice(0, 8);
  const meanings = await deps.library.meanings(ids);
  const ritu = rituAt(new Date(now)).now;
  const age = profile ? Math.floor((now - Date.parse(profile.birthDate)) / (365.25 * 86_400_000)) : null;
  const person = [
    profile?.name ? `Name: ${profile.name}` : null,
    profile?.gender ? `Gender: ${profile.gender}` : null,
    age !== null ? `Age: ${age}` : null,
    prakriti ? `Prakriti (quiz): Vata ${prakriti.vata}%, Pitta ${prakriti.pitta}%, Kapha ${prakriti.kapha}% (${prakritiLabel(prakriti)})` : null,
    vikriti ? `Vikriti (check, signs of 10): Vata ${vikriti.vata}, Pitta ${vikriti.pitta}, Kapha ${vikriti.kapha}; ${AGNI_LABEL[vikriti.agni]}` : null,
  ].filter(Boolean);
  const context = [
    person.length ? `PERSON:\n${person.join('\n')}` : 'PERSON: not known',
    `SEASON: ${ritu.ritu}; ${ritu.doshas}; ${ritu.rasa}`,
    `SOURCES:\n${meanings.map((m) => `[${m.kind}/${m.key}] ${m.title}: ${m.body}`).join('\n') || '(none)'}`,
  ].join('\n\n');
  const c = await deps.ai.ayurveda(question, lang, context, conversation);
  const blocks: Block[] = [{ type: 'text', text: c.reply }];
  if (c.mode === 'ask') {
    blocks.push({ type: 'ayur-intake', questions: c.questions });
    return blocks;
  }
  blocks.push({
    type: 'ayur-plan',
    assessment: c.assessment,
    favour: c.favour,
    avoid: c.avoid,
    lifestyle: c.lifestyle,
    remedies: c.remedies,
    formulations: c.formulations,
    yoga: c.yoga,
    redFlags: c.redFlags,
    shloka: c.shloka,
  });
  if (c.followUps.length) blocks.push({ type: 'followups', questions: c.followUps });
  return blocks;
}

/** Draws the picked card(s) and reads them for the person's question. */
async function tarotReading(deps: Deps, question: string, lang: Lang, count: 1 | 3, userId: string | null, conversationId: string | null): Promise<Block[]> {
  const spread = (await drawTarot(deps, count)) as Extract<Block, { type: 'tarot' }>;
  if (!deps.ai.tarot) return [{ type: 'text', text: T.tarot[lang] }, spread];
  const profile = userId ? await deps.profiles.get(userId) : null;
  const past = userId && conversationId ? await deps.history.recent(userId, conversationId, CONTEXT_MESSAGES) : [];
  const context = profile?.name ? `PERSON: ${profile.name}${profile.gender ? `, ${profile.gender}` : ''}` : '';
  const r = await deps.ai.tarot(question, lang, spread.cards, context, past.length ? describeConversation(past) : undefined);
  const cards = spread.cards.map((c, i) => {
    const t = TAROT.find((x) => x.key === c.key)!;
    // The card shows its position and name, so drop a "Past — Justice:" lead-in from the reading.
    const reading = r.readings[i]?.replace(new RegExp(`^[^:]{0,80}(${c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${c.position})[^:]{0,40}:\\s*`, 'i'), '');
    return { ...c, reading, arcana: t.arcana, ...(t.arcana === 'major' ? { number: t.number } : { suit: t.suit }) };
  });
  const blocks: Block[] = [{ type: 'tarot', cards, ...(r.advice ? { advice: r.advice } : {}) }, { type: 'text', text: r.answer }];
  if (r.followUps.length) blocks.push({ type: 'followups', questions: r.followUps });
  return blocks;
}
