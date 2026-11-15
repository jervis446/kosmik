import { type ReactNode, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import type { Block } from "../lib/api";
import { type Colors, font, useTheme } from "../lib/theme";
import { PrakritiBars } from "./Prakriti";

/** Planets, houses and dates in an answer, picked out in the highlight colour. */
const MARK =
  /\b(Sun|Moon|Mars|Mercury|Jupiter|Venus|Saturn|Rahu|Ketu|Surya|Chandra|Mangal|Budh|Guru|Shukra|Shani|Sade Sati|Lagna|(?:1[0-2]|[1-9])(?:st|nd|rd|th) (?:house|lord)s?|(?:\d{1,2} )?(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec) (?:19|20)\d{2}|(?:mid-|early |late )?(?:19|20)\d{2})\b/g;

export function highlight(text: string, color: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MARK)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <Text key={m.index} style={{ color }}>
        {m[0]}
      </Text>,
    );
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

type CompareHerb = Extract<Block, { type: "herb-compare" }>["herbs"][number];

/** Two or three herbs side by side, property by property. */
function HerbCompare({
  herbs,
  onAsk,
}: {
  herbs: CompareHerb[];
  onAsk?: (q: string) => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const rows: [string, (h: CompareHerb) => string][] = [
    ["Botanical", (h) => h.botanical],
    ["Rasa", (h) => h.rasa.join(", ")],
    ["Guna", (h) => h.guna.join(", ")],
    [
      "Virya",
      (h) => `${h.virya}${VIRYA[h.virya] ? ` (${VIRYA[h.virya]})` : ""}`,
    ],
    ["Vipaka", (h) => h.vipaka],
    ["Balances", (h) => h.pacify.map(cap).join(", ") || "—"],
    ["May increase", (h) => h.aggravate.map(cap).join(", ") || "—"],
    ["Parts used", (h) => h.parts.join(", ") || "—"],
  ];
  return (
    <View style={s.card} testID="herb-compare">
      <Text style={s.mono}>DRAVYAGUNA · SIDE BY SIDE</Text>
      <View style={s.factRow}>
        <View style={{ flex: 0.9 }} />
        {herbs.map((h) => (
          <Pressable
            key={h.key}
            style={{ flex: 1 }}
            onPress={onAsk ? () => onAsk(`What is ${h.name}?`) : undefined}
            accessibilityRole="button"
          >
            <Text style={[s.title, { fontSize: 16 }]}>❀ {h.name}</Text>
            <Text style={s.small}>{h.english}</Text>
          </Pressable>
        ))}
      </View>
      {rows.map(([label, get]) => (
        <View key={label} style={s.factRow}>
          <Text style={[s.small, { flex: 0.9 }]}>{label}</Text>
          {herbs.map((h) => (
            <Text
              key={h.key}
              style={[
                s.chartCell,
                { flex: 1 },
                label === "Botanical" && { fontStyle: "italic" },
              ]}
            >
              {get(h)}
            </Text>
          ))}
        </View>
      ))}
      <Text style={s.small}>
        Traditional knowledge, not medical advice. Source: Amidha Ayurveda Herb
        Database v2.0 (Sparsh Varshney), CC BY 4.0.
      </Text>
    </View>
  );
}

/** The ritu running now, with its guidance. */
function RituCard({ b }: { b: Extract<Block, { type: "ritu" }> }) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <View style={s.card} testID="ritu">
      <Text style={s.mono}>RITUCHARYA · NOW</Text>
      <Text style={s.title}>
        {b.ritu}{" "}
        <Text style={{ fontFamily: font.verse, color: colors.highlight }}>
          {b.sanskrit}
        </Text>
      </Text>
      <Text style={s.small}>
        {b.months} · {b.ayana}
      </Text>
      <View>
        {(
          [
            ["Strength (bala)", b.strength],
            ["Rasa of the season", b.rasa],
            ["Doshas", b.doshas],
          ] as [string, string][]
        ).map(([k, v]) => (
          <View key={k} style={s.factRow}>
            <Text style={[s.small, { flex: 1 }]}>{k}</Text>
            <Text style={[s.chartCell, { flex: 1.6 }]}>{v}</Text>
          </View>
        ))}
      </View>
      {(
        [
          ["Favour (pathya)", b.favour, colors.success],
          ["Avoid (apathya)", b.avoid, colors.danger],
          ["Routine", b.routine, colors.highlight],
        ] as [string, string[], string][]
      ).map(([k, items, c]) => (
        <View key={k} style={{ gap: 4 }}>
          <Text style={s.mono}>{k.toUpperCase()}</Text>
          {items.map((x) => (
            <Text key={x} style={[s.body, { fontSize: 15 }]}>
              <Text style={{ color: c }}>• </Text>
              {x}
            </Text>
          ))}
        </View>
      ))}
      <Text style={s.small}>
        Next: {b.next}. Traditional guidance from Charaka Samhita and Ashtanga
        Hridaya; adapt it with your vaidya.
      </Text>
    </View>
  );
}

