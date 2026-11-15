import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { font, useTheme } from "../lib/theme";

/** A Sanskrit word for the mood, with its meaning. */
const WORDS = {
  ask: [
    ["मनन", "Manan", "reflecting"],
    ["अन्वेषण", "Anveshan", "searching"],
    ["स्वाध्याय", "Swadhyay", "studying the texts"],
    ["चिन्तन", "Chintan", "contemplating"],
    ["विचार", "Vichaar", "weighing it up"],
    ["विवेक", "Vivek", "discerning"],
  ],
  palm: [
    ["दर्शन", "Darshan", "looking closely"],
    ["रेखा विचार", "Rekha vichaar", "reading the lines"],
    ["हस्त परीक्षा", "Hast pariksha", "studying your hand"],
  ],
} as const;

const TOPICS: [RegExp, string, string][] = [
  [
    /career|job|naukri|work|business|startup|promotion|kaam/i,
    "10th house",
    "career",
  ],
  [
    /marri|shaadi|shadi|vivah|spouse|partner|love|relationship|pyaar/i,
    "7th house",
    "partnership",
  ],
  [
    /money|paisa|paise|wealth|finance|dhan|income|invest/i,
    "2nd and 11th houses",
    "money",
  ],
  [
    /study|studies|padhai|exam|education|college/i,
    "4th and 5th houses",
    "learning",
  ],
  [/health|sehat|body/i, "6th house", "well-being"],
  [/child|baby|santan|kids/i, "5th house", "children"],
];

/** The steps shown while Kosmik works, picked from what was asked. */
export function stepsFor(question: string, kind: "ask" | "palm"): string[] {
  const q = question.toLowerCase();
  if (kind === "palm")
    return [
      "Looking at both palms",
      "Tracing the heart, head and life lines",
      "Writing your reading",
    ];
  const personal = /\b(my|mera|meri|mere|mujhe|i|me)\b/.test(q);
  const astro =
    /kundli|kundali|chart|horoscope|dasha|rashi|nakshatra|lagna|planet|graha|saturn|shani|rahu|ketu|jupiter|guru|transit|when will|kab/.test(
      q,
    );
  const topic = TOPICS.find(([re]) => re.test(q));
  if (personal && (astro || topic)) {
    return [
      "Reading your birth chart",
      topic
        ? `Checking your ${topic[1]} of ${topic[2]}`
        : "Finding the houses that matter",
      "Lining up your dasha periods",
      "Laying the coming months side by side",
    ];
  }
  if (/dosha|prakriti|ayurved|herb|jadi|vata|pitta|kapha|diet/.test(q)) {
    return [
      "Opening the herb library",
      "Checking doshas and classical properties",
      "Writing your answer",
    ];
  }
  if (/gita|geeta|krishna|arjun|verse|shlok/.test(q) || !astro) {
    return [
      "Searching the Gita and the library",
      "Choosing what fits your question",
      "Writing your answer",
    ];
  }
  return [
    "Checking the astrology library",
    "Choosing what fits your question",
    "Writing your answer",
  ];
}

const STEP_MS = 1600;

export function Thinking({
  kind = "ask",
  question = "",
}: {
  kind?: keyof typeof WORDS;
  question?: string;
}) {
  const { colors } = useTheme();
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => n + 1), STEP_MS);
    return () => clearInterval(t);
  }, []);
  const [deva, latin, meaning] = WORDS[kind][i % WORDS[kind].length];
  const steps = stepsFor(question, kind);
  const shown = Math.min(steps.length, i + 1);
  return (
    <View
      style={{ gap: 8, paddingVertical: 4, flex: 1 }}
      accessibilityLiveRegion="polite"
      testID="thinking"
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <ActivityIndicator color={colors.primary} />
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
      {steps.slice(0, shown).map((step, n) => (
        <Text
          key={step}
          style={{
            color: n === shown - 1 ? colors.text : colors.muted,
            fontFamily: font.body,
            fontSize: 15,
          }}
        >
          {n < shown - 1 ? "✓ " : "· "}
          {step}
        </Text>
      ))}
      <View
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: colors.primarySoft,
          overflow: "hidden",
          maxWidth: 420,
        }}
      >
        <View
          style={{
            width: `${Math.min(92, 18 + i * 9)}%`,
            height: 6,
            borderRadius: 3,
            backgroundColor: colors.primary,
          }}
        />
      </View>
    </View>
  );
}
