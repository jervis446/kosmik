import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { api, ApiError, type Prakriti } from "../lib/api";
import { type Colors, font, useTheme } from "../lib/theme";

type Choice = "v" | "p" | "k";

/** Twelve questions about body and nature. Each option leans to Vata, Pitta or Kapha. */
const QUESTIONS: [string, [string, string, string]][] = [
  [
    "Body frame",
    [
      "Slim and light; I find it hard to gain weight",
      "Medium and muscular",
      "Broad and solid; I gain weight easily",
    ],
  ],
  [
    "Skin",
    [
      "Dry, rough or cool to touch",
      "Warm, sensitive, flushes easily",
      "Smooth, soft, slightly oily",
    ],
  ],
  [
    "Hair",
    [
      "Dry, frizzy or thin",
      "Fine and straight, greys or thins early",
      "Thick, wavy and glossy",
    ],
  ],
  [
    "Appetite",
    [
      "Irregular; I sometimes forget to eat",
      "Strong; I get irritable if a meal is late",
      "Steady; I can skip a meal easily",
    ],
  ],
  [
    "After a meal",
    [
      "It varies; sometimes bloated",
      "I digest fast and feel warm",
      "I feel heavy and slow for a while",
    ],
  ],
  [
    "Sleep",
    [
      "Light; I wake easily",
      "Moderate and sound",
      "Deep and long; hard to get up",
    ],
  ],
  [
    "Weather I like least",
    ["Cold and windy", "Hot and sunny", "Cold and damp"],
  ],
  [
    "Energy",
    [
      "Comes in bursts, then I tire",
      "Strong and focused",
      "Steady, slow to get going",
    ],
  ],
  [
    "Mind",
    [
      "Quick, restless, full of ideas",
      "Sharp, logical, goal-driven",
      "Calm, steady, methodical",
    ],
  ],
  [
    "Under stress I",
    [
      "Worry and feel anxious",
      "Get irritable or angry",
      "Go quiet and withdraw",
    ],
  ],
  [
    "Memory",
    [
      "Learn fast, forget fast",
      "Sharp and clear",
      "Slow to learn, never forget",
    ],
  ],
  [
    "Speech",
    ["Fast and talkative", "Precise and persuasive", "Slow, calm and measured"],
  ],
];
const CHOICES: Choice[] = ["v", "p", "k"];

const message = (e: unknown) =>
  e instanceof ApiError ? e.message : "Something went wrong. Please try again.";

/** The dosha quiz. Saves the answers; the server works out the prakriti. */
export function PrakritiQuiz({ onSaved }: { onSaved: (p: Prakriti) => void }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const [answers, setAnswers] = useState<(Choice | null)[]>(
    QUESTIONS.map(() => null),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = answers.filter(Boolean).length;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      onSaved((await api.savePrakriti(answers as Choice[])).prakriti);
    } catch (e) {
      setError(message(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <Text style={s.small}>
        Pick what has been true for most of your life, not just this week.
      </Text>
      {QUESTIONS.map(([q, options], i) => (
        <View
          key={q}
          style={{ gap: 6 }}
          accessibilityRole="radiogroup"
          accessibilityLabel={q}
        >
          <Text style={s.label}>
            {i + 1}. {q}
          </Text>
          {options.map((o, j) => {
            const selected = answers[i] === CHOICES[j];
            return (
              <Pressable
                key={o}
                onPress={() =>
                  setAnswers((a) => a.map((x, k) => (k === i ? CHOICES[j] : x)))
                }
                style={[s.option, selected && s.optionOn]}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={o}
              >
                <Text style={s.optionText}>{o}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
      <Text style={s.small}>
        Saved to your account so Kosmik can tailor Ayurveda answers. A
        self-assessment for reflection, not a diagnosis. Delete it any time in
        Account → My details.
      </Text>
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Pressable
        onPress={save}
        disabled={done < QUESTIONS.length || saving}
        style={[
          s.primary,
          (done < QUESTIONS.length || saving) && { opacity: 0.4 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Save my prakriti"
      >
        {saving ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={s.primaryText}>
            {done < QUESTIONS.length
              ? `${done} of ${QUESTIONS.length} answered`
              : "Save my prakriti"}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const DOSHA_LABEL: [
  keyof Pick<Prakriti, "vata" | "pitta" | "kapha">,
  string,
][] = [
  ["vata", "Vata (air, space)"],
  ["pitta", "Pitta (fire, water)"],
  ["kapha", "Kapha (earth, water)"],
];

/** Three bars, one per dosha. */
export function PrakritiBars({
  p,
}: {
  p: Pick<Prakriti, "vata" | "pitta" | "kapha">;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <View style={{ gap: 8 }}>
      {DOSHA_LABEL.map(([d, label]) => (
        <View key={d} style={{ gap: 4 }}>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Text style={s.barLabel}>{label}</Text>
            <Text style={s.barLabel}>{p[d]}%</Text>
          </View>
          <View
            style={s.track}
            accessibilityLabel={`${label}: ${p[d]} percent`}
          >
            <View style={[s.fill, { width: `${p[d]}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = (c: Colors) =>
  StyleSheet.create({
    small: {
      color: c.muted,
      fontFamily: font.body,
      fontSize: 13,
      lineHeight: 19,
    },
    label: { color: c.text, fontFamily: font.bold, fontSize: 15 },
    option: {
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 44,
      justifyContent: "center",
    },
    optionOn: { borderColor: c.primary, backgroundColor: c.primarySoft },
    optionText: { color: c.text, fontFamily: font.medium, fontSize: 14 },
    error: { color: c.danger, fontFamily: font.semibold, fontSize: 14 },
    primary: {
      backgroundColor: c.primary,
      borderRadius: 999,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 18,
    },
    primaryText: { color: c.onPrimary, fontFamily: font.bold, fontSize: 15 },
    barLabel: { color: c.text, fontFamily: font.medium, fontSize: 13 },
    track: {
      height: 8,
      borderRadius: 4,
      backgroundColor: c.surface2,
      overflow: "hidden",
    },
    fill: { height: 8, borderRadius: 4, backgroundColor: c.primary },
  });