/** "The astrology behind this": folded until tapped. */
function Behind({ points }: { points: string[] }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        onPress={() => setOpen(!open)}
        style={s.behindBtn}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={{ color: colors.highlight }}>✦</Text>
        <Text style={[s.body, { fontSize: 15 }]}>
          The astrology behind this
        </Text>
        <Text style={{ color: colors.muted }}>{open ? "⌃" : "⌄"}</Text>
      </Pressable>
      {open ? (
        <View style={s.behindBox} testID="behind">
          {points.map((p) => (
            <Text key={p} style={[s.body, { fontSize: 14 }]}>
              <Text style={{ color: colors.highlight }}>• </Text>
              {highlight(p, colors.highlight)}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const cap = (d: string) => d[0].toUpperCase() + d.slice(1);
const VIRYA: Record<string, string> = { Ushna: "heating", Sheeta: "cooling" };
const takenOn = (ms: number) =>
  new Date(ms).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** Renders an answer: text, verse cards, meaning cards, a tarot spread or notices. */
export function Blocks({
  blocks,
  onSignIn,
  onPremium,
  onDetails,
  onPalm,
  onPrakriti,
  onVikriti,
  onAsk,
}: {
  blocks: Block[];
  onSignIn?: () => void;
  onPremium?: () => void;
  onDetails?: () => void;
  onPalm?: () => void;
  onPrakriti?: () => void;
  onVikriti?: () => void;
  /** Asks a follow-up question, e.g. tapping a herb in a list. */
  onAsk?: (question: string) => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <View style={{ gap: 12 }}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "text":
            return (
              <Text key={i} style={s.body} selectable>
                {highlight(b.text, colors.highlight)}
              </Text>
            );
          case "verse":
            return <VerseCard key={i} block={b} />;
          case "meaning":
            return (
              <View key={i} style={s.card}>
                <View style={s.row}>
                  <Text style={[s.title, { flex: 1 }]}>{b.title}</Text>
                </View>
                <Text style={s.body} selectable>
                  {b.body}
                </Text>
              </View>
            );
          case "tarot":
            return <TarotSpread key={i} cards={b.cards} />;
          case "chart":
            return (
              <View key={i} style={s.card} testID="chart">
                <Text style={s.title}>☉ Your birth chart</Text>
                <Text style={s.small}>
                  Lagna: {b.lagna ?? "unknown (no birth time)"} · Moon: {b.moon}{" "}
                  · Nakshatra: {b.nakshatra}
                </Text>
                {b.dasha ? (
                  <Text style={[s.small, { fontFamily: font.bold }]}>
                    Running dasha: {b.dasha}
                  </Text>
                ) : null}
                <View style={{ gap: 4 }}>
                  {b.rows.map((r) => (
                    <View key={r.graha} style={s.chartRow}>
                      <Text style={[s.chartCell, { flex: 1.3 }]}>
                        {r.graha}
                      </Text>
                      <Text style={[s.chartCell, { flex: 1.5 }]}>
                        {r.rashi}
                        {r.retrograde ? " ℞" : ""}
                      </Text>
                      {r.house ? (
                        <Text style={[s.chartCell, s.house]}>{r.house}</Text>
                      ) : null}
                    </View>
                  ))}
                </View>
                <Text style={s.small}>
                  Sidereal (Lahiri), whole-sign houses, Vimshottari dasha. ℞ =
                  retrograde.
                </Text>
              </View>
            );
          case "palm":
            return (
              <View key={i} style={s.card} testID="palm-reading">
                <Text style={s.title}>✋ Your lines</Text>
                {b.lines.map((l) => (
                  <View key={l.name} style={{ gap: 2 }}>
                    <Text style={[s.ref, { fontSize: 14 }]}>{l.name}</Text>
                    <Text style={s.body} selectable>
                      {l.reading}
                    </Text>
                  </View>
                ))}
              </View>
            );
          case "herb":
            return (
              <View key={i} style={s.card} testID="herb">
                <View style={{ gap: 2 }}>
                  <Text style={s.title}>
                    ❀ {b.name}
                    {b.english ? ` · ${b.english}` : ""}
                  </Text>
                  <Text style={[s.small, { fontStyle: "italic" }]}>
                    {b.botanical}
                  </Text>
                </View>
                <Text style={s.body} selectable>
                  {b.description}
                </Text>
                <View style={s.facts}>
                  {(
                    [
                      ["Rasa (taste)", b.rasa.join(", ")],
                      ["Guna (quality)", b.guna.join(", ")],
                      [
                        "Virya (potency)",
                        `${b.virya}${VIRYA[b.virya] ? ` (${VIRYA[b.virya]})` : ""}`,
                      ],
                      ["Vipaka", b.vipaka],
                      ...(b.synonyms?.length
                        ? [["Paryaya (synonyms)", b.synonyms.join(", ")]]
                        : []),
                      ...(b.parts?.length
                        ? [["Prayojyanga (parts used)", b.parts.join(", ")]]
                        : []),
                      [
                        "Balances",
                        b.pacify.map(cap).join(", ") || "None listed",
                      ],
                      ...(b.aggravate.length
                        ? [["May increase", b.aggravate.map(cap).join(", ")]]
                        : []),
                    ] as [string, string][]
                  ).map(([k, v]) => (
                    <View key={k} style={s.factRow}>
                      <Text style={[s.small, { flex: 1 }]}>{k}</Text>
                      <Text style={[s.chartCell, { flex: 1.4 }]}>{v}</Text>
                    </View>
                  ))}
                </View>
                {b.caution ? (
                  <Text style={[s.small, { color: colors.danger }]}>
                    Classical texts class this plant as poisonous. It is used
                    only after special purification, by a qualified vaidya.
                  </Text>
                ) : null}
                <Text style={s.small}>
                  Traditional knowledge, not medical advice. Talk to a doctor or
                  a qualified vaidya before taking any herb.
                </Text>
                <Text
                  style={[s.small, { textDecorationLine: "underline" }]}
                  accessibilityRole="link"
                  onPress={() => Linking.openURL(b.link)}
                >
                  Source: Amidha Ayurveda Herb Database v2.0 (Sparsh Varshney),
                  CC BY 4.0. Description rewritten by Kosmik.
                </Text>
              </View>
            );
          case "herb-list":
            return (
              <View key={i} style={s.card} testID="herb-list">
                <Text style={s.title}>❀ {b.title}</Text>
                <View>
                  {b.herbs.map((h) => (
                    <Pressable
                      key={h.key}
                      onPress={
                        onAsk ? () => onAsk(`What is ${h.name}?`) : undefined
                      }
                      disabled={!onAsk}
                      style={s.factRow}
                      accessibilityRole="button"
                      accessibilityLabel={`About ${h.name}`}
                    >
                      <Text style={[s.chartCell, { flex: 1 }]}>
                        {h.name}
                        {h.english ? (
                          <Text style={s.small}> · {h.english}</Text>
                        ) : null}
                      </Text>
                      <Text style={s.small}>{VIRYA[h.virya] ?? h.virya}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={s.small}>
                  {b.total > b.herbs.length
                    ? `${b.herbs.length} of ${b.total} herbs in Kosmik’s library. `
                    : ""}
                  Traditional knowledge, not medical advice. Source: Amidha
                  Ayurveda Herb Database v2.0 (Sparsh Varshney), CC BY 4.0.
                </Text>
              </View>
            );
          case "prakriti":
            return (
              <View key={i} style={s.card} testID="prakriti">
                <Text style={s.title}>❀ Your prakriti: {b.label}</Text>
                <PrakritiBars p={b} />
                <Text style={s.small}>
                  From your dosha quiz on {takenOn(b.takenAt)}. A
                  self-assessment, not a diagnosis.
                </Text>
                {onPrakriti ? (
                  <Pressable
                    onPress={onPrakriti}
                    accessibilityRole="button"
                    style={s.outlineBtn}
                  >
                    <Text style={s.outlineBtnText}>Retake the quiz</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          case "herb-compare":
            return <HerbCompare key={i} herbs={b.herbs} onAsk={onAsk} />;
          case "ritu":
            return <RituCard key={i} b={b} />;
          case "vikriti":
            return (
              <View key={i} style={s.card} testID="vikriti">
                <Text style={s.mono}>VIKRITI · LAST FEW WEEKS</Text>
                <Text style={s.title}>
                  {b.aggravated.length
                    ? `Raised now: ${b.aggravated.join(", ")}`
                    : "No dosha clearly raised"}
                </Text>
                <PrakritiBars
                  p={{
                    vata: b.vata * 10,
                    pitta: b.pitta * 10,
                    kapha: b.kapha * 10,
                  }}
                />
                <Text style={[s.body, { fontSize: 15 }]}>{b.agni}</Text>
                {b.prakriti ? (
                  <Text style={s.small}>
                    Your prakriti: {b.prakriti}. Ayurveda aims to bring the
                    present state back towards it.
                  </Text>
                ) : null}
                <Text style={s.small}>
                  From your check on {takenOn(b.takenAt)}. A self-assessment,
                  not a diagnosis.
                </Text>
                {onVikriti ? (
                  <Pressable
                    onPress={onVikriti}
                    accessibilityRole="button"
                    style={s.outlineBtn}
                  >
                    <Text style={s.outlineBtnText}>Check again</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          case "behind":
            return <Behind key={i} points={b.points} />;
          case "followups":
            return (
              <View key={i} style={{ gap: 8 }} testID="followups">
                <Text style={s.mono}>ASK NEXT</Text>
                <View style={s.nextGrid}>
                  {b.questions.map((q) => (
                    <Pressable
                      key={q}
                      onPress={onAsk ? () => onAsk(q) : undefined}
                      disabled={!onAsk}
                      style={({ pressed }) => [
                        s.next,
                        pressed && { borderColor: colors.primary },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Ask: ${q}`}
                    >
                      <Text style={[s.body, { flex: 1, fontSize: 15 }]}>
                        {q}
                      </Text>
                      <Text style={{ color: colors.muted }}>→</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          case "notice":
            return (
              <View
                key={i}
                style={[
                  s.notice,
                  b.kind === "helpline" && {
                    backgroundColor: colors.accentSoft,
                  },
                ]}
                accessibilityRole={b.kind === "helpline" ? "alert" : undefined}
              >
                <Text
                  style={[s.body, { fontFamily: font.semibold }]}
                  selectable
                >
                  {b.text}
                </Text>
                {b.kind === "sign-in" && onSignIn ? (
                  <Pressable
                    onPress={onSignIn}
                    accessibilityRole="button"
                    style={s.noticeBtn}
                  >
                    <Text style={s.noticeBtnText}>Sign in</Text>
                  </Pressable>
                ) : null}
                {b.kind === "needs-details" && onDetails ? (
                  <Pressable
                    onPress={onDetails}
                    accessibilityRole="button"
                    style={s.noticeBtn}
                  >
                    <Text style={s.noticeBtnText}>Add birth details</Text>
                  </Pressable>
                ) : null}
                {(b.kind === "needs-palm" || b.kind === "retake") && onPalm ? (
                  <Pressable
                    onPress={onPalm}
                    accessibilityRole="button"
                    style={s.noticeBtn}
                  >
                    <Text style={s.noticeBtnText}>
                      {b.kind === "retake"
                        ? "Replace palm photos"
                        : "Add palm photos"}
                    </Text>
                  </Pressable>
                ) : null}
                {b.kind === "needs-vikriti" && onVikriti ? (
                  <Pressable
                    onPress={onVikriti}
                    accessibilityRole="button"
                    style={s.noticeBtn}
                  >
                    <Text style={s.noticeBtnText}>Take the vikriti check</Text>
                  </Pressable>
                ) : null}
                {b.kind === "needs-prakriti" && onPrakriti ? (
                  <Pressable
                    onPress={onPrakriti}
                    accessibilityRole="button"
                    style={s.noticeBtn}
                  >
                    <Text style={s.noticeBtnText}>Take the dosha quiz</Text>
                  </Pressable>
                ) : null}
                {b.kind === "limit" && onPremium ? (
                  <Pressable
                    onPress={onPremium}
                    accessibilityRole="button"
                    style={s.noticeBtn}
                  >
                    <Text style={s.noticeBtnText}>Go Premium</Text>
                  </Pressable>
                ) : null}
              </View>
            );
        }
      })}
    </View>
  );
}

function VerseCard({ block }: { block: Extract<Block, { type: "verse" }> }) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <View
      style={s.card}
      accessibilityLabel={`Bhagavad Gita ${block.ref.replace("BG ", "")}`}
    >
      <Text style={s.sanskrit} selectable>
        {block.sanskrit}
      </Text>
      <Text style={s.iast} selectable>
        {block.iast}
      </Text>
      <Text style={s.body} selectable>
        {block.translation}
      </Text>
      <View style={[s.row, { flexWrap: "wrap", gap: 10 }]}>
        <Text style={s.ref}>Bhagavad Gita {block.ref.replace("BG ", "")}</Text>
        <Text style={s.small}>Translation: {block.translator}</Text>
      </View>
    </View>
  );
}

function TarotSpread({
  cards,
}: {
  cards: Extract<Block, { type: "tarot" }>["cards"];
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const [open, setOpen] = useState<boolean[]>(() => cards.map(() => false));
  return (
    <View style={{ gap: 10 }}>
      <View style={[s.row, { gap: 10 }]}>
        {cards.map((c, i) => (
          <Pressable
            key={c.key + i}
            onPress={() => setOpen((o) => o.map((v, j) => (j === i ? !v : v)))}
            accessibilityRole="button"
            accessibilityLabel={
              open[i]
                ? `${c.position}: ${c.name}${c.reversed ? ", reversed" : ""}`
                : `Turn over the ${c.position.toLowerCase()} card`
            }
            style={[
              s.tarot,
              open[i]
                ? { backgroundColor: colors.surface2 }
                : { backgroundColor: colors.primary },
            ]}
          >
            {open[i] ? (
              <>
                <Text style={s.tarotPos}>{c.position}</Text>
                <Text style={s.tarotName}>{c.name}</Text>
                {c.reversed ? <Text style={s.small}>Reversed</Text> : null}
              </>
            ) : (
              <Text style={{ color: "#fff", fontSize: 26 }}>✦</Text>
            )}
          </Pressable>
        ))}
      </View>
      {cards.map((c, i) =>
        open[i] && c.meaning ? (
          <Text key={i} style={s.body}>
            <Text style={{ fontFamily: font.bold }}>
              {c.name}
              {c.reversed ? " (reversed)" : ""}:{" "}
            </Text>
            {c.meaning}
          </Text>
        ) : null,
      )}
      {open.some((o) => !o) ? (
        <Text style={s.small}>Tap a card to turn it over.</Text>
      ) : null}
    </View>
  );
}

const styles = (c: Colors) =>
  StyleSheet.create({
    body: {
      color: c.text,
      fontFamily: font.body,
      fontSize: 16,
      lineHeight: 24,
    },
    small: { color: c.muted, fontFamily: font.medium, fontSize: 13 },
    title: { color: c.text, fontFamily: font.display, fontSize: 18 },
    row: { flexDirection: "row", alignItems: "center" },
    card: {
      backgroundColor: c.surface2,
      borderColor: c.line,
      borderWidth: 1,
      borderRadius: 20,
      padding: 16,
      gap: 10,
    },
    sanskrit: {
      color: c.text,
      fontFamily: font.verse,
      fontSize: 19,
      lineHeight: 32,
    },
    iast: {
      color: c.muted,
      fontFamily: font.body,
      fontStyle: "italic",
      fontSize: 15,
      lineHeight: 22,
    },
    ref: { color: c.accent, fontFamily: font.bold, fontSize: 13 },
    notice: {
      backgroundColor: c.primarySoft,
      borderRadius: 16,
      padding: 14,
      gap: 10,
    },
    noticeBtn: {
      alignSelf: "flex-start",
      backgroundColor: c.primary,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 10,
      minHeight: 44,
      justifyContent: "center",
    },
    noticeBtnText: { color: c.onPrimary, fontFamily: font.bold, fontSize: 15 },
    mono: {
      color: c.muted,
      fontFamily: font.mono,
      fontSize: 11,
      letterSpacing: 2,
    },
    nextGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    next: {
      flexBasis: 240,
      flexGrow: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 10,
      minHeight: 46,
    },
    behindBtn: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 999,
      paddingHorizontal: 14,
      minHeight: 42,
    },
    behindBox: {
      borderLeftWidth: 2,
      borderLeftColor: c.primary,
      paddingLeft: 12,
      gap: 6,
    },
    outlineBtn: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 999,
      paddingHorizontal: 16,
      minHeight: 42,
      justifyContent: "center",
    },
    outlineBtnText: { color: c.text, fontFamily: font.bold, fontSize: 14 },
    facts: { gap: 0 },
    factRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
      minHeight: 40,
    },
    chartRow: {
      flexDirection: "row",
      gap: 8,
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
    },
    chartCell: { color: c.text, fontFamily: font.medium, fontSize: 14 },
    house: { color: c.muted, minWidth: 40, textAlign: "right" },
    tarot: {
      flex: 1,
      aspectRatio: 2 / 3.1,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.line,
      alignItems: "center",
      justifyContent: "center",
      padding: 8,
      gap: 4,
    },
    tarotPos: {
      color: c.muted,
      fontFamily: font.bold,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    tarotName: {
      color: c.text,
      fontFamily: font.heavy,
      fontSize: 14,
      textAlign: "center",
    },
  });
