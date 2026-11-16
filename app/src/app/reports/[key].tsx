import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { highlight } from "../../components/Blocks";
import { DetailsModal } from "../../components/DetailsForms";
import { Shell } from "../../components/Shell";
import { Thinking } from "../../components/Thinking";
import { track } from "../../lib/analytics";
import { api, ApiError, type ReportSummary, type WrittenReport } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { tr, uiLang } from "../../lib/i18n";
import { answerLang } from "../../lib/lang";
import { useShell } from "../../lib/shell";
import { type Colors, font, useTheme } from "../../lib/theme";

const GROUP_LABEL: Record<string, string> = {
  love: "LOVE AND MARRIAGE",
  money: "MONEY",
  work: "WORK",
  self: "SELF AND GROWTH",
  ayurveda: "AYURVEDA",
};

const INSIDE = [
  ["Astrological depth", "Planetary positions, strengths, yogas and transits across your D1 and D9 charts."],
  ["Life themes", "What your chart says about this area, in plain language and in your words."],
  ["Timing and remedies", "Dated windows from your dashas and transits, and doable steps for each."],
];
const INSIDE_AYUR = [
  ["Your constitution", "Your prakriti from the dosha quiz and, if checked, your current state."],
  ["Diet and routine", "What to eat, what to avoid, meal timing and a daily routine that suits you."],
  ["Seasons and herbs", "How to adapt through the year, with kitchen remedies and herbs used traditionally."],
];
const VERSUS: [string, string][] = [
  ["Generic, one-size predictions", "Read from your own D1 and D9 charts"],
  ["Future only, no dates", "Dated windows from your dasha and transits"],
  ["No remedies", "Clear, practical steps, without fear"],
  ["A static PDF you read once", "Ask Kosmik follow-ups any time after"],
];
const FAQ: [string, string][] = [
  ["How is this different from a generic astrology report?", "It is written from your own chart: your lagna, the planets in your houses, your running dasha and the transits over them, so the dates and advice are yours, not your sun sign’s."],
  ["What if I do not know my exact birth time?", "You can still get the report. Without a time your lagna and houses can’t be fixed, so it leans on the Moon and the planets’ signs and says where it is less certain."],
  ["How long does it take?", "About a minute. Once written, it is kept in your account and opens instantly."],
  ["Does it end at the report?", "No. Ask Kosmik about anything in it: a date, a what-if, the next step."],
];

