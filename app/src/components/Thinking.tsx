import { useEffect, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";

import { font, useTheme } from "../lib/theme";
import { Logo } from "./Logo";

/** A Sanskrit word for the mood, with a GenZ line. */
const WORDS = {
  ask: [
    ["मनन", "Manan", "letting it sink in"],
    ["अन्वेषण", "Anveshan", "digging through the cosmos"],
    ["स्वाध्याय", "Swadhyay", "speed-reading the shastras"],
    ["चिन्तन", "Chintan", "vibing with your question"],
    ["विचार", "Vichaar", "connecting the dots"],
    ["विवेक", "Vivek", "keeping it real"],
  ],
  palm: [
    ["दर्शन", "Darshan", "zooming into your palm"],
    ["रेखा विचार", "Rekha vichaar", "tracing every line"],
    ["हस्त परीक्षा", "Hast pariksha", "decoding your hand"],
  ],
} as const;

const WORD_MS = 1800;

export function Thinking({
  kind = "ask",
}: {
  kind?: keyof typeof WORDS;
  question?: string;
}) {
  const { colors } = useTheme();
  const [i, setI] = useState(0);
  const [spin] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const t = setInterval(() => setI((n) => n + 1), WORD_MS);
    const a = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true }),
    );
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    a.start();
    b.start();
    return () => {
      clearInterval(t);
      a.stop();
      b.stop();
    };
  }, [spin, pulse]);
  const [deva, latin, meaning] = WORDS[kind][i % WORDS[kind].length];
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.06] });
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] });
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 4, flex: 1 }}
      accessibilityLiveRegion="polite"
      testID="thinking"
    >
      <View style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
        <Animated.View
          style={{
            position: "absolute",
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: colors.primary,
            opacity: glow,
            transform: [{ scale }],
          }}
        />
        <Animated.View style={{ position: "absolute", width: 44, height: 44, transform: [{ rotate }] }}>
          <View style={{ position: "absolute", top: -2, left: 19, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.highlight }} />
          <View style={{ position: "absolute", bottom: 2, right: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent }} />
        </Animated.View>
        <Animated.View style={{ transform: [{ scale }] }}>
          <Logo size={30} />
        </Animated.View>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.text, fontFamily: font.verse, fontSize: 18 }}>
          {deva}{" "}
          <Text style={{ color: colors.muted, fontFamily: font.mono, fontSize: 12, letterSpacing: 1 }}>
            {latin.toUpperCase()}
          </Text>
        </Text>
        <Text style={{ color: colors.muted, fontFamily: font.body, fontSize: 14 }}>
          {meaning}…
        </Text>
      </View>
    </View>
  );
}
