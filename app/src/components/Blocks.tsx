import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import type { Block } from "../lib/api";
import { type Colors, font, useTheme } from "../lib/theme";
import { PrakritiBars } from "./Prakriti";

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
  onAsk,
}: {
  blocks: Block[];
  onSignIn?: () => void;
  onPremium?: () => void;
  onDetails?: () => void;
  onPalm?: () => void;
  onPrakriti?: () => void;
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
                {b.text}
              </Text>
            );
          case "verse":
            return <VerseCard key={i} block={b} />;
          case "meaning":
            return (
              <View key={i} style={s.card}>
                <View style={s.row}>
                  <Text style={[s.title, { flex: 1 }]}>{b.title}</Text>
                  {!b.reviewed ? <Text style={s.draft}>Draft</Text> : null}
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
                  Sidereal (Lahiri), whole-sign houses. ℞ = retrograde.
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
    title: { color: c.text, fontFamily: font.bold, fontSize: 16 },
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
    draft: {
      color: c.accent,
      backgroundColor: c.accentSoft,
      fontFamily: font.bold,
      fontSize: 11,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      overflow: "hidden",
    },
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
