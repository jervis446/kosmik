import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Kundali, WrittenReport } from "../lib/api";
import { tr } from "../lib/i18n";
import { type Colors, font } from "../lib/theme";
import { highlight } from "./Blocks";
import { KundaliView } from "./Kundali";

const avoidBreak = { dataSet: { avoid: "1" } } as object;

/** A written report: the verdict, the kundali, the reading, the periods and what to do. On screen and in the PDF. */
export function ReportBody({
  report,
  kundali,
  colors,
  width,
  onAsk,
  print = false,
}: {
  report: WrittenReport;
  kundali?: Kundali | null;
  colors: Colors;
  width: number;
  onAsk?: (q: string) => void;
  print?: boolean;
}) {
  const s = styles(colors);
  const paras = (text: string) =>
    text.split(/\n\s*\n/).map((p, j) => (
      <Text key={j} style={s.body}>
        {highlight(p.trim(), colors.highlight)}
      </Text>
    ));
  let n = 0;
  const num = () => <Text style={s.num}>{String(++n).padStart(2, "0")}</Text>;
  return (
    <View style={{ gap: 18 }} testID="report-body">
      <View style={s.verdict} {...avoidBreak}>
        <Text style={s.mono}>{tr("THE SHORT ANSWER")}</Text>
        <Text style={s.verdictText}>{highlight(report.headline, colors.highlight)}</Text>
        {report.summary ? <Text style={s.body}>{highlight(report.summary, colors.highlight)}</Text> : null}
      </View>

      {kundali ? (
        <View style={{ gap: 12 }}>
          <Text style={s.h2}>{tr("Your kundali")}</Text>
          <KundaliView k={kundali} colors={colors} lang={report.lang} width={width} print={print} />
        </View>
      ) : null}

      <Text style={s.h2}>{tr("Your reading")}</Text>
      {report.sections.map((sec, i) => (
        <View key={i} style={s.section}>
          {num()}
          <Text style={s.secTitle}>{sec.heading}</Text>
          {paras(sec.body)}
        </View>
      ))}

      {report.periods?.length ? (
        <View style={s.section}>
          <Text style={s.secTitle}>{tr("Your dasha periods")}</Text>
          {report.periods.map((p, i) => (
            <View key={i} style={s.when} {...avoidBreak}>
              <View style={{ width: 200, gap: 2 }}>
                <Text style={s.whenDate}>{p.dasha}</Text>
                <Text style={s.mono}>{p.when}</Text>
              </View>
              <Text style={[s.body, { flex: 1, minWidth: 220 }]}>{highlight(p.reading, colors.highlight)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {report.transits?.length ? (
        <View style={s.section}>
          <Text style={s.secTitle}>{tr("Transits now")}</Text>
          {report.transits.map((t, i) => (
            <View key={i} style={s.when} {...avoidBreak}>
              <Text style={[s.whenDate, { width: 200 }]}>{t.planet}</Text>
              <Text style={[s.body, { flex: 1, minWidth: 220 }]}>{highlight(t.reading, colors.highlight)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {report.doshas?.length ? (
        <View style={s.row3}>
          {report.doshas.map((x, i) => (
            <View key={i} style={s.box} {...avoidBreak}>
              <Text style={s.secTitle}>{x.name}</Text>
              <Text style={s.body}>{highlight(x.reading, colors.highlight)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {report.timing.length ? (
        <View style={s.section}>
          <Text style={s.secTitle}>{tr("Your timeline")}</Text>
          {report.timing.map((t, i) => (
            <View key={i} style={s.when} {...avoidBreak}>
              <Text style={[s.whenDate, { width: 200 }]}>{t.when}</Text>
              <Text style={[s.body, { flex: 1, minWidth: 220 }]}>{highlight(t.what, colors.highlight)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {report.remedies.length ? (
        <View style={s.section}>
          <Text style={s.secTitle}>{tr("What to do")}</Text>
          {report.remedies.map((r, i) => (
            <View key={i} style={{ gap: 2 }} {...avoidBreak}>
              <Text style={[s.body, { fontFamily: font.semibold }]}>{r.title}</Text>
              <Text style={s.muted}>{r.how}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={s.row3}>
        {(
          [
            ["YOUR STRENGTHS", report.strengths, colors.success],
            ["WATCH FOR", report.watch, colors.accent],
          ] as const
        ).map(([label, items, c]) =>
          items.length ? (
            <View key={label} style={s.box} {...avoidBreak}>
              <Text style={[s.mono, { color: c }]}>{tr(label)}</Text>
              {items.map((x) => (
                <Text key={x} style={s.body}>
                  • {x}
                </Text>
              ))}
            </View>
          ) : null,
        )}
      </View>

      {report.followUps.length && onAsk ? (
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
    h2: { color: c.text, fontFamily: font.display, fontSize: 22, marginTop: 4 },
    mono: { color: c.muted, fontFamily: font.mono, fontSize: 10, letterSpacing: 1.8 },
    verdict: { gap: 10, padding: 24, borderRadius: 20, borderWidth: 1, borderColor: `${c.primary}66`, backgroundColor: `${c.primary}16` },
    verdictText: { color: c.text, fontFamily: font.display, fontSize: 20, lineHeight: 28 },
    section: { gap: 10, padding: 22, borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
    secTitle: { color: c.text, fontFamily: font.display, fontSize: 18 },
    num: { color: c.muted, fontFamily: font.mono, fontSize: 11, borderWidth: 1, borderColor: c.line, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 7, alignSelf: "flex-start" },
    body: { color: c.text, fontFamily: font.body, fontSize: 15, lineHeight: 24 },
    muted: { color: c.muted, fontFamily: font.body, fontSize: 14, lineHeight: 21 },
    when: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.line },
    whenDate: { color: c.accent, fontFamily: font.semibold, fontSize: 15 },
    row3: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
    box: { flexBasis: 240, flexGrow: 1, gap: 6, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
    ghost: { borderWidth: 1, borderColor: c.line, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16, backgroundColor: c.surface },
    ghostText: { color: c.text, fontFamily: font.medium, fontSize: 13 },
  });
