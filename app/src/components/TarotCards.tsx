import { useEffect, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
} from "react-native-svg";

import { type Colors, font, useTheme } from "../lib/theme";

export type TarotCardData = {
  key: string;
  name: string;
  reversed: boolean;
  position: string;
  meaning: string;
  reading?: string;
  arcana?: "major" | "minor";
  number?: number;
  suit?: string;
};

const GOLD = "#D9B26A";
const ROMAN = [
  "0",
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
  "XIII",
  "XIV",
  "XV",
  "XVI",
  "XVII",
  "XVIII",
  "XIX",
  "XX",
  "XXI",
];
/** A symbol for each Major Arcana card (text style, not emoji). */
const MAJOR_GLYPH: Record<string, string> = {
  "the-fool": "✧",
  "the-magician": "∞",
  "the-high-priestess": "☾",
  "the-empress": "♀",
  "the-emperor": "♔",
  "the-hierophant": "✠",
  "the-lovers": "♡",
  "the-chariot": "✶",
  strength: "♌",
  "the-hermit": "✷",
  "wheel-of-fortune": "☸",
  justice: "⚖",
  "the-hanged-man": "⟟",
  death: "✝",
  temperance: "⧖",
  "the-devil": "♄",
  "the-tower": "♜",
  "the-star": "★",
  "the-moon": "☽",
  "the-sun": "☼",
  judgement: "♪",
  "the-world": "◎",
};
const SUIT_TINT: Record<string, [string, string]> = {
  Wands: ["#7A2E12", "#C2622A"],
  Cups: ["#12385E", "#2F79B5"],
  Swords: ["#2E2A4A", "#6F6A9E"],
  Pentacles: ["#2F4A1E", "#7A9A3A"],
  major: ["#3A1036", "#8E2F63"],
};
const RANK_SHORT: Record<string, string> = {
  Ace: "A",
  Two: "II",
  Three: "III",
  Four: "IV",
  Five: "V",
  Six: "VI",
  Seven: "VII",
  Eight: "VIII",
  Nine: "IX",
  Ten: "X",
  Page: "P",
  Knight: "Kn",
  Queen: "Q",
  King: "K",
};

/** The suit emblem, drawn in gold. */
function Emblem({ suit, size }: { suit: string; size: number }) {
  const s = {
    stroke: GOLD,
    strokeWidth: 2.2,
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {suit === "Wands" ? (
        <G {...s}>
          <Line x1="14" y1="40" x2="34" y2="8" />
          <Path d="M27 16c4-3 8-2 9 1-4 1-7 1-9-1zM23 23c-4-3-8-2-9 1 4 1 7 1 9-1zM30 12c2-4 6-5 8-3-2 3-5 4-8 3z" />
        </G>
      ) : suit === "Cups" ? (
        <G {...s}>
          <Path d="M12 9h24c0 10-5 16-12 16S12 19 12 9z" />
          <Line x1="24" y1="25" x2="24" y2="35" />
          <Path d="M16 39h16M18 35h12" />
        </G>
      ) : suit === "Swords" ? (
        <G {...s}>
          <Path d="M24 4l3 6v20h-6V10z" />
          <Line x1="15" y1="31" x2="33" y2="31" />
          <Line x1="24" y1="31" x2="24" y2="40" />
          <Circle cx="24" cy="42" r="2" />
        </G>
      ) : (
        <G {...s}>
          <Circle cx="24" cy="24" r="17" />
          <Polygon points="24,9 28.5,38 6,20 42,20 19.5,38" />
        </G>
      )}
    </Svg>
  );
}

