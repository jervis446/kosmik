import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Line, Rect, Text as SvgText } from "react-native-svg";

import type { Kundali as KundaliData, KundaliDiagram } from "../lib/api";
import { tr } from "../lib/i18n";
import { type Colors, font } from "../lib/theme";

const HI_ABBR: Record<string, string> = { sun: "सू", moon: "चं", mars: "मं", mercury: "बु", jupiter: "गु", venus: "शु", saturn: "श", rahu: "रा", ketu: "के" };
const LORD: Record<string, string> = { sun: "Sun", moon: "Moon", mars: "Mars", mercury: "Mercury", jupiter: "Jupiter", venus: "Venus", saturn: "Saturn", rahu: "Rahu", ketu: "Ketu" };

/** Where each house sits in the North Indian chart (house 1 at the top), as fractions of the square. */
const PLANETS_AT: [number, number][] = [
  [0.5, 0.22], [0.25, 0.07], [0.08, 0.25], [0.25, 0.47], [0.08, 0.75], [0.25, 0.9],
  [0.5, 0.72], [0.75, 0.9], [0.92, 0.75], [0.75, 0.47], [0.92, 0.25], [0.75, 0.07],
];
const SIGN_AT: [number, number][] = [
  [0.5, 0.45], [0.25, 0.21], [0.21, 0.26], [0.45, 0.51], [0.21, 0.76], [0.25, 0.81],
  [0.5, 0.57], [0.75, 0.81], [0.79, 0.76], [0.55, 0.51], [0.79, 0.26], [0.75, 0.21],
];
/** Triangles hold fewer names per line than the diamonds. */
const NARROW = new Set([2, 3, 5, 6, 8, 9, 11, 12]);

/** A North Indian (diamond) chart: houses fixed, sign numbers turning with the lagna. */
export function DiamondChart({ chart, title, size, colors, lang }: { chart: KundaliDiagram; title: string; size: number; colors: Colors; lang: string }) {
  const S = size;
  const houses = Array.from({ length: 12 }, (_, i) => {
    const sign = (chart.lagna + i) % 12;
    const names = chart.planets.filter((p) => p.sign === sign).map((p) => `${lang === "hi" ? HI_ABBR[p.graha] : p.abbr}${p.retro ? "ᴿ" : ""}`);
    const per = NARROW.has(i + 1) ? 2 : 3;
    const lines: string[] = [];
    for (let j = 0; j < names.length; j += per) lines.push(names.slice(j, j + per).join(" "));
    return { sign, lines };
  });
  const fs = Math.max(10, Math.round(S / 24));
  return (
    <View style={{ gap: 6, alignItems: "center" }}>
      <Text style={{ color: colors.text, fontFamily: font.display, fontSize: 16 }}>{title}</Text>
      <Svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} accessibilityLabel={title}>
        <Rect x={1} y={1} width={S - 2} height={S - 2} fill={colors.surface2} stroke={colors.primary} strokeWidth={1.5} />
        <Line x1={0} y1={0} x2={S} y2={S} stroke={colors.primary} strokeWidth={1} />
        <Line x1={S} y1={0} x2={0} y2={S} stroke={colors.primary} strokeWidth={1} />
        <Line x1={S / 2} y1={0} x2={0} y2={S / 2} stroke={colors.primary} strokeWidth={1} />
        <Line x1={0} y1={S / 2} x2={S / 2} y2={S} stroke={colors.primary} strokeWidth={1} />
        <Line x1={S / 2} y1={S} x2={S} y2={S / 2} stroke={colors.primary} strokeWidth={1} />
        <Line x1={S} y1={S / 2} x2={S / 2} y2={0} stroke={colors.primary} strokeWidth={1} />
        {houses.map((h, i) => (
          <SvgText key={`n${i}`} x={SIGN_AT[i][0] * S} y={SIGN_AT[i][1] * S + fs / 3} fontSize={fs - 2} fill={colors.muted} textAnchor="middle">
            {h.sign + 1}
          </SvgText>
        ))}
        {houses.map((h, i) =>
          h.lines.map((line, j) => (
            <SvgText
              key={`p${i}-${j}`}
              x={PLANETS_AT[i][0] * S}
              y={PLANETS_AT[i][1] * S + (j - (h.lines.length - 1) / 2) * (fs + 2) + fs / 3}
              fontSize={fs}
              fontWeight="600"
              fill={colors.text}
              textAnchor="middle"
            >
              {line}
            </SvgText>
          )),
        )}
        <SvgText x={S / 2} y={S * 0.3 + fs} fontSize={fs - 3} fill={colors.primary} textAnchor="middle">
          {lang === "hi" ? "लग्न" : "Asc"}
        </SvgText>
      </Svg>
    </View>
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const isNow = (p: { start: string; end: string }, d = today()) => p.start <= d && d < p.end;
/** "2019-12-08" → "Dec 2019" */
const monthYear = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
};

