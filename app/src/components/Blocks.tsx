import { type ReactNode, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import type { Block } from "../lib/api";
import { type Colors, font, useTheme } from "../lib/theme";
import { PrakritiBars } from "./Prakriti";
import { TarotPick, TarotReveal } from "./TarotCards";
import { tr } from "../lib/i18n";

/** Planets, houses and dates in an answer, picked out in the highlight colour. */
const MARK = new RegExp(
  [
    // Planets, Lagna and Sade Sati
    String.raw`\b(?:Sun|Moon|Mars|Mercury|Jupiter|Venus|Saturn|Rahu|Ketu|Surya|Chandra|Mangal|Budh|Guru|Shukra|Shani|Sade Sati|Lagna)\b`,
    // Houses, in numbers or in words: "10th house", "seventh house", "house of gains", "house of career and status"
    String.raw`\b(?:1[0-2]|[1-9])(?:st|nd|rd|th) (?:house|lord)s?\b`,
    String.raw`\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth) house\b`,
    String.raw`\bhouse of (?:how you come across|[a-z]+(?:,? (?:and|&) [a-z]+)?)\b`,
    String.raw`\b(?:transiting|retrograde|mahadasha|antardasha)\b`,
    // Dates
    String.raw`\b(?:\d{1,2} )?(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec) (?:19|20)\d{2}\b`,
    String.raw`\b(?:mid-|early |late )?(?:19|20)\d{2}\b`,
    // Hindi: planets, houses and months
    "(?:सूर्य|चंद्र|चंद्रमा|मंगल|बुध|गुरु|बृहस्पति|शुक्र|शनि|राहु|केतु|साढ़ेसाती|लग्न|महादशा|अंतर्दशा)",
    "(?:\\d{1,2}(?:वें|वाँ|वां|वीं)? भाव)",
    "(?:\\d{1,2} )?(?:जनवरी|फ़रवरी|फरवरी|मार्च|अप्रैल|मई|जून|जुलाई|अगस्त|सितंबर|अक्टूबर|नवंबर|दिसंबर) (?:19|20)\\d{2}",
  ].join("|"),
  "g",
);

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

/** A titled bullet list inside the Ayurveda plan. */
function PlanList({
  label,
  items,
  dot,
}: {
  label: string;
  items: string[];
  dot: string;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  if (!items.length) return null;
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.mono}>{label}</Text>
      {items.map((x) => (
        <Text key={x} style={[s.body, { fontSize: 15 }]}>
          <Text style={{ color: dot }}>• </Text>
          {x}
        </Text>
      ))}
    </View>
  );
}