/** The back of a card: plum with a gold sun-and-star pattern. */
export function CardBack({ width }: { width: number }) {
  const height = width * 1.65;
  return (
    <Svg width={width} height={height} viewBox="0 0 100 165">
      <Defs>
        <LinearGradient id="kb" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#3A1036" />
          <Stop offset="1" stopColor="#14081A" />
        </LinearGradient>
      </Defs>
      <Rect
        x="0.5"
        y="0.5"
        width="99"
        height="164"
        rx="8"
        fill="url(#kb)"
        stroke={GOLD}
        strokeWidth="1"
      />
      <Rect
        x="5"
        y="5"
        width="90"
        height="155"
        rx="5"
        fill="none"
        stroke={GOLD}
        strokeWidth="0.6"
        opacity="0.8"
      />
      <Rect
        x="8"
        y="8"
        width="84"
        height="149"
        rx="4"
        fill="none"
        stroke={GOLD}
        strokeWidth="0.3"
        opacity="0.6"
      />
      <G opacity="0.9">
        <Circle
          cx="50"
          cy="82.5"
          r="26"
          fill="none"
          stroke={GOLD}
          strokeWidth="0.8"
        />
        <Circle
          cx="50"
          cy="82.5"
          r="19"
          fill="none"
          stroke={GOLD}
          strokeWidth="0.4"
        />
        <Polygon
          points="50,60 54,78 72,82.5 54,87 50,105 46,87 28,82.5 46,78"
          fill={GOLD}
          opacity="0.9"
        />
        <Polygon
          points="50,68 52.5,80 64,82.5 52.5,85 50,97 47.5,85 36,82.5 47.5,80"
          fill="#3A1036"
        />
        {[...Array(16)].map((_, i) => {
          const a = (i * Math.PI) / 8;
          return (
            <Circle
              key={i}
              cx={50 + Math.cos(a) * 32}
              cy={82.5 + Math.sin(a) * 32}
              r="0.9"
              fill={GOLD}
            />
          );
        })}
        <Path d="M50 22a9 9 0 1 0 6 15 7 7 0 1 1-6-15z" fill={GOLD} />
        <Path d="M50 143a9 9 0 1 1-6-15 7 7 0 1 0 6 15z" fill={GOLD} />
        {[
          [20, 25],
          [80, 25],
          [20, 140],
          [80, 140],
        ].map(([x, y]) => (
          <Polygon
            key={`${x}${y}`}
            points={`${x},${y - 3} ${x + 1},${y - 1} ${x + 3},${y} ${x + 1},${y + 1} ${x},${y + 3} ${x - 1},${y + 1} ${x - 3},${y} ${x - 1},${y - 1}`}
            fill={GOLD}
          />
        ))}
      </G>
    </Svg>
  );
}