/** One report: what it covers and how to unlock it, or the written report once it is yours. */
export default function ReportPage() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { session, ready } = useAuth();
  const { colors } = useTheme();
  const s = styles(colors);
  const shell = useShell();
  const [spec, setSpec] = useState<ReportSummary | null>(null);
  const [report, setReport] = useState<WrittenReport | null>(null);
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needs, setNeeds] = useState<"birth" | "prakriti" | null>(null);
  const [open, setOpen] = useState<number | null>(0);

  const load = useCallback(() => {
    api
      .report(key)
      .then((r) => {
        setSpec(r.spec);
        setReport(r.report);
        setCredits(r.credits);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : tr("Something went wrong. Please try again.")))
      .finally(() => setLoading(false));
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace("/sign-in");
      return;
    }
    load();
  }, [ready, session, load]);

  const unlock = async () => {
    if (credits < 1) {
      router.push("/reports");
      return;
    }
    setWriting(true);
    setError(null);
    try {
      track(`reports/unlock-${key}`);
      const r = await api.unlockReport(key, answerLang() ?? uiLang());
      setReport(r.report);
      setCredits(r.credits);
    } catch (e) {
      const code = e instanceof ApiError ? (e as ApiError & { code?: string }).code : undefined;
      const msg = e instanceof ApiError ? e.message : tr("Something went wrong. Please try again.");
      if (/birth details/i.test(msg) || code === "needs-details") setNeeds("birth");
      else if (/dosha quiz/i.test(msg) || code === "needs-prakriti") setNeeds("prakriti");
      else setError(msg);
    } finally {
      setWriting(false);
    }
  };

  const askFirst = () =>
    shell.askNew(
      spec?.ayurveda ? tr("What does my prakriti say about my diet and routine?") : tr("What does my chart say about {v0}?", { v0: tr(spec?.title ?? "").toLowerCase() }),
      spec?.ayurveda ? "ayurveda" : null,
    );

  if (loading || !spec)
    return (
      <Shell>
        <View style={{ padding: 32 }}>{error ? <Text style={s.error}>{error}</Text> : <ActivityIndicator color={colors.primary} />}</View>
      </Shell>
    );

  // The charts this report reads: the birth chart and the divisional chart(s) for its topic.
  const charts = ["D1", ...(spec.vargas ?? []).map((n) => `D${n}`)].join(" + ");
  const inside = spec.ayurveda
    ? INSIDE_AYUR
    : INSIDE.map(([t, d], i) => [t, i === 0 ? tr("Planetary positions, strengths, yogas and transits across your {v0} charts.", { v0: charts }) : d]);
  const versus = VERSUS.map(([a, b], i) => [a, i === 0 ? tr("Read from your own {v0} charts", { v0: charts }) : b]);
  return (
    <Shell>
      <ScrollView contentContainerStyle={s.page}>
        <Pressable onPress={() => router.push("/reports")} accessibilityRole="link">
          <Text style={s.crumb}>← {tr("ALL REPORTS")}</Text>
        </Pressable>

        <View style={[s.hero, spec.ayurveda && { borderColor: "#3FB68B66" }]}>
          <View style={s.heroTop}>
          <View style={{ flex: 1, minWidth: 260, gap: 12 }}>
            <Text style={s.eyebrow}>
              {tr(spec.ayurveda ? "AYURVEDA READING" : "PREMIUM VEDIC READING")} · {tr(GROUP_LABEL[spec.group])}
            </Text>
            <Text style={s.heroTitle}>{tr(spec.title)}</Text>
            <View style={s.rule} />
            <Text style={s.about}>{tr(spec.about)}</Text>
            {report ? (
              <Text style={[s.mono, { color: colors.success }]}>✓ {tr("YOURS · KEPT IN YOUR ACCOUNT")}</Text>
            ) : (
              <>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  <Pressable onPress={unlock} disabled={writing} style={s.cta} accessibilityRole="button" testID="unlock-report">
                    <Text style={s.ctaText}>{credits > 0 ? tr("Unlock with 1 credit") : tr("Get this report")} →</Text>
                  </Pressable>
                  <Pressable onPress={askFirst} style={s.ghost} accessibilityRole="button">
                    <Text style={s.ghostText}>{tr("Ask Kosmik first")}</Text>
                  </Pressable>
                </View>
                <Text style={s.mono}>
                  {credits > 0
                    ? tr(credits === 1 ? "1 CREDIT LEFT" : "{v0} CREDITS LEFT", { v0: credits })
                    : tr("UNLOCK WITH ANY REPORT PACK · FROM ₹99")}
                </Text>
              </>
            )}
          </View>
          <View style={s.art}>
            <View style={s.artInner}>
              <Text style={{ fontSize: 32 }}>{spec.icon}</Text>
            </View>
          </View>
          </View>
          <View style={s.stats}>
            {(spec.ayurveda
              ? [["Your prakriti", "NOT A TEMPLATE"], ["Every season", "COVERED"], ["About a minute", "TO PREPARE"], ["Ask after", "IN AN AYURVEDA CHAT"]]
              : [["Your chart", "NOT A TEMPLATE"], [charts, "READ TOGETHER"], ["About a minute", "TO PREPARE"], ["Dated", "PERIODS AND TRANSITS"]]
            ).map(([a, b], i, all) => (
              <View key={a} style={[s.stat, i === all.length - 1 && { borderRightWidth: 0 }]}>
                <Text style={s.statTop}>{tr(a)}</Text>
                <Text style={s.mono}>{tr(b)}</Text>
              </View>
            ))}
          </View>
        </View>

        {error ? <Text style={s.error}>{error}</Text> : null}

        {writing ? (
          <View style={s.writing} testID="report-writing">
            <Thinking />
            <Text style={s.muted}>{tr("Writing your report from your chart. This takes about a minute; please keep this page open.")}</Text>
          </View>
        ) : null}

        {report ? (
          <ReportBody report={report} s={s} colors={colors} onAsk={(q) => shell.askNew(q, spec.ayurveda ? "ayurveda" : null)} />
        ) : (
          <>
            <Text style={s.h2}>{tr("What’s inside your {v0} reading", { v0: tr(spec.title) })}</Text>
            <View style={s.row3}>
              {inside.map(([t, d], i) => (
                <View key={t} style={s.box}>
                  <Text style={s.num}>{String(i + 1).padStart(2, "0")}</Text>
                  <Text style={s.boxTitle}>{tr(t)}</Text>
                  <Text style={s.muted}>{tr(d)}</Text>
                </View>
              ))}
            </View>

            {!spec.ayurveda ? (
              <>
                <Text style={s.h2}>{tr("Why this beats a generic report")}</Text>
                <View style={s.table}>
                  <View style={s.tRow}>
                    <Text style={[s.mono, s.tCell]}>{tr("OTHER REPORTS")}</Text>
                    <Text style={[s.mono, s.tCell, s.tOurs]}>KOSMIK</Text>
                  </View>
                  {versus.map(([a, b]) => (
                    <View key={a} style={s.tRow}>
                      <Text style={[s.tText, s.tCell]}>✕ {tr(a)}</Text>
                      <Text style={[s.tText, s.tCell, s.tOurs]}>
                        <Text style={{ color: colors.success }}>✓ </Text>
                        {tr(b)}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <View style={s.after}>
              <View style={{ flex: 1, minWidth: 220 }}>
                <Text style={s.boxTitle}>{tr("It doesn’t end at the report")}</Text>
                <Text style={s.muted}>{tr("Unlike a one-time PDF, you can keep asking Kosmik about this reading: follow-ups, what-ifs and timing, for as long as you like.")}</Text>
              </View>
              <Pressable onPress={askFirst} style={s.ghost} accessibilityRole="button">
                <Text style={s.ghostText}>{tr("Ask Kosmik")}</Text>
              </Pressable>
            </View>

            <Text style={s.h2}>{tr("Frequently asked")}</Text>
            <View style={{ gap: 10 }}>
              {FAQ.map(([q, a], i) => (
                <Pressable key={q} onPress={() => setOpen(open === i ? null : i)} style={s.faq} accessibilityRole="button" accessibilityState={{ expanded: open === i }}>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Text style={[s.boxTitle, { flex: 1, fontSize: 15 }]}>{tr(q)}</Text>
                    <Text style={[s.boxTitle, { color: colors.primary }]}>{open === i ? "−" : "+"}</Text>
                  </View>
                  {open === i ? <Text style={s.muted}>{tr(a)}</Text> : null}
                </Pressable>
              ))}
            </View>

            <View style={s.final}>
              <Text style={s.finalTitle}>
                {tr("Your chart already holds")} <Text style={{ color: colors.highlight }}>{tr("the answer")}</Text>
              </Text>
              <Text style={s.muted}>{tr("Unlock your {v0} reading and read it in about a minute.", { v0: tr(spec.title) })}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
                <Pressable onPress={unlock} disabled={writing} style={s.cta} accessibilityRole="button">
                  <Text style={s.ctaText}>{credits > 0 ? tr("Unlock with 1 credit") : tr("Get this report")} →</Text>
                </Pressable>
                <Pressable onPress={askFirst} style={s.ghost} accessibilityRole="button">
                  <Text style={s.ghostText}>{tr("Ask Kosmik a question first")}</Text>
                </Pressable>
              </View>
            </View>
          </>
        )}
      </ScrollView>
      <DetailsModal
        kind={needs}
        onClose={() => setNeeds(null)}
        onDone={() => {
          setNeeds(null);
          void unlock();
        }}
      />
    </Shell>
  );
}

function ReportBody({ report, s, colors, onAsk }: { report: WrittenReport; s: ReturnType<typeof styles>; colors: Colors; onAsk: (q: string) => void }) {
  return (
    <View style={{ gap: 18 }} testID="report-body">
      <View style={s.verdict}>
        <Text style={s.mono}>{tr("THE SHORT ANSWER")}</Text>
        <Text style={s.verdictText}>{highlight(report.headline, colors.highlight)}</Text>
        {report.summary ? <Text style={s.body}>{highlight(report.summary, colors.highlight)}</Text> : null}
      </View>
      {report.sections.map((sec, i) => (
        <View key={i} style={s.section}>
          <Text style={s.num}>{String(i + 1).padStart(2, "0")}</Text>
          <Text style={s.secTitle}>{sec.heading}</Text>
          {sec.body.split(/\n\s*\n/).map((p, j) => (
            <Text key={j} style={s.body}>
              {highlight(p.trim(), colors.highlight)}
            </Text>
          ))}
        </View>
      ))}
      {report.timing.length ? (
        <View style={s.section}>
          <Text style={s.secTitle}>{tr("Your timeline")}</Text>
          {report.timing.map((t, i) => (
            <View key={i} style={s.when}>
              <Text style={s.whenDate}>{t.when}</Text>
              <Text style={[s.body, { flex: 1, minWidth: 220 }]}>{highlight(t.what, colors.highlight)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {report.remedies.length ? (
        <View style={s.section}>
          <Text style={s.secTitle}>{tr("What to do")}</Text>
          {report.remedies.map((r, i) => (
            <View key={i} style={{ gap: 2 }}>
              <Text style={[s.body, { fontFamily: font.semibold }]}>{r.title}</Text>
              <Text style={s.muted}>{r.how}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={s.row3}>
        {[
          ["YOUR STRENGTHS", report.strengths, colors.success],
          ["WATCH FOR", report.watch, colors.accent],
        ].map(([label, items, c]) =>
          (items as string[]).length ? (
            <View key={label as string} style={s.box}>
              <Text style={[s.mono, { color: c as string }]}>{tr(label as string)}</Text>
              {(items as string[]).map((x) => (
                <Text key={x} style={s.body}>
                  • {x}
                </Text>
              ))}
            </View>
          ) : null,
        )}
      </View>
      {report.followUps.length ? (
        <View style={{ gap: 10 }}>
          <Text style={s.mono}>{tr("ASK KOSMIK NEXT")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {report.followUps.map((q) => (
              <Pressable key={q} onPress={() => onAsk(q)} style={s.ghost} accessibilityRole="button">
                <Text style={s.ghostText}>{q} →</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: 24, paddingTop: 24, gap: 18, maxWidth: 1080, width: "100%", alignSelf: "center" },
    crumb: { color: c.muted, fontFamily: font.mono, fontSize: 12, letterSpacing: 2.5 },
    hero: {
      borderRadius: 24,
      borderWidth: 1,
      borderColor: `${c.primary}55`,
      backgroundColor: `${c.primary}16`,
      overflow: "hidden",
    },
    heroTop: { flexDirection: "row", flexWrap: "wrap", gap: 20, padding: 24 },
    eyebrow: { color: c.muted, fontFamily: font.mono, fontSize: 11, letterSpacing: 2.5 },
    heroTitle: { color: c.text, fontFamily: font.display, fontSize: 34, lineHeight: 42 },
    rule: { width: 72, height: 1, backgroundColor: c.line },
    about: { color: c.text, fontFamily: font.body, fontSize: 15, lineHeight: 23, maxWidth: 560 },
    cta: { backgroundColor: c.primary, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 18 },
    ctaText: { color: c.onPrimary, fontFamily: font.semibold, fontSize: 14 },
    ghost: { borderWidth: 1, borderColor: c.line, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16, backgroundColor: c.surface },
    ghostText: { color: c.text, fontFamily: font.medium, fontSize: 13 },
    mono: { color: c.muted, fontFamily: font.mono, fontSize: 10, letterSpacing: 1.8 },
    art: { width: 112, height: 140, borderRadius: 20, borderWidth: 1, borderColor: `${c.primary}66`, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center", alignSelf: "center" },
    artInner: { width: 60, height: 60, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" },
    stats: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1, borderTopColor: c.line },
    stat: { flexGrow: 1, flexBasis: 150, paddingVertical: 12, paddingHorizontal: 18, gap: 3, borderRightWidth: 1, borderRightColor: c.line },
    statTop: { color: c.text, fontFamily: font.medium, fontSize: 15 },
    error: { color: c.danger, fontFamily: font.medium, fontSize: 15 },
    writing: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 16, padding: 20, borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
    h2: { color: c.text, fontFamily: font.display, fontSize: 22, marginTop: 4 },
    row3: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
    box: { flexBasis: 240, flexGrow: 1, gap: 6, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
    num: { color: c.muted, fontFamily: font.mono, fontSize: 11, borderWidth: 1, borderColor: c.line, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 7, alignSelf: "flex-start" },
    boxTitle: { color: c.text, fontFamily: font.display, fontSize: 16 },
    muted: { color: c.muted, fontFamily: font.body, fontSize: 14, lineHeight: 21 },
    table: { borderRadius: 18, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    tRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.line },
    tCell: { flex: 1, paddingVertical: 10, paddingHorizontal: 14 },
    tOurs: { backgroundColor: `${c.primary}14` },
    tText: { color: c.muted, fontFamily: font.body, fontSize: 13 },
    after: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 14,
      padding: 20,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: `${c.primary}55`,
      borderLeftWidth: 3,
      borderLeftColor: c.primary,
      backgroundColor: `${c.primary}12`,
    },
    faq: { gap: 8, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
    final: { alignItems: "center", gap: 12, paddingVertical: 36, paddingHorizontal: 20, borderRadius: 24, borderWidth: 1, borderColor: `${c.primary}55`, backgroundColor: `${c.primary}14` },
    finalTitle: { color: c.text, fontFamily: font.display, fontSize: 26, textAlign: "center", lineHeight: 34 },
    verdict: { gap: 10, padding: 24, borderRadius: 20, borderWidth: 1, borderColor: `${c.primary}66`, backgroundColor: `${c.primary}16` },
    verdictText: { color: c.text, fontFamily: font.display, fontSize: 20, lineHeight: 28 },
    section: { gap: 10, padding: 22, borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
    secTitle: { color: c.text, fontFamily: font.display, fontSize: 18 },
    body: { color: c.text, fontFamily: font.body, fontSize: 15, lineHeight: 24 },
    when: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.line },
    whenDate: { width: 200, color: c.accent, fontFamily: font.semibold, fontSize: 15 },
  });