/** The Ayurveda consultation's assessment and plan. */
function AyurPlan({ b }: { b: Extract<Block, { type: "ayur-plan" }> }) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <View style={s.card} testID="ayur-plan">
      <Text style={s.mono}>{tr("AYURVEDA · YOUR PLAN")}</Text>
      {b.shloka?.sanskrit ? (
        <View style={[s.sunBox, { gap: 4 }]} testID="ayur-shloka">
          <Text style={s.mono}>{tr("FROM THE SAMHITAS")}</Text>
          <Text style={{ color: colors.text, fontFamily: font.verse, fontSize: 17, lineHeight: 28 }} selectable>
            {b.shloka.sanskrit}
          </Text>
          {b.shloka.meaning ? (
            <Text style={[s.body, { fontSize: 15 }]}>{b.shloka.meaning}</Text>
          ) : null}
          {b.shloka.source ? (
            <Text style={[s.mono, { color: colors.muted }]}>{b.shloka.source.toUpperCase()}</Text>
          ) : null}
        </View>
      ) : null}
      {b.assessment ? (
        <View style={s.sunBox}>
          <Text style={s.mono}>{tr("ASSESSMENT")}</Text>
          {b.assessment.doshas ? (
            <Text style={[s.body, { fontSize: 15 }]}>
              <Text style={{ fontFamily: font.semibold }}>{tr("Doshas:")} </Text>
              {b.assessment.doshas}
            </Text>
          ) : null}
          {b.assessment.agni ? (
            <Text style={[s.body, { fontSize: 15 }]}>
              <Text style={{ fontFamily: font.semibold }}>{tr("Agni and ama:")} </Text>
              {b.assessment.agni}
            </Text>
          ) : null}
          {b.assessment.nidana.length ? (
            <Text style={[s.body, { fontSize: 15 }]}>
              <Text style={{ fontFamily: font.semibold }}>
                {tr("Nidana (causes):")}{" "}
              </Text>
              {b.assessment.nidana.join("; ")}
            </Text>
          ) : null}
          {b.assessment.notes ? (
            <Text style={[s.body, { fontSize: 15, color: colors.muted }]}>
              {b.assessment.notes}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        <View style={{ flexBasis: 240, flexGrow: 1 }}>
          <PlanList
            label={tr("FAVOUR (PATHYA)")}
            items={b.favour}
            dot={colors.success}
          />
        </View>
        <View style={{ flexBasis: 240, flexGrow: 1 }}>
          <PlanList
            label={tr("AVOID (APATHYA)")}
            items={b.avoid}
            dot={colors.danger}
          />
        </View>
      </View>
      {b.remedies.length ? (
        <View style={{ gap: 6 }}>
          <Text style={s.mono}>{tr("KITCHEN REMEDIES")}</Text>
          {b.remedies.map((r) => (
            <View key={r.name} style={{ gap: 2 }}>
              <Text
                style={[
                  s.body,
                  {
                    fontFamily: font.semibold,
                    fontSize: 15,
                    color: colors.highlight,
                  },
                ]}
              >
                {r.name}
              </Text>
              <Text style={[s.body, { fontSize: 15 }]}>{r.how}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {b.formulations.length ? (
        <View style={{ gap: 4 }}>
          <Text style={s.mono}>{tr("CLASSICAL FORMULATIONS")}</Text>
          {b.formulations.map((f) => (
            <View key={f.name} style={s.factRow}>
              <Text
                style={[
                  s.body,
                  { flex: 1.2, fontSize: 15, fontFamily: font.semibold },
                ]}
              >
                {f.name}
              </Text>
              <Text style={[s.small, { flex: 1.6 }]}>
                {f.dose}
                {f.anupana ? ` · ${f.anupana}` : ""}
                {f.when ? ` · ${f.when}` : ""}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <PlanList
        label={tr("DAILY ROUTINE")}
        items={b.lifestyle}
        dot={colors.highlight}
      />
      <PlanList
        label={tr("YOGA AND PRANAYAMA")}
        items={b.yoga}
        dot={colors.highlight}
      />
      {b.redFlags.length ? (
        <View style={[s.sunBox, { backgroundColor: "rgba(248,113,113,0.10)" }]}>
          <Text style={[s.mono, { color: colors.danger }]}>
            {tr("SEE A DOCTOR PROMPTLY IF")}
          </Text>
          {b.redFlags.map((x) => (
            <Text key={x} style={[s.body, { fontSize: 15 }]}>
              • {x}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={s.small}>
        From Kosmik’s Ayurveda assistant by Asanoha (AYUSH licensed). Doses are
        the usual adult ones; a vaidya can tailor them to you.
      </Text>
    </View>
  );
}

/** Western (tropical) big three, the Sun on the birthday and the solar return. */
function ZodiacCard({ b }: { b: Extract<Block, { type: "zodiac" }> }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const three = [
    ["Sun", "who you are", b.sun],
    ["Moon", "how you feel", b.moon],
    ...(b.rising ? [["Rising", "how you come across", b.rising]] : []),
  ] as [
    string,
    string,
    { sign: string; glyph: string; degree: string; vibe: string },
  ][];
  return (
    <View style={s.card} testID="zodiac">
      <Text style={s.mono}>{tr("WESTERN · TROPICAL ZODIAC")}</Text>
      <Text style={s.title}>
        {tr("Your big three:")}{" "}
        {three.map(([, , p]) => `${p.glyph} ${p.sign}`).join("  ")}
      </Text>
      {three.map(([k, what, p]) => (
        <View key={k} style={{ flexDirection: "row", gap: 12 }}>
          <View style={s.zGlyph}>
            <Text style={{ color: colors.highlight, fontSize: 22 }}>
              {p.glyph}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[s.body, { fontFamily: font.semibold }]}>
              {tr("{v0} in {v1}", { v0: tr(k), v1: p.sign })}{" "}
              <Text style={s.small}>
                · {tr(what)} · {p.degree}
              </Text>
            </Text>
            <Text style={[s.body, { fontSize: 15, color: colors.muted }]}>
              {p.vibe}
            </Text>
          </View>
        </View>
      ))}
      <View style={s.sunBox}>
        <Text style={s.mono}>{tr("THE SUN ON YOUR BIRTHDAY")}</Text>
        <Text style={[s.body, { fontSize: 15 }]}>
          {tr("Tropical")}{" "}
          <Text style={{ color: colors.highlight }}>{b.sun.degree}</Text> ·{" "}
          {tr("Vedic (sidereal)")}{" "}
          <Text style={{ color: colors.highlight }}>{b.siderealSun}</Text>
        </Text>
        {b.cusp ? (
          <Text style={[s.body, { fontSize: 15 }]}>Born on the {b.cusp}.</Text>
        ) : null}
        <Text style={[s.body, { fontSize: 15 }]}>
          Next solar return (the Sun back at that exact degree):{" "}
          <Text style={{ color: colors.highlight }}>{b.solarReturn}</Text>
        </Text>
      </View>
      <View>
        {b.planets.map((p) => (
          <View key={p.graha} style={s.factRow}>
            <Text style={[s.small, { flex: 1 }]}>
              {p.graha[0].toUpperCase() + p.graha.slice(1)}
            </Text>
            <Text style={[s.chartCell, { flex: 1.5 }]}>
              {p.glyph} {p.degree}
            </Text>
          </View>
        ))}
      </View>
      <Text style={s.small}>
        Western signs are counted from the equinox; your kundli uses the
        sidereal (Vedic) zodiac, about 24° behind, so your rashi can be the sign
        before.
      </Text>
    </View>
  );
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
    [tr("Botanical"), (h) => h.botanical],
    [tr("Rasa"), (h) => h.rasa.map((x) => tr(x)).join(", ")],
    [tr("Guna"), (h) => h.guna.map((x) => tr(x)).join(", ")],
    [
      tr("Virya"),
      (h) => `${tr(h.virya)}${VIRYA[h.virya] ? ` (${tr(VIRYA[h.virya])})` : ""}`,
    ],
    [tr("Vipaka"), (h) => tr(h.vipaka)],
    [tr("Balances"), (h) => h.pacify.map((x) => tr(cap(x))).join(", ") || "—"],
    [tr("May increase"), (h) => h.aggravate.map((x) => tr(cap(x))).join(", ") || "—"],
    [tr("Parts used"), (h) => h.parts.map((x) => tr(x)).join(", ") || "—"],
  ];
  return (
    <View style={s.card} testID="herb-compare">
      <Text style={s.mono}>{tr("DRAVYAGUNA · SIDE BY SIDE")}</Text>
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
        {tr("Traditional knowledge, not medical advice. Source: Amidha Ayurveda Herb Database v2.0 (Sparsh Varshney), CC BY 4.0.")}
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
      <Text style={s.mono}>{tr("RITUCHARYA · NOW")}</Text>
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
            [tr("Strength (bala)"), b.strength],
            [tr("Rasa of the season"), b.rasa],
            [tr("Doshas"), b.doshas],
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
          [tr("Favour (pathya)"), b.favour, colors.success],
          [tr("Avoid (apathya)"), b.avoid, colors.danger],
          [tr("Routine"), b.routine, colors.highlight],
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
        {tr("Next: {v0}. Traditional guidance from Charaka Samhita and Ashtanga Hridaya; adapt it with your vaidya.", { v0: b.next })}
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
          {tr("The astrology behind this")}
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
  onTarotPick,
}: {
  blocks: Block[];
  onSignIn?: () => void;
  onPremium?: () => void;
  onDetails?: () => void;
  onPalm?: () => void;
  onPrakriti?: () => void;
  onVikriti?: () => void;
  /** Set only on the latest answer, so old fans can't be picked again. */
  onTarotPick?: (question: string, count: 1 | 3) => void;
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
            return <TarotReveal key={i} cards={b.cards} advice={b.advice} />;
          case "tarot-pick":
            return (
              <TarotPick
                key={i}
                count={b.count}
                disabled={!onTarotPick}
                onPick={() => onTarotPick?.(b.question, b.count)}
              />
            );
          case "chart":
            return (
              <View key={i} style={s.card} testID="chart">
                <Text style={s.title}>{tr("☉ Your birth chart")}</Text>
                <Text style={s.small}>
                  {tr("Lagna")}: {b.lagna ?? tr("unknown (no birth time)")} · {tr("Moon")}: {b.moon}{" "}
                  · {tr("Nakshatra")}: {b.nakshatra}
                </Text>
                {b.dasha ? (
                  <Text style={[s.small, { fontFamily: font.bold }]}>
                    {tr("Running dasha")}: {b.dasha}
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
                  {tr("Sidereal (Lahiri), whole-sign houses, Vimshottari dasha. ℞ = retrograde.")}
                </Text>
              </View>
            );
          case "palm":
            return (
              <View key={i} style={s.card} testID="palm-reading">
                <Text style={s.title}>{tr("✋ Your lines")}</Text>
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
                      [tr("Rasa (taste)"), b.rasa.map((x) => tr(x)).join(", ")],
                      [tr("Guna (quality)"), b.guna.map((x) => tr(x)).join(", ")],
                      [
                        tr("Virya (potency)"),
                        `${tr(b.virya)}${VIRYA[b.virya] ? ` (${tr(VIRYA[b.virya])})` : ""}`,
                      ],
                      [tr("Vipaka"), tr(b.vipaka)],
                      ...(b.synonyms?.length
                        ? [[tr("Paryaya (synonyms)"), b.synonyms.map((x) => tr(x)).join(", ")]]
                        : []),
                      ...(b.parts?.length
                        ? [[tr("Prayojyanga (parts used)"), b.parts.map((x) => tr(x)).join(", ")]]
                        : []),
                      [
                        tr("Balances"),
                        b.pacify.map((x) => tr(cap(x))).join(", ") || tr("None listed"),
                      ],
                      ...(b.aggravate.length
                        ? [[tr("May increase"), b.aggravate.map((x) => tr(cap(x))).join(", ")]]
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
                    {tr("Classical texts class this plant as poisonous. It is used only after special purification, by a qualified vaidya.")}
                  </Text>
                ) : null}
                <Text style={s.small}>
                  {tr("Traditional knowledge, not medical advice. Talk to a doctor or a qualified vaidya before taking any herb.")}
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
                      <Text style={s.small}>{tr(VIRYA[h.virya] ?? h.virya)}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={s.small}>
                  {b.total > b.herbs.length
                    ? tr("{v0} of {v1} herbs in Kosmik’s library. ", { v0: b.herbs.length, v1: b.total })
                    : ""}
                  Traditional knowledge, not medical advice. Source: Amidha
                  Ayurveda Herb Database v2.0 (Sparsh Varshney), CC BY 4.0.
                </Text>
              </View>
            );
          case "prakriti":
            return (
              <View key={i} style={s.card} testID="prakriti">
                <Text style={s.title}>❀ {tr("Your prakriti")}: {b.label}</Text>
                <PrakritiBars p={b} />
                <Text style={s.small}>
                  {tr("From your dosha quiz on {v0}. A self-assessment, not a diagnosis.", { v0: takenOn(b.takenAt) })}
                </Text>
                {onPrakriti ? (
                  <Pressable
                    onPress={onPrakriti}
                    accessibilityRole="button"
                    style={s.outlineBtn}
                  >
                    <Text style={s.outlineBtnText}>{tr("Retake the quiz")}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          case "ayur-intake":
            return (
              <View key={i} style={s.card} testID="ayur-intake">
                <Text style={s.mono}>{tr("A FEW QUESTIONS FIRST")}</Text>
                {b.questions.map((q, n) => (
                  <View key={q} style={{ flexDirection: "row", gap: 10 }}>
                    <Text
                      style={[
                        s.mono,
                        { color: colors.highlight, fontSize: 13 },
                      ]}
                    >
                      {n + 1}
                    </Text>
                    <Text style={[s.body, { flex: 1, fontSize: 15 }]}>{q}</Text>
                  </View>
                ))}
                <Text style={s.small}>
                  {tr("Answer them in one message below. The more detail, the better the plan.")}
                </Text>
              </View>
            );
          case "ayur-plan":
            return <AyurPlan key={i} b={b} />;
          case "zodiac":
            return <ZodiacCard key={i} b={b} />;
          case "herb-compare":
            return <HerbCompare key={i} herbs={b.herbs} onAsk={onAsk} />;
          case "ritu":
            return <RituCard key={i} b={b} />;
          case "vikriti":
            return (
              <View key={i} style={s.card} testID="vikriti">
                <Text style={s.mono}>{tr("VIKRITI · LAST FEW WEEKS")}</Text>
                <Text style={s.title}>
                  {b.aggravated.length
                    ? tr("Raised now: {v0}", { v0: b.aggravated.join(", ") })
                    : tr("No dosha clearly raised")}
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
                    {tr("Your prakriti: {v0}. Ayurveda aims to bring the present state back towards it.", { v0: b.prakriti })}
                  </Text>
                ) : null}
                <Text style={s.small}>
                  {tr("From your check on {v0}. A self-assessment, not a diagnosis.", { v0: takenOn(b.takenAt) })}
                </Text>
                {onVikriti ? (
                  <Pressable
                    onPress={onVikriti}
                    accessibilityRole="button"
                    style={s.outlineBtn}
                  >
                    <Text style={s.outlineBtnText}>{tr("Check again")}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          case "behind":
            return <Behind key={i} points={b.points} />;
          case "followups":
            return (
              <View key={i} style={{ gap: 8 }} testID="followups">
                <Text style={s.mono}>{tr("ASK NEXT")}</Text>
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
                    <Text style={s.noticeBtnText}>{tr("Sign in")}</Text>
                  </Pressable>
                ) : null}
                {b.kind === "needs-details" && onDetails ? (
                  <Pressable
                    onPress={onDetails}
                    accessibilityRole="button"
                    style={s.noticeBtn}
                  >
                    <Text style={s.noticeBtnText}>{tr("Add birth details")}</Text>
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
                        ? tr("Replace palm photos")
                        : tr("Add palm photos")}
                    </Text>
                  </Pressable>
                ) : null}
                {b.kind === "needs-vikriti" && onVikriti ? (
                  <Pressable
                    onPress={onVikriti}
                    accessibilityRole="button"
                    style={s.noticeBtn}
                  >
                    <Text style={s.noticeBtnText}>{tr("Take the vikriti check")}</Text>
                  </Pressable>
                ) : null}
                {b.kind === "needs-prakriti" && onPrakriti ? (
                  <Pressable
                    onPress={onPrakriti}
                    accessibilityRole="button"
                    style={s.noticeBtn}
                  >
                    <Text style={s.noticeBtnText}>{tr("Take the dosha quiz")}</Text>
                  </Pressable>
                ) : null}
                {b.kind === "limit" && onPremium ? (
                  <Pressable
                    onPress={onPremium}
                    accessibilityRole="button"
                    style={s.noticeBtn}
                  >
                    <Text style={s.noticeBtnText}>{tr("Go Premium")}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          default:
            // A newer Kosmik sent something this version can't show.
            return (
              <Pressable
                key={i}
                onPress={() => globalThis.location?.reload()}
                style={s.outlineBtn}
                accessibilityRole="button"
              >
                <Text style={s.outlineBtnText}>{tr("Refresh Kosmik to see this")}</Text>
              </Pressable>
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
    zGlyph: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: c.primarySoft,
      alignItems: "center",
      justifyContent: "center",
    },
    sunBox: {
      gap: 6,
      padding: 12,
      borderRadius: 14,
      backgroundColor: c.primarySoft,
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
