/**
 * The Western (tropical) zodiac, from the same birth moment as the Vedic chart: signs counted
 * from the equinox rather than the stars, so they sit about 24° ahead of the sidereal ones.
 * Also where the Sun stood on the birthday, and the solar return: the moment each year the Sun
 * comes back to exactly that degree.
 */
import { RASHIS } from './catalog.ts';
import { type Chart, tropical } from './chart.ts';

export const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];

/** One short line per sign, for each of the big three. */
const SUN_VIBE = [
  'Main-character energy: you start things and move first.',
  'Steady, loyal and here for the good things in life.',
  'Curious, quick and always in three conversations at once.',
  'Soft heart, strong shell; your people are everything.',
  'Warm, generous and made to be seen.',
  'Detail-brain: you fix, improve and quietly carry the team.',
  'Charm, taste and a need for things to feel fair.',
  'Deep, private and all-in when you care.',
  'Free spirit with big questions and bigger plans.',
  'Long-game player: ambitious, patient, built to last.',
  'Original thinker who does it your own way.',
  'Dreamy, intuitive and kinder than you let on.',
];
const MOON_VIBE = [
  'You feel fast and fire up quickly, then move on.',
  'You need calm, comfort and routine to feel safe.',
  'You process feelings by talking them out.',
  'You feel everything deeply and need a soft place to land.',
  'You need to feel appreciated; warmth fills your cup.',
  'You calm down by sorting, fixing and tidying.',
  'You need harmony; conflict drains you.',
  'Your feelings run deep and you guard them closely.',
  'You need space and something to look forward to.',
  'You keep feelings in check and lean on structure.',
  'You need room to be yourself, even in closeness.',
  'You absorb the mood of every room you walk into.',
];
const RISING_VIBE = [
  'First impression: bold, direct, ready to go.',
  'First impression: calm, grounded, easy to trust.',
  'First impression: chatty, witty, curious.',
  'First impression: caring, gentle, a little reserved.',
  'First impression: confident and hard to miss.',
  'First impression: neat, sharp, put-together.',
  'First impression: charming and easy to be around.',
  'First impression: magnetic and a bit mysterious.',
  'First impression: open, funny, up for anything.',
  'First impression: serious, capable, older than your years.',
  'First impression: friendly, quirky, original.',
  'First impression: soft, dreamy, kind.',
];

/** The same lines in Hindi and Hinglish, sign by sign. */
export const SIGNS_HI = ['मेष', 'वृषभ', 'मिथुन', 'कर्क', 'सिंह', 'कन्या', 'तुला', 'वृश्चिक', 'धनु', 'मकर', 'कुंभ', 'मीन'];
export const SUN_VIBE_HI = [
  'मेन-कैरेक्टर एनर्जी: आप शुरुआत करते हैं और सबसे पहले कदम उठाते हैं।',
  'स्थिर, वफ़ादार और ज़िंदगी की अच्छी चीज़ों के शौकीन।',
  'जिज्ञासु, तेज़ और एक साथ तीन बातचीत में।',
  'दिल नरम, बाहर से मज़बूत; आपके अपने ही आपकी दुनिया हैं।',
  'गर्मजोशी भरे, दिलदार और सबकी नज़रों में रहने के लिए बने।',
  'बारीकी वाला दिमाग़: आप सुधारते हैं और चुपचाप टीम संभालते हैं।',
  'आकर्षण, अच्छा टेस्ट और हर चीज़ में न्याय की चाह।',
  'गहरे, निजी और जिसकी परवाह करें उसके लिए पूरी तरह समर्पित।',
  'आज़ाद रूह, बड़े सवाल और उससे भी बड़े प्लान।',
  'लंबी रेस के खिलाड़ी: महत्वाकांक्षी, धैर्यवान, टिकाऊ।',
  'मौलिक सोच वाले, जो हर काम अपने तरीके से करते हैं।',
  'सपनों में खोए, अंतर्ज्ञानी और जितना दिखाते हैं उससे ज़्यादा दयालु।',
];
export const MOON_VIBE_HI = [
  'आप जल्दी महसूस करते हैं, जल्दी भड़कते हैं और फिर आगे बढ़ जाते हैं।',
  'सुरक्षित महसूस करने के लिए आपको सुकून, आराम और रूटीन चाहिए।',
  'आप अपनी भावनाएँ बात करके सुलझाते हैं।',
  'आप हर चीज़ गहराई से महसूस करते हैं और आपको एक नरम सहारा चाहिए।',
  'आपको सराहना चाहिए; अपनापन ही आपको भरता है।',
  'आप चीज़ें व्यवस्थित करके और सुधारकर शांत होते हैं।',
  'आपको सामंजस्य चाहिए; झगड़ा आपको थका देता है।',
  'आपकी भावनाएँ गहरी हैं और आप उन्हें संभालकर रखते हैं।',
  'आपको स्पेस और आगे देखने के लिए कुछ नया चाहिए।',
  'आप भावनाओं को काबू में रखते हैं और ढाँचे पर भरोसा करते हैं।',
  'करीबी रिश्तों में भी आपको खुद जैसा रहने की जगह चाहिए।',
  'आप हर कमरे का मूड अपने अंदर समा लेते हैं।',
];
export const RISING_VIBE_HI = [
  'पहली छाप: बेबाक, सीधे, हमेशा तैयार।',
  'पहली छाप: शांत, ज़मीन से जुड़े, भरोसेमंद।',
  'पहली छाप: बातूनी, हाज़िरजवाब, जिज्ञासु।',
  'पहली छाप: परवाह करने वाले, नरम, थोड़े संकोची।',
  'पहली छाप: आत्मविश्वासी और नज़र से न छूटने वाले।',
  'पहली छाप: सलीकेदार, तेज़, व्यवस्थित।',
  'पहली छाप: आकर्षक और जिनके साथ रहना आसान है।',
  'पहली छाप: चुंबकीय और थोड़े रहस्यमय।',
  'पहली छाप: खुले दिल के, मज़ाकिया, हर चीज़ के लिए तैयार।',
  'पहली छाप: गंभीर, काबिल, उम्र से ज़्यादा परिपक्व।',
  'पहली छाप: दोस्ताना, अनोखे, मौलिक।',
  'पहली छाप: नरम, सपनों में खोए, दयालु।',
];