/** The face of a card: ivory, gold frame, numeral, emblem panel and name banner. */
export function CardFace({
  card,
  width,
}: {
  card: TarotCardData;
  width: number;
}) {
  const height = width * 1.65;
  const major =
    card.arcana === "major" || (!card.suit && card.number !== undefined);
  const tint =
    SUIT_TINT[major ? "major" : (card.suit ?? "major")] ?? SUIT_TINT.major;
  const numeral = major
    ? ROMAN[card.number ?? 0]
    : (RANK_SHORT[card.name.split(" ")[0]] ?? "");
  const k = width / 100;
  return (
    <View
      style={{
        width,
        height,
        transform: card.reversed ? [{ rotate: "180deg" }] : [],
      }}
    >
      <Svg
        width={width}
        height={height}
        viewBox="0 0 100 165"
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <LinearGradient id={`kp${card.key}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={tint[1]} />
            <Stop offset="1" stopColor={tint[0]} />
          </LinearGradient>
        </Defs>
        <Rect
          x="0.5"
          y="0.5"
          width="99"
          height="164"
          rx="8"
          fill="#F6EEDC"
          stroke={GOLD}
          strokeWidth="1"
        />
        <Rect
          x="5"
          y="5"
          width="90"
          height="155"
          rx="5"
          fill="none"
          stroke="#B08A45"
          strokeWidth="0.7"
        />
        <Path
          d="M14 30 Q14 18 50 18 Q86 18 86 30 L86 128 L14 128 Z"
          fill={`url(#kp${card.key})`}
          stroke={GOLD}
          strokeWidth="0.8"
        />
        {[...Array(12)].map((_, i) => {
          const a = Math.PI + (i * Math.PI) / 11;
          return (
            <Line
              key={i}
              x1={50 + Math.cos(a) * 18}
              y1={74 + Math.sin(a) * 18}
              x2={50 + Math.cos(a) * 30}
              y2={74 + Math.sin(a) * 30}
              stroke={GOLD}
              strokeWidth="0.4"
              opacity="0.7"
            />
          );
        })}
        <Rect
          x="10"
          y="133"
          width="80"
          height="22"
          rx="3"
          fill="#FFFDF7"
          stroke={GOLD}
          strokeWidth="0.6"
        />
      </Svg>
      <Text style={[styles.numeral, { top: 6 * k, fontSize: 11 * k }]}>
        {numeral}
      </Text>
      <View style={[styles.emblem, { top: 40 * k, height: 70 * k }]}>
        {major ? (
          <Text style={{ color: GOLD, fontSize: 40 * k, lineHeight: 48 * k }}>
            {(MAJOR_GLYPH[card.key] ?? "✦") + "︎"}
          </Text>
        ) : (
          <Emblem suit={card.suit ?? "Pentacles"} size={46 * k} />
        )}
      </View>
      <Text
        numberOfLines={2}
        style={[
          styles.cardName,
          {
            top: 135 * k,
            height: 18 * k,
            fontSize: (card.name.length > 16 ? 7.6 : 9) * k,
            lineHeight: 9 * k,
          },
        ]}
      >
        {card.name.toUpperCase()}
      </Text>
    </View>
  );
}

/** Face-down cards fanned out; the person picks one (or three). */
export function TarotPick({
  count,
  onPick,
  disabled,
}: {
  count: 1 | 3;
  onPick: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const s = picker(colors);
  const total = count === 1 ? 3 : 7;
  const [chosen, setChosen] = useState<number[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const [float] = useState(() => new Animated.Value(0));
  const done = chosen.length === count;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float]);
  const width = count === 1 ? 104 : 78;
  const pick = (i: number) => {
    if (disabled || done || chosen.includes(i)) return;
    const next = [...chosen, i];
    setChosen(next);
    if (next.length === count) setTimeout(onPick, 650);
  };
  return (
    <View style={{ gap: 10 }} testID="tarot-pick">
      <View style={[s.fan, count === 3 && { gap: 0 }]}>
        {[...Array(total)].map((_, i) => {
          const picked = chosen.indexOf(i);
          const mid = (total - 1) / 2;
          const tilt = (i - mid) * (count === 1 ? 7 : 4);
          const bob = float.interpolate({
            inputRange: [0, 1],
            outputRange: [0, i % 2 ? -5 : 5],
          });
          const lift = picked >= 0 ? -26 : hover === i && !done ? -12 : 0;
          return (
            <Animated.View
              key={i}
              style={{
                marginHorizontal: count === 3 ? -6 : 6,
                zIndex: picked >= 0 ? 20 : hover === i ? 10 : 1,
                opacity: done && picked < 0 ? 0.25 : 1,
                transform: [
                  { translateY: Animated.add(bob, new Animated.Value(lift)) },
                  { rotate: `${tilt}deg` },
                  { scale: picked >= 0 ? 1.08 : 1 },
                ],
              }}
            >
              <Pressable
                onPress={() => pick(i)}
                onHoverIn={() => setHover(i)}
                onHoverOut={() => setHover(null)}
                disabled={disabled || done}
                accessibilityRole="button"
                accessibilityLabel={`Card ${i + 1}, face down`}
                style={[
                  s.cardShadow,
                  (picked >= 0 || hover === i) && {
                    shadowColor: GOLD,
                    shadowOpacity: 0.55,
                    shadowRadius: 18,
                  },
                ]}
              >
                <CardBack width={width} />
                {picked >= 0 && count === 3 ? (
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{picked + 1}</Text>
                  </View>
                ) : null}
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
      <Text style={s.hint}>
        {done
          ? "Turning your card over…"
          : count === 1
            ? "Tap the card that calls to you"
            : `Pick ${3 - chosen.length} more · in order: past, present, future`}
      </Text>
    </View>
  );
}

/** A picked card turning over, then its reading. */
function FlipCard({
  card,
  width,
  delay,
}: {
  card: TarotCardData;
  width: number;
  delay: number;
}) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 900,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [v, delay]);
  const back = v.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });
  const front = v.interpolate({
    inputRange: [0, 1],
    outputRange: ["180deg", "360deg"],
  });
  const face = {
    position: "absolute" as const,
    top: 0,
    left: 0,
    backfaceVisibility: "hidden" as const,
  };
  return (
    <View style={{ width, height: width * 1.65 }}>
      <Animated.View
        style={[face, { transform: [{ perspective: 800 }, { rotateY: back }] }]}
      >
        <CardBack width={width} />
      </Animated.View>
      <Animated.View
        style={[
          face,
          { transform: [{ perspective: 800 }, { rotateY: front }] },
        ]}
      >
        <CardFace card={card} width={width} />
      </Animated.View>
    </View>
  );
}

/** The revealed spread with each card's reading. */
export function TarotReveal({
  cards,
  advice,
}: {
  cards: TarotCardData[];
  advice?: string;
}) {
  const { colors } = useTheme();
  const s = picker(colors);
  const width = cards.length === 1 ? 150 : 112;
  return (
    <View style={{ gap: 14 }} testID="tarot">
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 16,
          justifyContent: cards.length === 1 ? "flex-start" : "space-between",
        }}
      >
        {cards.map((c, i) => (
          <View
            key={c.key + i}
            style={{
              gap: 8,
              flexBasis: cards.length === 1 ? undefined : 200,
              flexGrow: cards.length === 1 ? 0 : 1,
              flexDirection: cards.length === 1 ? "row" : "column",
              alignItems: cards.length === 1 ? "flex-start" : "center",
              maxWidth: cards.length === 1 ? 640 : undefined,
            }}
          >
            <View style={s.cardShadow}>
              <FlipCard card={c} width={width} delay={300 + i * 450} />
            </View>
            <View
              style={{
                flex: cards.length === 1 ? 1 : undefined,
                gap: 4,
                paddingLeft: cards.length === 1 ? 16 : 0,
              }}
            >
              <Text style={s.mono}>{c.position.toUpperCase()}</Text>
              <Text style={s.name}>
                {c.name}
                {c.reversed ? (
                  <Text style={{ color: colors.accent }}> · reversed</Text>
                ) : null}
              </Text>
              <Text style={s.reading}>{c.reading ?? c.meaning}</Text>
            </View>
          </View>
        ))}
      </View>
      {advice ? (
        <View style={s.advice}>
          <Text style={s.mono}>THIS WEEK</Text>
          <Text style={s.reading}>{advice}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  numeral: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#6B4A1E",
    fontFamily: font.display,
    letterSpacing: 1,
  },
  emblem: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  cardName: {
    position: "absolute",
    left: "12%",
    right: "12%",
    textAlign: "center",
    color: "#3A1036",
    fontFamily: font.display,
    letterSpacing: 0.6,
  },
});

const picker = (c: Colors) =>
  StyleSheet.create({
    fan: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "flex-end",
      paddingTop: 30,
      paddingBottom: 8,
      flexWrap: "nowrap",
    },
    cardShadow: {
      borderRadius: 10,
      shadowColor: "#000",
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
    },
    badge: {
      position: "absolute",
      top: -10,
      right: -6,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: GOLD,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: { color: "#3A1036", fontFamily: font.bold, fontSize: 12 },
    hint: {
      color: c.muted,
      fontFamily: font.mono,
      fontSize: 11,
      letterSpacing: 2,
      textAlign: "center",
    },
    mono: {
      color: c.muted,
      fontFamily: font.mono,
      fontSize: 11,
      letterSpacing: 2,
    },
    name: { color: c.text, fontFamily: font.display, fontSize: 20 },
    reading: {
      color: c.text,
      fontFamily: font.body,
      fontSize: 15,
      lineHeight: 23,
    },
    advice: {
      gap: 4,
      padding: 12,
      borderRadius: 14,
      backgroundColor: c.primarySoft,
      borderLeftWidth: 3,
      borderLeftColor: GOLD,
    },
  });
