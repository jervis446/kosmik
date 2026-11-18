/**
 * Reports: deep one-time readings. A report costs one credit (bought in UPI packs), is written
 * once from the person's chart (or prakriti) and kept, so opening it again is instant and free.
 *
 *   GET  /api/reports          the catalog, which ones you own, and your credits
 *   GET  /api/reports/:key     one report (with its text if you own it)
 *   POST /api/reports/:key     unlock it with a credit: writes it, then spends the credit
 */
import type { AiClient, Report } from './ai.ts';
import { AGNI_LABEL, aggravated, type Ayurveda, prakritiLabel } from './ayurveda.ts';
import { calculateChart } from './lib/chart.ts';
import { deepChart, describeVarga } from './lib/jyotish.ts';
import { type Kundali, kundali, kundaliFacts } from './lib/kundali.ts';
import { GROUPS, REPORTS, reportSpec } from './lib/reports.ts';
import { rituAt } from './lib/ritu.ts';
import type { Lang } from './lib/text.ts';
import { describeTropical } from './lib/tropical.ts';
import { PACKS } from './payments.ts';
import { D1Profiles, type Profile, type Profiles, toBirth } from './profiles.ts';

export class ReportError extends Error {
  readonly status: number;
  readonly code: 'needs-details' | 'needs-prakriti' | 'no-credits' | 'not-found';
  constructor(message: string, status: number, code: ReportError['code']) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function reportCredits(db: D1Database, userId: string): Promise<number> {
  return (await db.prepare('SELECT credits FROM report_credits WHERE user_id = ?').bind(userId).first<{ credits: number }>())?.credits ?? 0;
}

export async function listReports(db: D1Database, userId: string) {
  const { results } = await db.prepare('SELECT report_key AS key, created_at AS createdAt FROM reports WHERE user_id = ?').bind(userId).all<{ key: string; createdAt: number }>();
  const owned = new Map(results.map((r) => [r.key, r.createdAt]));
  return {
    credits: await reportCredits(db, userId),
    packs: Object.entries(PACKS).map(([id, p]) => ({ id, ...p })),
    groups: GROUPS,
    reports: REPORTS.map(({ focus: _focus, ...r }) => ({ ...r, owned: owned.has(r.key), createdAt: owned.get(r.key) ?? null })),
  };
}

export async function getReport(db: D1Database, userId: string, key: string) {
  const spec = reportSpec(key);
  if (!spec) throw new ReportError('That report doesn’t exist.', 404, 'not-found');
  const row = await db.prepare('SELECT lang, content, created_at AS createdAt FROM reports WHERE user_id = ? AND report_key = ?').bind(userId, key).first<{ lang: string; content: string; createdAt: number }>();
  const { focus: _focus, ...shown } = spec;
  const content = row ? (JSON.parse(row.content) as Report & { kundali?: Kundali }) : null;
  let chart: Kundali | null = content?.kundali ?? null;
  // Reports written before kundalis were kept get one from the saved details.
  if (!chart && !spec.ayurveda) {
    const profile = await new D1Profiles(db).get(userId);
    if (profile) chart = kundaliOf(profile, Date.now());
  }
  const { kundali: _k, ...report } = content ?? {};
  return {
    spec: shown,
    credits: await reportCredits(db, userId),
    report: row ? { periods: [], transits: [], doshas: [], ...(report as Partial<Report>), lang: row.lang, createdAt: row.createdAt } : null,
    kundali: chart,
  };
}

const kundaliOf = (p: Profile, now: number) => kundali(calculateChart(toBirth(p)), p, new Date(now));

const age = (birthDate: string, now: number) => Math.floor((now - Date.parse(`${birthDate}T00:00:00Z`)) / (365.25 * 86_400_000));

/** Writes the report from the person's own data, then spends a credit and keeps it, together. */
export async function unlockReport(
  deps: { db: D1Database; ai: AiClient; profiles: Profiles; ayurveda: Ayurveda },
  userId: string,
  key: string,
  lang: Lang,
  now: number,
) {
  const spec = reportSpec(key);
  if (!spec) throw new ReportError('That report doesn’t exist.', 404, 'not-found');
  if (await deps.db.prepare('SELECT 1 FROM reports WHERE user_id = ? AND report_key = ?').bind(userId, key).first()) return getReport(deps.db, userId, key);
  if ((await reportCredits(deps.db, userId)) < 1) throw new ReportError('You have no report credits left. Buy a pack to unlock this report.', 402, 'no-credits');
  if (!deps.ai.report) throw new Error('Reports are not available');

  const profile = await deps.profiles.get(userId);
  let facts: string;
  let chartKundali: Kundali | null = null;
  if (spec.ayurveda) {
    const prakriti = await deps.ayurveda.prakriti(userId);
    if (!prakriti) throw new ReportError('Take the dosha quiz first: this report is written from your prakriti.', 409, 'needs-prakriti');
    const vikriti = await deps.ayurveda.vikriti(userId);
    const ritu = rituAt(new Date(now));
    facts = [
      profile ? `PERSON: ${profile.name ?? 'unnamed'}${profile.gender ? `, ${profile.gender}` : ''}, age ${age(profile.birthDate, now)}` : 'PERSON: no details given',
      `PRAKRITI: ${prakritiLabel(prakriti)} (Vata ${prakriti.vata}%, Pitta ${prakriti.pitta}%, Kapha ${prakriti.kapha}%)`,
      vikriti ? `VIKRITI (last few weeks): raised ${aggravated(vikriti).join(', ') || 'none clearly'}; ${AGNI_LABEL[vikriti.agni]}` : 'VIKRITI: not checked',
      `SEASON: ${ritu.now.ritu}, ${ritu.now.doshas}; next ${ritu.next.ritu}`,
    ].join('\n');
  } else {
    if (!profile) throw new ReportError('Add your birth details first: reports are written from your chart.', 409, 'needs-details');
    const chart = calculateChart(toBirth(profile));
    const vargas = (spec.vargas ?? []).map((n) => describeVarga(chart, n)).join('\n');
    chartKundali = kundaliOf(profile, now);
    facts = `CHART (calculated, sidereal, Lahiri, whole-sign houses, Vimshottari dasha):\n${deepChart(chart, new Date(now), profile.name)}\n\n${kundaliFacts(chartKundali)}\n\nDIVISIONAL CHARTS for this topic (read them with the birth chart; name them in the report):\n${vargas || 'none'}\n\nWESTERN (tropical, only if useful):\n${describeTropical(chart, new Date(now))}`;
  }

  const report = await deps.ai.report({ title: spec.title, focus: spec.focus, ayurveda: spec.ayurveda }, lang, facts);
  // Spend one credit and keep the report in one go; if the credit is gone by now (a second tab), keep nothing.
  const [spend] = await deps.db.batch([
    deps.db
      .prepare('UPDATE report_credits SET credits = credits - 1 WHERE user_id = ? AND credits > 0 AND NOT EXISTS (SELECT 1 FROM reports WHERE user_id = ? AND report_key = ?)')
      .bind(userId, userId, key),
    deps.db
      .prepare('INSERT INTO reports (user_id, report_key, lang, content, created_at) SELECT ?, ?, ?, ?, ? WHERE changes() = 1 ON CONFLICT (user_id, report_key) DO NOTHING')
      .bind(userId, key, lang, JSON.stringify(chartKundali ? { ...report, kundali: chartKundali } : report), now),
  ]);
  if (!spend.meta.changes) {
    // Already written meanwhile (another tab): show it, nothing spent.
    if (await deps.db.prepare('SELECT 1 FROM reports WHERE user_id = ? AND report_key = ?').bind(userId, key).first()) return getReport(deps.db, userId, key);
    throw new ReportError('You have no report credits left. Buy a pack to unlock this report.', 402, 'no-credits');
  }
  return getReport(deps.db, userId, key);
}

/** One of the person's own reports as plain text, for a chat started from it (null if it isn't theirs). */
export async function reportContext(db: D1Database, userId: string, key: string): Promise<string | null> {
  const spec = reportSpec(key);
  if (!spec) return null;
  const row = await db.prepare('SELECT content FROM reports WHERE user_id = ? AND report_key = ?').bind(userId, key).first<{ content: string }>();
  if (!row) return null;
  const r = JSON.parse(row.content) as Partial<Report>;
  const lines = [`REPORT: ${spec.title}`, r.headline ?? '', r.summary ?? ''];
  for (const s of r.sections ?? []) lines.push(`${s.heading}: ${s.body.replace(/\s+/g, ' ')}`);
  if (r.periods?.length) lines.push('Dasha periods:', ...r.periods.map((p) => `${p.dasha} (${p.when}): ${p.reading}`));
  if (r.transits?.length) lines.push('Transits now:', ...r.transits.map((t) => `${t.planet}: ${t.reading}`));
  if (r.doshas?.length) lines.push(...r.doshas.map((d) => `${d.name}: ${d.reading}`));
  if (r.timing?.length) lines.push('Timing:', ...r.timing.map((t) => `${t.when}: ${t.what}`));
  if (r.remedies?.length) lines.push('Remedies:', ...r.remedies.map((x) => `${x.title}: ${x.how}`));
  return lines.filter(Boolean).join('\n').slice(0, 12_000);
}
