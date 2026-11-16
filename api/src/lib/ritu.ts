/**
 * Ritucharya: the six Ayurvedic seasons, worked out from the Sun's sidereal sign (two signs per
 * ritu, as the classical texts reckon them), with how the doshas behave and the traditional
 * guidance for each. From Charaka Samhita, Sutrasthana 6, and Ashtanga Hridaya, Sutrasthana 3,
 * summarised as traditional knowledge.
 */
import { MakeTime } from 'astronomy-engine';

import { lahiri, tropical } from './chart.ts';

export type Ritu = {
  key: string;
  ritu: string;
  sanskrit: string;
  signs: [number, number];
  months: string;
  ayana: string;
  strength: string;
  rasa: string;
  doshas: string;
  favour: string[];
  avoid: string[];
  routine: string[];
};

/** Sidereal sign indexes: 0 Mesha … 11 Meena. */
export const RITUS: Ritu[] = [
  {
    key: 'shishira', ritu: 'Shishira (late winter)', sanskrit: 'शिशिर', signs: [9, 10], months: 'about mid-January to mid-March',
    ayana: 'Uttarayana (Adana kala): the sun draws strength from living beings', strength: 'Strength is still high, starting to wane',
    rasa: 'Tikta (bitter) predominates in nature', doshas: 'Kapha accumulates (sanchaya)',
    favour: ['Warm, unctuous, nourishing food as in Hemanta', 'Madhura, amla and lavana tastes', 'Wheat, milk products, ghee, sesame, jaggery', 'Warm water'],
    avoid: ['Cold, dry, light and Vata-increasing food', 'Exposure to cold wind', 'Fasting for long'],
    routine: ['Oil massage (abhyanga) and warm baths', 'Regular exercise', 'Warm clothing and sunlight in the morning'],
  },
  {
    key: 'vasanta', ritu: 'Vasanta (spring)', sanskrit: 'वसन्त', signs: [11, 0], months: 'about mid-March to mid-May',
    ayana: 'Uttarayana (Adana kala)', strength: 'Moderate',
    rasa: 'Kashaya (astringent) predominates', doshas: 'Kapha is aggravated (prakopa) as the sun melts what winter stored',
    favour: ['Light, dry, easily digested food', 'Katu, tikta and kashaya tastes', 'Old barley and wheat, honey, mudga (moong)', 'Warm water, ginger water'],
    avoid: ['Heavy, oily, sweet and sour food', 'Curd and cold drinks', 'Sleeping in the day'],
    routine: ['Brisk exercise', 'Dry powder massage (udvartana)', 'Classical texts describe vamana (therapeutic emesis) in this season, done only by a vaidya'],
  },
  {
    key: 'grishma', ritu: 'Grishma (summer)', sanskrit: 'ग्रीष्म', signs: [1, 2], months: 'about mid-May to mid-July',
    ayana: 'Uttarayana (Adana kala)', strength: 'Lowest of the year',
    rasa: 'Katu (pungent) predominates', doshas: 'Vata accumulates (sanchaya); Kapha settles (prashamana)',
    favour: ['Sweet, cool, liquid and light food', 'Madhura taste', 'Rice, milk, ghee, sweet fruits, cool water, panaka (sweet drinks)', 'Buttermilk'],
    avoid: ['Lavana, amla and katu tastes', 'Hot, spicy, fried food', 'Alcohol', 'Hard exercise in the heat'],
    routine: ['Rest in cool places', 'Light exercise only', 'Short afternoon rest is allowed in this season'],
  },
  {
    key: 'varsha', ritu: 'Varsha (monsoon)', sanskrit: 'वर्षा', signs: [3, 4], months: 'about mid-July to mid-September',
    ayana: 'Dakshinayana (Visarga kala): the moon restores strength', strength: 'Low; agni is weak',
    rasa: 'Amla (sour) predominates', doshas: 'Vata is aggravated (prakopa); Pitta accumulates (sanchaya)',
    favour: ['Freshly cooked, warm, light food', 'Old rice, wheat and barley', 'Mildly amla and lavana tastes, honey', 'Boiled and cooled water'],
    avoid: ['Heavy and stale food', 'River water and raw salads', 'Sleeping in the day', 'Over-exertion'],
    routine: ['Keep the body and surroundings dry', 'Oil massage', 'Classical texts describe basti (medicated enema) in this season, done only by a vaidya'],
  },
  {
    key: 'sharad', ritu: 'Sharad (autumn)', sanskrit: 'शरद्', signs: [5, 6], months: 'about mid-September to mid-November',
    ayana: 'Dakshinayana (Visarga kala)', strength: 'Moderate',
    rasa: 'Lavana (salty) predominates', doshas: 'Pitta is aggravated (prakopa); Vata settles (prashamana)',
    favour: ['Sweet, bitter and astringent tastes', 'Light, cooling food: rice, moong, ghee, amla (Indian gooseberry)', 'Water warmed by day and cooled by the moon (hamsodaka)'],
    avoid: ['Curd, oils and fried food', 'Hot, sour and spicy food', 'Strong sun and sleeping in the day'],
    routine: ['Moonlight walks in the evening', 'Cool, light clothing', 'Classical texts describe virechana (therapeutic purgation) in this season, done only by a vaidya'],
  },
  {
    key: 'hemanta', ritu: 'Hemanta (early winter)', sanskrit: 'हेमन्त', signs: [7, 8], months: 'about mid-November to mid-January',
    ayana: 'Dakshinayana (Visarga kala)', strength: 'Highest of the year; agni is strong',
    rasa: 'Madhura (sweet) predominates', doshas: 'Pitta settles (prashamana)',
    favour: ['Nourishing, unctuous food', 'Madhura, amla and lavana tastes', 'Wheat, urad, milk, ghee, jaggery, sesame', 'Warm water'],
    avoid: ['Light, cold and dry food', 'Fasting or skipping meals: the strong agni needs fuel', 'Cold drinks'],
    routine: ['Oil massage and exercise', 'Warm baths and warm clothing', 'Morning sunlight'],
  },
];

