import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { font, useTheme } from "../lib/theme";

/** What Kosmik shows while it works: one Sanskrit word at a time, with its meaning. */
const WORDS = {
  ask: [
    ["मनन", "Manan", "reflecting"],
    ["अन्वेषण", "Anveshan", "searching the verses"],
    ["स्वाध्याय", "Swadhyay", "studying the texts"],
    ["चिन्तन", "Chintan", "contemplating"],
    ["विचार", "Vichaar", "weighing it up"],
    ["विवेक", "Vivek", "discerning"],
    ["स्मरण", "Smaran", "remembering"],
    ["ध्यान", "Dhyan", "focusing"],
  ],
  palm: [
    ["दर्शन", "Darshan", "looking closely"],
    ["रेखा विचार", "Rekha vichaar", "reading the lines"],
    ["हस्त परीक्षा", "Hast pariksha", "studying your hand"],
    ["मनन", "Manan", "reflecting"],
  ],
} as const;
const STEP_MS = 1800;

export function Thinking({ kind = "ask" }: { kind?: keyof typeof WORDS }) {
  const { colors } = useTheme();
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => n + 1), STEP_MS);
    return () => clearInterval(t);
  }, []);
  const [deva, latin, meaning] = WORDS[kind][i % WORDS[kind].length];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 4,
      }}
      accessibilityLiveRegion="polite"
      testID="thinking"
    >
      <ActivityIndicator color={colors.accent} />
      <Text
        style={{ color: colors.text, fontFamily: font.verse, fontSize: 17 }}
      >
        {deva}
      </Text>
      <Text
        style={{ color: colors.muted, fontFamily: font.medium, fontSize: 14 }}
      >
        {latin}… <Text style={{ fontFamily: font.body }}>{meaning}</Text>
      </Text>
    </View>
  );
}
