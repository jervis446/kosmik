import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { type Colors, font, useTheme } from "../lib/theme";

type Engine = {
  glyph: string;
  title: string;
  tagline: string;
  detail: string;
  examples: string[];
  tint: string;
};

/** What Kosmik can do. Details and examples show on hover (or tap, on a phone). */
const ENGINES: Engine[] = [
  {
    glyph: "ॐ",
    title: "Bhagavad Gita",
    tagline: "Verses and wisdom",
    detail:
      "Any verse by number, a verse for today, or what the Gita says about what’s on your mind.",
    examples: ["Gita 2.47", "Gita on anger"],
    tint: "#F59E0B",
  },
  {
    glyph: "✦",
    title: "Tarot",
    tagline: "Draw and read cards",
    detail: "One card, or a past-present-future spread. Or look up any card.",
    examples: ["Pull 3 tarot cards", "What does The Star mean?"],
    tint: "#8B5CF6",
  },
  {
    glyph: "☉",
    title: "Your kundli",
    tagline: "Your birth chart",
    detail: "Calculated from your birth details, asked for once.",
    examples: ["What does my chart say about career?", "What is my rashi?"],
    tint: "#E11D48",
  },
  {
    glyph: "✋",
    title: "Palm reading",
    tagline: "Both hands",
    detail: "Reads photos of both palms, saved once in My details.",
    examples: ["Read my palm", "What does my heart line say?"],
    tint: "#0EA5E9",
  },
  {
    glyph: "❀",
    title: "Ayurveda",
    tagline: "Herbs and your dosha",
    detail:
      "358 herbs, herbs by dosha, and your prakriti from a 12-question quiz.",
    examples: ["What is Ashwagandha?", "What is my dosha?"],
    tint: "#16A34A",
  },
];

/** The empty-chat grid of Kosmik's engines. Tapping an example asks it. */
export function Engines({ onAsk }: { onAsk: (question: string) => void }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const [open, setOpen] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  // Five across on a wide screen; otherwise three over two, or two, two and one on a phone,
  // so every row is filled.
  const cols = width >= 900 ? 5 : width >= 520 ? 3 : 2;
  const widthOf = (i: number) => {
    if (!width) return undefined;
    const perRow =
      cols === 5 ? 5 : cols === 3 ? (i < 3 ? 3 : 2) : i < 4 ? 2 : 1;
    return (width - GAP * (perRow - 1)) / perRow;
  };
  return (
    <View style={s.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {ENGINES.map((e, i) => {
        return (
          <EngineCard
            key={e.title}
            engine={e}
            width={widthOf(i)}
            open={open === e.title}
            onOpen={(v) =>
              setOpen((cur) => (v ? e.title : cur === e.title ? null : cur))
            }
            onAsk={onAsk}
          />
        );
      })}
    </View>
  );
}

function EngineCard({
  engine: e,
  width,
  open,
  onOpen,
  onAsk,
}: {
  engine: Engine;
  width: number | undefined;
  open: boolean;
  onOpen: (open: boolean) => void;
  onAsk: (question: string) => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, {
      toValue: open ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [open, v]);
  const lift = v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
  const frontShift = v.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });
  const backShift = v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });

  return (
    <Animated.View style={{ width, transform: [{ translateY: lift }] }}>
      <View
        onPointerEnter={(ev) =>
          ev.nativeEvent.pointerType === "mouse" && onOpen(true)
        }
        onPointerLeave={(ev) =>
          ev.nativeEvent.pointerType === "mouse" && onOpen(false)
        }
        style={[
          s.card,
          open && {
            borderColor: e.tint,
            shadowColor: e.tint,
            shadowOpacity: 0.25,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 8 },
          },
        ]}
        testID="engine"
      >
        <View style={[s.glow, { backgroundColor: e.tint }]} />

        <Animated.View
          style={[
            s.face,
            {
              opacity: Animated.subtract(1, v),
              transform: [{ translateY: frontShift }],
            },
          ]}
          pointerEvents={open ? "none" : "auto"}
        >
          <Pressable
            onPress={() => onOpen(true)}
            onFocus={() => onOpen(true)}
            style={s.front}
            accessibilityRole="button"
            accessibilityLabel={`${e.title}: ${e.tagline}. Show examples`}
            accessibilityState={{ expanded: open }}
          >
            <View style={[s.badge, { backgroundColor: `${e.tint}22` }]}>
              <Text style={[s.glyph, { color: e.tint }]}>{e.glyph}</Text>
            </View>
            <View style={{ gap: 2 }}>
              <Text style={s.title}>{e.title}</Text>
              <Text style={s.tagline}>{e.tagline}</Text>
            </View>
          </Pressable>
        </Animated.View>

        <Animated.View
          style={[
            s.face,
            s.back,
            { opacity: v, transform: [{ translateY: backShift }] },
          ]}
          pointerEvents={open ? "auto" : "none"}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={[s.glyphSmall, { color: e.tint }]}>{e.glyph}</Text>
            <Text style={s.titleSmall}>{e.title}</Text>
          </View>
          <Text style={s.detail} numberOfLines={3}>
            {e.detail}
          </Text>
          <View style={s.chips}>
            {e.examples.map((q) => (
              <Chip key={q} q={q} tint={e.tint} onAsk={onAsk} />
            ))}
          </View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

function Chip({
  q,
  tint,
  onAsk,
}: {
  q: string;
  tint: string;
  onAsk: (q: string) => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      onPress={() => onAsk(q)}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[
        s.chip,
        hover && { borderColor: tint, backgroundColor: `${tint}1A` },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Ask: ${q}`}
    >
      <Text style={s.chipText} numberOfLines={1}>
        {q} ↗
      </Text>
    </Pressable>
  );
}

const GAP = 12;

const styles = (c: Colors) =>
  StyleSheet.create({
    grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
    card: {
      height: 188,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
      overflow: "hidden",
    },
    glow: {
      position: "absolute",
      width: 140,
      height: 140,
      borderRadius: 70,
      right: -50,
      top: -50,
      opacity: 0.12,
    },
    face: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      padding: 16,
      gap: 12,
    },
    back: { gap: 8 },
    front: { flex: 1, justifyContent: "space-between" },
    badge: {
      width: 48,
      height: 48,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    glyph: { fontFamily: font.verse, fontSize: 24 },
    glyphSmall: { fontFamily: font.verse, fontSize: 16 },
    title: { color: c.text, fontFamily: font.heavy, fontSize: 17 },
    titleSmall: { color: c.text, fontFamily: font.bold, fontSize: 14 },
    tagline: { color: c.muted, fontFamily: font.medium, fontSize: 13 },
    detail: {
      color: c.muted,
      fontFamily: font.body,
      fontSize: 13,
      lineHeight: 18,
    },
    chips: { gap: 6, marginTop: "auto" },
    chip: {
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 999,
      paddingHorizontal: 10,
      minHeight: 30,
      justifyContent: "center",
      backgroundColor: c.bg,
    },
    chipText: { color: c.text, fontFamily: font.semibold, fontSize: 12 },
  });