const siderealSun = (d: Date) => (((tropical('sun', d) - lahiri(MakeTime(d).tt)) % 360) + 360) % 360;

/** The ritu running on a date, and the next one with roughly when it starts. */
export function rituAt(date: Date): { now: Ritu; next: Ritu; nextFrom: Date } {
  const sign = Math.floor(siderealSun(date) / 30);
  const i = RITUS.findIndex((r) => r.signs.includes(sign));
  const now = RITUS[i];
  const next = RITUS[(i + 1) % 6];
  // The Sun moves about a degree a day: step forward until it enters the next ritu.
  let t = +date;
  for (let d = 0; d < 70; d++) {
    t += 86_400_000;
    if (next.signs.includes(Math.floor(siderealSun(new Date(t)) / 30))) break;
  }
  return { now, next, nextFrom: new Date(t) };
}

type RituText = Pick<Ritu, 'ritu' | 'months' | 'ayana' | 'strength' | 'rasa' | 'doshas' | 'favour' | 'avoid' | 'routine'>;

/** The same guidance in Hindi, ritu by ritu. */
export const RITUS_HI: Record<string, RituText> = {
  shishira: {
    ritu: 'शिशिर (देर सर्दी)', months: 'लगभग मध्य जनवरी से मध्य मार्च',
    ayana: 'उत्तरायण (आदान काल): सूर्य जीवों से बल खींचता है', strength: 'बल अभी भी ऊँचा है, घटने लगा है',
    rasa: 'प्रकृति में तिक्त (कड़वा) रस प्रधान', doshas: 'कफ का संचय होता है',
    favour: ['हेमंत की तरह गर्म, स्निग्ध, पौष्टिक भोजन', 'मधुर, अम्ल और लवण रस', 'गेहूँ, दूध से बनी चीज़ें, घी, तिल, गुड़', 'गुनगुना पानी'],
    avoid: ['ठंडा, रूखा, हल्का और वात बढ़ाने वाला भोजन', 'ठंडी हवा में रहना', 'लंबे उपवास'],
    routine: ['तेल मालिश (अभ्यंग) और गुनगुने पानी से स्नान', 'नियमित व्यायाम', 'गर्म कपड़े और सुबह की धूप'],
  },
  vasanta: {
    ritu: 'वसंत', months: 'लगभग मध्य मार्च से मध्य मई',
    ayana: 'उत्तरायण (आदान काल)', strength: 'मध्यम',
    rasa: 'कषाय (कसैला) रस प्रधान', doshas: 'सर्दी में जमा कफ सूर्य की गर्मी से पिघलकर कुपित (प्रकोप) होता है',
    favour: ['हल्का, रूखा, आसानी से पचने वाला भोजन', 'कटु, तिक्त और कषाय रस', 'पुराना जौ और गेहूँ, शहद, मूँग', 'गुनगुना पानी, अदरक का पानी'],
    avoid: ['भारी, तैलीय, मीठा और खट्टा भोजन', 'दही और ठंडे पेय', 'दिन में सोना'],
    routine: ['तेज़ व्यायाम', 'सूखे चूर्ण से मालिश (उद्वर्तन)', 'शास्त्रों में इस ऋतु में वमन बताया गया है, जो केवल वैद्य कराते हैं'],
  },
  grishma: {
    ritu: 'ग्रीष्म (गर्मी)', months: 'लगभग मध्य मई से मध्य जुलाई',
    ayana: 'उत्तरायण (आदान काल)', strength: 'साल में सबसे कम',
    rasa: 'कटु (तीखा) रस प्रधान', doshas: 'वात का संचय होता है; कफ शांत होता है (प्रशमन)',
    favour: ['मीठा, ठंडा, तरल और हल्का भोजन', 'मधुर रस', 'चावल, दूध, घी, मीठे फल, ठंडा पानी, पानक (मीठे पेय)', 'छाछ'],
    avoid: ['लवण, अम्ल और कटु रस', 'गर्म, मसालेदार, तला हुआ भोजन', 'शराब', 'गर्मी में भारी व्यायाम'],
    routine: ['ठंडी जगह पर आराम', 'केवल हल्का व्यायाम', 'इस ऋतु में दोपहर में थोड़ा आराम ठीक है'],
  },
  varsha: {
    ritu: 'वर्षा (मानसून)', months: 'लगभग मध्य जुलाई से मध्य सितंबर',
    ayana: 'दक्षिणायन (विसर्ग काल): चंद्रमा बल लौटाता है', strength: 'कम; अग्नि मंद रहती है',
    rasa: 'अम्ल (खट्टा) रस प्रधान', doshas: 'वात कुपित (प्रकोप) होता है; पित्त का संचय होता है',
    favour: ['ताज़ा पका, गर्म, हल्का भोजन', 'पुराना चावल, गेहूँ और जौ', 'हल्के अम्ल और लवण रस, शहद', 'उबालकर ठंडा किया पानी'],
    avoid: ['भारी और बासी भोजन', 'नदी का पानी और कच्चा सलाद', 'दिन में सोना', 'ज़्यादा मेहनत'],
    routine: ['शरीर और आसपास सूखा रखें', 'तेल मालिश', 'शास्त्रों में इस ऋतु में बस्ति बताई गई है, जो केवल वैद्य कराते हैं'],
  },
  sharad: {
    ritu: 'शरद', months: 'लगभग मध्य सितंबर से मध्य नवंबर',
    ayana: 'दक्षिणायन (विसर्ग काल)', strength: 'मध्यम',
    rasa: 'लवण (नमकीन) रस प्रधान', doshas: 'पित्त कुपित (प्रकोप) होता है; वात शांत होता है (प्रशमन)',
    favour: ['मधुर, तिक्त और कषाय रस', 'हल्का, ठंडक देने वाला भोजन: चावल, मूँग, घी, आँवला', 'दिन में धूप से गर्म और रात में चाँदनी से ठंडा हुआ पानी (हंसोदक)'],
    avoid: ['दही, तेल और तला हुआ भोजन', 'गर्म, खट्टा और मसालेदार भोजन', 'तेज़ धूप और दिन में सोना'],
    routine: ['शाम को चाँदनी में टहलना', 'ठंडे, हल्के कपड़े', 'शास्त्रों में इस ऋतु में विरेचन बताया गया है, जो केवल वैद्य कराते हैं'],
  },
  hemanta: {
    ritu: 'हेमंत (शुरुआती सर्दी)', months: 'लगभग मध्य नवंबर से मध्य जनवरी',
    ayana: 'दक्षिणायन (विसर्ग काल)', strength: 'साल में सबसे ज़्यादा; अग्नि तेज़ रहती है',
    rasa: 'मधुर (मीठा) रस प्रधान', doshas: 'पित्त शांत होता है (प्रशमन)',
    favour: ['पौष्टिक, स्निग्ध भोजन', 'मधुर, अम्ल और लवण रस', 'गेहूँ, उड़द, दूध, घी, गुड़, तिल', 'गुनगुना पानी'],
    avoid: ['हल्का, ठंडा और रूखा भोजन', 'उपवास या खाना छोड़ना: तेज़ अग्नि को ईंधन चाहिए', 'ठंडे पेय'],
    routine: ['तेल मालिश और व्यायाम', 'गुनगुने पानी से स्नान और गर्म कपड़े', 'सुबह की धूप'],
  },
};