function Rows({ title, rows, s }: { title: string; rows: [string, string][]; s: ReturnType<typeof styles> }) {
  return (
    <View style={s.card} {...avoidBreak}>
      <Text style={s.cardTitle}>{tr(title)}</Text>
      {rows.map(([label, value]) => (
        <View key={label} style={s.kv}>
          <Text style={s.k}>{tr(label)}</Text>
          <Text style={s.v}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

/** Keeps a card on one printed page. */
const avoidBreak = { dataSet: { avoid: "1" } } as object;

/** The calculated kundali at the top of a chart report: charts, birth details, planets, dashas, doshas. */
export function KundaliView({ k, colors, lang, width, print = false }: { k: KundaliData; colors: Colors; lang: string; width: number; print?: boolean }) {
  const s = styles(colors);
  const [allDashas, setAllDashas] = useState(print);
  // Two charts side by side on wide screens and on A4; one under the other on phones.
  const chartSize = print ? 270 : Math.min(320, Math.max(240, (Math.min(width, 760) - 64) / (width >= 640 ? 2 : 1)));
  const d = today();
  const running = k.dashas.findIndex((m) => isNow(m, d));
  const shownDashas = allDashas ? k.dashas : k.dashas.filter((_, i) => i === running || i === running + 1);
  const moonOnly = k.chartKind === "moon";
  return (
    <View style={{ gap: 14 }} testID="kundali">
      <View style={s.charts} {...avoidBreak}>
        <DiamondChart chart={k.d1} title={tr(moonOnly ? "Moon chart (D1)" : "Lagna chart (D1)")} size={chartSize} colors={colors} lang={lang} />
        <DiamondChart chart={k.d9} title={tr("Navamsa chart (D9)")} size={chartSize} colors={colors} lang={lang} />
      </View>
      {moonOnly ? <Text style={s.note}>{tr("No birth time, so the houses are counted from your Moon sign.")}</Text> : null}

      <View style={s.grid}>
        <Rows title="Birth details" rows={k.basics} s={s} />
        <Rows title="Panchang at birth" rows={k.panchang} s={s} />
        <Rows title="Avkahada chakra" rows={k.avkahada} s={s} />
      </View>

      <View style={[s.card, { flexBasis: "auto" }]} {...avoidBreak}>
        <Text style={s.cardTitle}>{tr("Planets")}</Text>
        <ScrollView horizontal={!print && width < 600} scrollEnabled={!print && width < 600}>
        <View style={{ minWidth: !print && width < 600 ? 560 : undefined, flexGrow: 1 }}>
        <View style={[s.tr, s.th]}>
          {["Planet", "Sign", "Degree", "Nakshatra", "House", "Dignity"].map((h, i) => (
            <Text key={h} style={[s.td, s.thText, COLS[i]]}>{tr(h)}</Text>
          ))}
        </View>
        {k.planets.map((p) => (
          <View key={p.graha} style={s.tr}>
            <Text style={[s.td, COLS[0], { fontFamily: font.semibold }]}>{p.name}{p.retro ? " ℞" : ""}</Text>
            <Text style={[s.td, COLS[1]]}>{p.sign}</Text>
            <Text style={[s.td, COLS[2]]}>{p.degree}</Text>
            <Text style={[s.td, COLS[3]]}>{p.nakshatra} {p.pada}</Text>
            <Text style={[s.td, COLS[4]]}>{p.house ?? "—"}</Text>
            <Text style={[s.td, COLS[5]]}>{p.dignity}</Text>
          </View>
        ))}
        </View>
        </ScrollView>
      </View>

      <View style={{ gap: 10 }}>
        <Text style={s.cardTitle}>{tr("Vimshottari dasha")}</Text>
        <View style={s.grid}>
          {shownDashas.map((m) => {
            const now = isNow(m, d);
            return (
              <View key={m.start} style={[s.card, s.dasha, now && { borderColor: colors.primary }]} {...avoidBreak}>
                <Text style={[s.k, { color: now ? colors.primary : colors.muted }]}>
                  {tr(LORD[m.lord])} {tr("mahadasha")}{now ? ` · ${tr("NOW")}` : ""}
                </Text>
                <Text style={s.v}>{monthYear(m.start)} – {monthYear(m.end)}</Text>
                <View style={s.kv}>
                  <Text style={s.thText}>{tr("ANTARDASHA")}</Text>
                  <Text style={s.thText}>{tr("ENDS")}</Text>
                </View>
                {m.antars.map((a) => (
                  <View key={a.start} style={s.kv}>
                    <Text style={[s.small, isNow(a, d) && { color: colors.primary, fontFamily: font.semibold }]}>{tr(LORD[m.lord])}–{tr(LORD[a.lord])}</Text>
                    <Text style={[s.small, isNow(a, d) && { color: colors.primary, fontFamily: font.semibold }]}>{monthYear(a.end)}</Text>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
        {!print ? (
          <Pressable onPress={() => setAllDashas((v) => !v)} accessibilityRole="button" style={s.more}>
            <Text style={s.moreText}>{allDashas ? tr("Show fewer periods") : tr("Show all nine mahadashas")}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={s.grid}>
        <View style={[s.card, { alignSelf: "flex-start" }]} {...avoidBreak}>
          <Text style={s.cardTitle}>{tr("Manglik")}</Text>
          <View style={s.kv}>
            <Text style={s.k}>{tr("From the lagna")}</Text>
            <Text style={s.v}>{k.manglik.fromLagna === null ? tr("Not known") : k.manglik.fromLagna ? tr("Yes") : tr("No")}</Text>
          </View>
          <View style={s.kv}>
            <Text style={s.k}>{tr("From the Moon")}</Text>
            <Text style={s.v}>{k.manglik.fromMoon ? tr("Yes") : tr("No")}</Text>
          </View>
          <Text style={s.note}>{k.manglik.text}</Text>
        </View>
        <View style={[s.card, { flexBasis: 320 }]} {...avoidBreak}>
          <Text style={s.cardTitle}>{tr("Sade Sati and dhaiya")}</Text>
          {k.sadeSati
            .filter((x) => print || x.end >= d)
            .slice(0, print ? 60 : 8)
            .map((x) => (
              <View key={x.start} style={s.kv}>
                <Text style={[s.small, isNow(x, d) && { color: colors.primary, fontFamily: font.semibold }]}>
                  {tr(x.kind)}{x.phase ? ` · ${tr(`${x.phase} phase`)}` : ""}
                </Text>
                <Text style={[s.small, isNow(x, d) && { color: colors.primary, fontFamily: font.semibold }]}>
                  {monthYear(x.start)} – {monthYear(x.end)}
                </Text>
              </View>
            ))}
          <Text style={s.note}>{tr("Saturn over the 12th, 1st and 2nd signs from your Moon (Sade Sati), and the 4th and 8th (dhaiya). Dates to within about two weeks.")}</Text>
        </View>
      </View>
    </View>
  );
}

const COLS = [{ flex: 1.2 }, { flex: 1.7 }, { flex: 0.9 }, { flex: 1.6 }, { flex: 0.6 }, { flex: 1.3 }];

const styles = (c: Colors) =>
  StyleSheet.create({
    charts: { flexDirection: "row", flexWrap: "wrap", gap: 20, justifyContent: "center", padding: 16, borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
    card: { flexBasis: 240, flexGrow: 1, gap: 6, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
    dasha: { flexBasis: 190, gap: 3 },
    cardTitle: { color: c.text, fontFamily: font.display, fontSize: 17 },
    kv: { flexDirection: "row", justifyContent: "space-between", gap: 10, paddingVertical: 2 },
    k: { color: c.muted, fontFamily: font.medium, fontSize: 13 },
    v: { color: c.text, fontFamily: font.semibold, fontSize: 13, textAlign: "right", flexShrink: 1 },
    small: { color: c.text, fontFamily: font.body, fontSize: 12 },
    note: { color: c.muted, fontFamily: font.body, fontSize: 12, lineHeight: 18 },
    tr: { flexDirection: "row", gap: 6, paddingVertical: 5, borderTopWidth: 1, borderTopColor: c.line },
    th: { borderTopWidth: 0 },
    td: { color: c.text, fontFamily: font.body, fontSize: 12 },
    thText: { color: c.muted, fontFamily: font.mono, fontSize: 10, letterSpacing: 1 },
    more: { alignSelf: "flex-start", borderWidth: 1, borderColor: c.line, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14, backgroundColor: c.surface },
    moreText: { color: c.text, fontFamily: font.medium, fontSize: 13 },
  });