/** The zodiac card in Hindi: Hindi sign names (English in brackets) and the Hindi lines. */
export function zodiacHi<T extends { sign: string; lon: number; vibe: string }>(p: T, kind: 'sun' | 'moon' | 'rising'): T {
  const i = Math.floor((((p.lon % 360) + 360) % 360) / 30);
  const vibe = (kind === 'sun' ? SUN_VIBE_HI : kind === 'moon' ? MOON_VIBE_HI : RISING_VIBE_HI)[i];
  return { ...p, sign: `${SIGNS_HI[i]} (${p.sign})`, vibe };
}

export const SUN_VIBE_HINGLISH = [
  'Main-character energy: aap shuruaat karte ho aur sabse pehle move karte ho.',
  'Steady, loyal aur life ki achhi cheezon ke shaukeen.',
  'Curious, quick aur ek saath teen conversations mein.',
  'Dil soft, bahar se strong; aapke apne hi aapki duniya hain.',
  'Warm, dildaar aur sabki nazron mein rehne ke liye bane.',
  'Detail-brain: aap fix karte ho aur chupchaap team sambhalte ho.',
  'Charm, achha taste aur har cheez mein fairness ki chaah.',
  'Deep, private aur jiski care karo uske liye all-in.',
  'Free spirit, bade sawaal aur usse bhi bade plans.',
  'Long-game player: ambitious, patient aur tikau.',
  'Original thinker jo har kaam apne tareeke se karta hai.',
  'Dreamy, intuitive aur jitna dikhate ho usse zyada kind.',
];
export const MOON_VIBE_HINGLISH = [
  'Aap jaldi feel karte ho, jaldi bhadakte ho, phir move on kar lete ho.',
  'Safe feel karne ke liye aapko sukoon, comfort aur routine chahiye.',
  'Aap feelings baat karke process karte ho.',
  'Aap sab kuch deeply feel karte ho aur ek soft sahara chahiye.',
  'Aapko appreciation chahiye; apnapan hi aapka cup bharta hai.',
  'Aap cheezein sort aur fix karke calm hote ho.',
  'Aapko harmony chahiye; jhagda aapko drain karta hai.',
  'Aapki feelings gehri hain aur aap unhe sambhal kar rakhte ho.',
  'Aapko space aur aage dekhne ke liye kuch naya chahiye.',
  'Aap feelings control mein rakhte ho aur structure pe bharosa karte ho.',
  'Closeness mein bhi aapko khud jaisa rehne ki jagah chahiye.',
  'Aap har room ka mood apne andar le lete ho.',
];

const norm = (x: number) => ((x % 360) + 360) % 360;
/** "23°41′ Scorpio" */
export const degreeText = (lon: number) => {
  const inSign = norm(lon) % 30;
  const d = Math.floor(inSign);
  const m = Math.floor((inSign - d) * 60);
  return `${d}°${String(m).padStart(2, '0')}′ ${SIGNS[Math.floor(norm(lon) / 30)]}`;
};
const signOf = (lon: number) => Math.floor(norm(lon) / 30);

