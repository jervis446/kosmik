/**
 * The cosmic snapshot shown at the end of onboarding: three short, personal lines from the
 * chart (Moon: how you think and feel; Sun: how you work; Lagna: how you come across) and the
 * running dasha.
 */
import { RASHIS } from './catalog.ts';
import { type Chart } from './chart.ts';
import { dashaLine } from './jyotish.ts';

const MIND: Record<string, string> = {
  mesh: 'You decide fast and feel things in bursts; waiting around drains you.',
  vrishabh: 'You need calm and comfort to think clearly, and you rarely change your mind once it’s made up.',
  mithun: 'Your mind runs three tabs at once; talking things out is how you make sense of them.',
  kark: 'You feel everything deeply and remember it all; home and your people steady you.',
  simha: 'You think in big pictures and need to feel proud of what you choose.',
  kanya: 'Deep down you crave order and practical answers; you notice what others miss.',
  tula: 'You weigh every side before deciding, and harmony around you matters for your peace.',
  vrishchik: 'You feel intensely and privately; once you trust someone, it’s for life.',
  dhanu: 'You think in meaning and freedom; a mind that can’t explore gets restless.',
  makar: 'You think ahead, plan quietly and feel safest when things are under control.',
  kumbh: 'You see patterns others don’t and need space to think in your own way.',
  meen: 'You sense more than you say; your intuition is usually a step ahead of your logic.',
};
const WORK: Record<string, string> = {
  mesh: 'You work best when you can lead, start things and move fast.',
  vrishabh: 'You build slowly and well; steady effort and quality are your edge.',
  mithun: 'You shine with words, people and ideas, and you get bored by repetition.',
  kark: 'You do your best work for people you care about and in teams that feel like family.',
  simha: 'You’re made to be seen: you lead, create and lift a room.',
  kanya: 'You’re the one who fixes, improves and gets the details right.',
  tula: 'You work through partnership and fairness; design, deals and diplomacy suit you.',
  vrishchik: 'You dig deep, handle crises and stay with hard problems others drop.',
  dhanu: 'You work best with a bigger purpose: teaching, travel or ideas that matter.',
  makar: 'You’re ambitious and patient; you climb steadily and earn real authority.',
  kumbh: 'You think for the system, not just the task; tech and causes pull you.',
  meen: 'You work from imagination and empathy; creative and healing work suits you.',
};
const PRESENCE: Record<string, string> = {
  mesh: 'People see you as bold, direct and quick to act.',
  vrishabh: 'People see you as warm, grounded and reliable.',
  mithun: 'People see you as curious, chatty and quick-witted.',
  kark: 'People see you as caring, protective and a little private.',
  simha: 'People see you as confident and hard to ignore.',
  kanya: 'People see you as neat, sharp and put-together.',
  tula: 'People see you as charming, fair and easy to be around.',
  vrishchik: 'People see you as magnetic, intense and hard to read.',
  dhanu: 'People see you as open, honest and up for an adventure.',
  makar: 'People see you as serious, capable and older than your years.',
  kumbh: 'People see you as original, friendly and a bit unconventional.',
  meen: 'People see you as gentle, dreamy and kind.',
};

const label = (key: string) => {
  const r = RASHIS.find((x) => x.key === key)!;
  return `${r.name} (${r.english})`;
};

export type Snapshot = {
  name: string | null;
  lines: { kind: 'mind' | 'work' | 'presence'; title: string; tag: string; text: string }[];
  dasha: string | null;
};

export function snapshot(chart: Chart, now: Date, name: string | null): Snapshot {
  const at = (g: string) => chart.grahas.find((p) => p.graha === g)!.rashi;
  const lines: Snapshot['lines'] = [
    { kind: 'mind', title: 'How you think', tag: `Moon · ${label(at('moon'))}`, text: MIND[at('moon')] },
    { kind: 'work', title: 'How you work', tag: `Sun · ${label(at('sun'))}`, text: WORK[at('sun')] },
  ];
  if (chart.lagna) lines.push({ kind: 'presence', title: 'How you come across', tag: `Lagna · ${label(chart.lagna.rashi)}`, text: PRESENCE[chart.lagna.rashi] });
  return { name, lines, dasha: dashaLine(chart, now) };
}
