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