export type Placement = { sign: string; glyph: string; degree: string; lon: number };
const place = (lon: number): Placement => ({ sign: SIGNS[signOf(lon)], glyph: GLYPHS[signOf(lon)], degree: degreeText(lon), lon: Math.round(norm(lon) * 1000) / 1000 });

/** Tropical longitude = sidereal longitude + ayanamsa. */
export function tropicalChart(chart: Chart) {
  const at = (g: string) => chart.grahas.find((p) => p.graha === g)!;
  const trop = (lon: number) => norm(lon + chart.ayanamsa);
  const sun = place(trop(at('sun').lon));
  const moon = place(trop(at('moon').lon));
  const rising = chart.lagna ? place(trop(RASHI_START(chart.lagna.rashi) + chart.lagna.degree)) : null;
  const planets = chart.grahas.map((p) => ({ graha: p.graha, ...place(trop(p.lon)) }));
  return { sun, moon, rising, planets };
}

const RASHI_KEYS = ['mesh', 'vrishabh', 'mithun', 'kark', 'simha', 'kanya', 'tula', 'vrishchik', 'dhanu', 'makar', 'kumbh', 'meen'];
const RASHI_START = (key: string) => RASHI_KEYS.indexOf(key) * 30;

/** Born within a degree of a sign change: "on the Scorpio–Sagittarius cusp". */
export function cusp(lon: number): string | null {
  const inSign = norm(lon) % 30;
  const i = signOf(lon);
  if (inSign < 1) return `${SIGNS[(i + 11) % 12]}–${SIGNS[i]} cusp`;
  if (inSign > 29) return `${SIGNS[i]}–${SIGNS[(i + 1) % 12]} cusp`;
  return null;
}

/** The next moment (after `after`) the Sun returns to the birth longitude, to about a minute. */
export function solarReturn(sunLon: number, born: Date, after: Date): Date {
  const birthday = (year: number) => new Date(Date.UTC(year, born.getUTCMonth(), born.getUTCDate(), born.getUTCHours(), born.getUTCMinutes()));
  let year = after.getUTCFullYear();
  if (+birthday(year) < +after - 2 * 86_400_000) year++;
  let t = +birthday(year);
  // Newton's method on the Sun's longitude (about 0.9856° a day).
  for (let i = 0; i < 8; i++) {
    const diff = ((sunLon - tropical('sun', new Date(t)) + 540) % 360) - 180;
    t += (diff / 0.98565) * 86_400_000;
    if (Math.abs(diff) < 1e-5) break;
  }
  if (t < +after) return solarReturn(sunLon, born, new Date(+after + 300 * 86_400_000));
  return new Date(t);
}

export const when = (d: Date) =>
  d.toLocaleString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export type Zodiac = ReturnType<typeof zodiac>;

/** Everything the zodiac card shows. */
export function zodiac(chart: Chart, now: Date) {
  const t = tropicalChart(chart);
  const vedicSun = chart.grahas.find((p) => p.graha === 'sun')!;
  const ret = solarReturn(t.sun.lon, chart.born, now);
  return {
    sun: { ...t.sun, vibe: SUN_VIBE[signOf(t.sun.lon)] },
    moon: { ...t.moon, vibe: MOON_VIBE[signOf(t.moon.lon)] },
    rising: t.rising ? { ...t.rising, vibe: RISING_VIBE[signOf(t.rising.lon)] } : null,
    planets: t.planets,
    siderealSun: `${Math.floor(vedicSun.degree)}°${String(Math.floor((vedicSun.degree % 1) * 60)).padStart(2, '0')}′ ${(() => { const r = RASHIS.find((x) => x.key === vedicSun.rashi)!; return `${r.name} (${r.english})`; })()}`,
    cusp: cusp(t.sun.lon),
    solarReturn: `${when(ret)} (India time)`,
    ayanamsa: chart.ayanamsa,
  };
}

/** The tropical facts, as lines for the model. */
export function describeTropical(chart: Chart, now: Date): string {
  const z = zodiac(chart, now);
  return [
    `Western (tropical) signs: Sun ${z.sun.degree}, Moon ${z.moon.degree}${z.rising ? `, Rising ${z.rising.degree}` : ', Rising unknown (no birth time)'}${z.cusp ? `; born on the ${z.cusp}` : ''}`,
    `Tropical planets: ${z.planets.map((p) => `${p.graha} ${p.degree}`).join('; ')}`,
    `Next solar return (Sun back at its birth degree): ${z.solarReturn}`,
    `Tropical signs run about ${z.ayanamsa.toFixed(1)}° ahead of the sidereal (Vedic) ones.`,
  ].join('\n');
}
