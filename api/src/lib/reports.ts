/**
 * The report catalog: deep, one-time readings written from the person's own chart (or, for the
 * Ayurveda report, their prakriti). Each has what it reads and what the reading must cover.
 */
import type { Varga } from './jyotish.ts';

export type ReportGroup = 'love' | 'money' | 'work' | 'self' | 'ayurveda';

export type ReportSpec = {
  key: string;
  group: ReportGroup;
  icon: string;
  title: string;
  tagline: string;
  /** Shown on the report's page: what it reads and what you get. */
  about: string;
  /** For the model: the factors to read and the questions to answer. */
  focus: string;
  badge?: 'new' | 'trending';
  /** Needs the dosha quiz rather than birth details. */
  ayurveda?: boolean;
  /** Divisional charts read with the birth chart (D1), as the tradition uses for this topic. */
  vargas?: Varga[];
};

export const GROUPS: { key: ReportGroup; title: string }[] = [
  { key: 'love', title: 'Love and marriage' },
  { key: 'money', title: 'Money' },
  { key: 'work', title: 'Work' },
  { key: 'self', title: 'Self and growth' },
  { key: 'ayurveda', title: 'Ayurveda' },
];

export const REPORTS: ReportSpec[] = [
  {
    vargas: [9],
    key: 'love-style', group: 'love', icon: '💞', title: 'Love Style', tagline: 'Your style and strengths in romance',
    about: 'How you attach, what you need to feel secure and the patterns you repeat in relationships, read from Venus, the Moon and the fifth and seventh houses, with the kind of partner you work best beside.',
    focus: 'Venus, the Moon, the 5th house and its lord, the 7th house and its lord, Mars, and the navamsa (D9). Name their love style, what makes them feel secure, their strengths as a partner, the habits that cost them, the partner they work best with, and the periods that open romance.',
  },
  {
    vargas: [9],
    key: 'marriage', group: 'love', icon: '💍', title: 'Marriage', tagline: 'Early or delayed marriage? Yogas, timing and remedies', badge: 'trending',
    about: 'When marriage is likely, what could delay it and what helps, read from the seventh house, its lord, Venus or Jupiter, the navamsa and your dasha and transit timeline.',
    focus: 'The 7th house, its lord and their dignity, Venus (and Jupiter for women), the navamsa (D9), Manglik status, any yogas or afflictions for marriage, and dasha periods and Jupiter/Saturn transits over the 7th house and its lord. Give the most likely marriage windows with dates, the main cause of any delay, and practical steps for each window.',
  },
  {
    vargas: [9],
    key: 'ideal-partner', group: 'love', icon: '💑', title: 'Ideal Partner', tagline: 'Your ideal life partner',
    about: 'The nature, background and qualities of the partner your chart describes, from the seventh house, its lord, Venus and the navamsa.',
    focus: 'The sign on the 7th house, its lord and where it sits, planets in the 7th, Venus and the navamsa (D9) 7th house. Describe the likely partner: temperament, profession or field, values, how you might meet, and what makes the bond work.',
  },
  {
    vargas: [9],
    key: 'love-or-arranged', group: 'love', icon: '💌', title: 'Love or Arranged', tagline: 'What suits you the best?', badge: 'new',
    about: 'Whether your chart leans to a love marriage, an arranged one or a mix, read from the links between the fifth and seventh houses, Venus and Rahu.',
    focus: 'Connections between the 5th and 7th houses and their lords, Venus, Rahu, the Moon, and the 9th house (family and tradition). Give a clear lean (love, arranged or love-cum-arranged), why, and the periods when each is most likely.',
  },
  {
    vargas: [9],
    key: 'spouse', group: 'love', icon: '🫶', title: 'Spouse', tagline: 'Bond and connection with your spouse',
    about: 'How you and your spouse connect, where friction comes from and how to keep the bond strong, from the seventh house, Venus, the Moon and the navamsa.',
    focus: 'The 7th house and its lord, Venus, the Moon, the 2nd house (family life), the navamsa (D9). Describe the bond, the friction points, communication, and the periods of closeness and strain with dates, with practical ways to keep the bond strong.',
  },
  {
    vargas: [9],
    key: 'in-laws', group: 'love', icon: '👨‍👩‍👧', title: 'In-Laws', tagline: 'How to manage expectations?',
    about: 'How you get on with your in-laws and how to keep things smooth, from the houses of the spouse’s family.',
    focus: 'The 4th house from the 7th (the 10th house: in-laws), the 8th house, their lords, the Moon and Saturn. Describe the relationship with in-laws, likely expectations, friction points, and periods of harmony or strain, with practical ways to handle them.',
  },
  {
    vargas: [2],
    key: 'wealth', group: 'money', icon: '💰', title: 'Wealth', tagline: 'Quick wealth creation',
    about: 'Where your money comes from, how it grows and the periods it grows fastest, from the second and eleventh houses, their lords and Jupiter.',
    focus: 'The 2nd house (savings), 11th house (gains), their lords, Jupiter, Venus, dhana yogas, and dasha and transit timing. Name the main sources of income, the best ways for this chart to build wealth (salary, business, investing, property), money leaks to watch, and the strongest periods with dates.',
  },
  {
    vargas: [2, 10],
    key: 'wealth-potential', group: 'money', icon: '📈', title: 'Wealth Potential', tagline: 'How far can your money go?',
    about: 'The ceiling your chart sets for wealth, the yogas that raise it and when they switch on, from dhana and raja yogas and the eleventh house.',
    focus: 'Dhana yogas, raja yogas, the 2nd, 9th, 10th and 11th houses and their lords, Jupiter and Rahu. Give an honest read of the wealth potential (modest, comfortable, high), what unlocks it, the periods when it switches on (with dates), and what holds it back.',
  },
  {
    vargas: [10],
    key: 'career', group: 'work', icon: '📊', title: 'Career', tagline: 'Career growth for corporate employees',
    about: 'The work you are built for, how you rise and the periods of promotion and change, from the tenth house, its lord, the sixth and eleventh houses and your dashas.',
    focus: 'The 10th house, its lord and dignity, planets in the 10th, the 6th (service) and 11th (gains) houses, the Sun and Saturn, and dasha and transit timing. Name the best-suited fields and roles, the work style, promotion and job-change windows with dates, and what to do in the current period.',
  },
  {
    vargas: [10],
    key: 'business', group: 'work', icon: '🏪', title: 'Business', tagline: 'How to grow your business?',
    about: 'Whether business suits you, which kind and when to start or expand, from the seventh house, Mercury, the eleventh house and your dashas.',
    focus: 'The 7th house (trade, partners), the 10th and 11th houses, Mercury, Rahu, Mars, their lords, and timing. Name the kinds of business that suit, partnership or solo, the best windows to start or expand with dates, and the risks to avoid in each period.',
  },
  {
    vargas: [10],
    key: 'job-or-business', group: 'work', icon: '⚖️', title: 'Job or Business', tagline: 'A stable job, a bold business, or both?',
    about: 'A clear lean between a job, a business or both, and when to make the switch, from the sixth, seventh and tenth houses.',
    focus: 'Compare the 6th house (service) with the 7th (business) and the 10th and 11th, their lords, Saturn, Mercury and Rahu. Give a clear verdict (job, business, or job first then business), the reasons, and the right time to switch with dates.',
  },
  {
    vargas: [10],
    key: 'govt-job', group: 'work', icon: '🏛️', title: 'Govt Job', tagline: 'Selection, promotion and growth in your service', badge: 'new',
    about: 'Your chances in government service, exams and promotions, and the periods that favour selection, from the Sun, the tenth house and the sixth house.',
    focus: 'The Sun (government), the 10th and 6th houses and their lords, Saturn, Jupiter, and timing. Give an honest read of government-job prospects, the best exam or selection windows with dates, promotion periods for those already in service, and how to prepare.',
  },
  {
    vargas: [10],
    key: 'first-job', group: 'work', icon: '🧑‍💼', title: 'First Job', tagline: 'Your first career move',
    about: 'The field and role to start in and when the first job is most likely, from the tenth and sixth houses and your current dasha.',
    focus: 'The 10th and 6th houses and their lords, Mercury, the Sun, the current and next dasha periods and Jupiter/Saturn transits. Name the best fields to start in, the type of first role, the most likely window for the first offer (with dates), and what to do now.',
  },
  {
    vargas: [10],
    key: 'job-search', group: 'work', icon: '🔍', title: 'Job Search', tagline: 'Re-enter the job market with passion',
    about: 'When a new job is most likely, what kind, and how to make the search work, from the tenth house and the current periods and transits.',
    focus: 'The 10th and 6th houses, their lords, the running mahadasha and antardasha, and Jupiter and Saturn transits. Give the most likely windows for a new job with dates, the kind of role and company, and practical steps for the search in this period.',
  },
  {
    vargas: [9],
    key: 'personality', group: 'self', icon: '🧭', title: 'Personality', tagline: 'Analysis of your 20+ characteristics',
    about: 'Who you are at your core: temperament, strengths, blind spots and how others see you, from your lagna, Moon, Sun and the strongest planets.',
    focus: 'The lagna and its lord, the Moon sign and nakshatra, the Sun, the strongest and weakest planets, and yogas. Describe at least twenty characteristics grouped as mind, emotions, work style, relationships and blind spots, and how others see them.',
  },
  {
    vargas: [24],
    key: 'intelligence', group: 'self', icon: '🧠', title: 'Intelligence', tagline: 'Achieve your full potential',
    about: 'How your mind works, how you learn best and where your talent lies, from Mercury, Jupiter, the fifth house and the Moon.',
    focus: 'Mercury, Jupiter, the 5th house (intelligence) and its lord, the 2nd house (speech), the Moon and the 4th house. Describe the kind of intelligence (analytical, creative, intuitive, practical), how they learn best, talents to develop, and periods of mental growth with dates.',
  },
  {
    vargas: [24],
    key: 'education', group: 'self', icon: '🎓', title: 'Education', tagline: 'Upcoming educational goals',
    about: 'The subjects that suit you, exam and admission windows and higher-study or abroad chances, from the fourth, fifth and ninth houses.',
    focus: 'The 4th (education), 5th (intellect) and 9th (higher study) houses and their lords, Mercury, Jupiter, and the 12th house for study abroad. Name suitable subjects and fields, exam and admission windows with dates, chances of higher study or study abroad, and how to study best.',
  },
  {
    key: 'prakriti', group: 'ayurveda', icon: '🌿', title: 'Prakriti', tagline: 'Your Ayurvedic body type and daily plan', ayurveda: true,
    about: 'Your prakriti from the dosha quiz, your current state if you have checked it, and a full Ayurvedic plan for diet, routine, seasons and herbs, written by Kosmik’s Ayurveda engine.',
    focus: 'From the PRAKRITI (and VIKRITI if given) and the SEASON: explain their constitution, strengths and tendencies; a daily routine (dinacharya); diet: foods to favour and avoid, meal timing; how to adapt in each season (ritucharya), starting with the current one; herbs and kitchen remedies that suit them traditionally; yoga and pranayama; and early signs of imbalance to watch for.',
  },
];

export const reportSpec = (key: string) => REPORTS.find((r) => r.key === key) ?? null;
