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
import { track } from "../lib/analytics";
import { tr } from "../lib/i18n";

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
  e instanceof ApiError ? e.message : tr("Something went wrong. Please try again.");

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
      const r = await api.savePrakriti(answers as Choice[]);
      track("details/prakriti-saved");
      onSaved(r.prakriti);
    } catch (e) {
      setError(message(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <Text style={s.small}>
        {tr("Pick what has been true for most of your life, not just this week.")}
      </Text>
      {QUESTIONS.map(([q, options], i) => (
        <View
          key={q}
          style={{ gap: 6 }}
          accessibilityRole="radiogroup"
          accessibilityLabel={q}
        >
          <Text style={s.label}>
            {i + 1}. {tr(q)}
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
                <Text style={s.optionText}>{tr(o)}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
      <Text style={s.small}>
        {tr("Saved to your account so Kosmik can tailor Ayurveda answers. A self-assessment for reflection, not a diagnosis. Delete it any time in Account → My details.")}
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
              : tr("Save my prakriti")}
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
            <Text style={s.barLabel}>{tr(label)}</Text>
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

type Sign = "v" | "p" | "k" | "n";

/** Ten questions about the last few weeks. Options: balanced, then Vata, Pitta and Kapha signs. */
const VIKRITI_QUESTIONS: [string, [string, string, string, string]][] = [
  [
    "Appetite and digestion",
    [
      "Regular and comfortable",
      "Irregular; gas or bloating",
      "Very strong; acidity or burning if a meal is late",
      "Low; heavy and slow after meals",
    ],
  ],
  [
    "Bowel movements",
    [
      "Regular and easy",
      "Dry, hard or irregular",
      "Loose or frequent",
      "Sluggish, sticky or heavy",
    ],
  ],
  [
    "Sleep",
    [
      "Restful",
      "Light or broken; hard to fall asleep",
      "Waking hot or in the small hours; vivid dreams",
      "Too long, groggy on waking",
    ],
  ],
  [
    "Energy",
    [
      "Steady through the day",
      "Comes and goes; I tire quickly",
      "Driven, but close to burning out",
      "Low, heavy, unmotivated",
    ],
  ],
  [
    "Mind and mood",
    [
      "Calm and clear",
      "Anxious, worried or scattered",
      "Irritable, impatient or critical",
      "Dull, low or withdrawn",
    ],
  ],
  [
    "Skin",
    [
      "Normal",
      "Dry, rough or cracking",
      "Rashes, redness or acne",
      "Oily, puffy or congested",
    ],
  ],
  [
    "Body temperature",
    [
      "Comfortable",
      "Cold; cold hands and feet",
      "Hot; sweating more than usual",
      "Heavy and damp; chilly in damp weather",
    ],
  ],
  [
    "Body",
    [
      "Feels normal",
      "Stiffness, aches or cracking joints",
      "Heat, burning eyes or inflammation",
      "Mucus, congestion or water retention",
    ],
  ],
  [
    "Cravings",
    [
      "Nothing in particular",
      "Warm, salty or crunchy food",
      "Cold drinks and sweets",
      "Sweets, heavy or comfort food",
    ],
  ],
  [
    "Weight",
    ["Stable", "Losing weight", "Stable, but very thirsty", "Gaining weight"],
  ],
];
const SIGNS: Sign[] = ["n", "v", "p", "k"];

/** The vikriti check: the current state of the doshas and the agni. */
export function VikritiQuiz({ onSaved }: { onSaved: () => void }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const [answers, setAnswers] = useState<(Sign | null)[]>(
    VIKRITI_QUESTIONS.map(() => null),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = answers.filter(Boolean).length;
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.saveVikriti(answers as Sign[]);
      track("details/vikriti-saved");
      onSaved();
    } catch (e) {
      setError(message(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <View style={{ gap: 16 }}>
      <Text style={s.small}>
        {tr("Think only about the last two to four weeks, not your whole life.")}
      </Text>
      {VIKRITI_QUESTIONS.map(([q, options], i) => (
        <View
          key={q}
          style={{ gap: 6 }}
          accessibilityRole="radiogroup"
          accessibilityLabel={q}
        >
          <Text style={s.label}>
            {i + 1}. {tr(q)}
          </Text>
          {options.map((o, j) => {
            const selected = answers[i] === SIGNS[j];
            return (
              <Pressable
                key={o}
                onPress={() =>
                  setAnswers((a) => a.map((x, k) => (k === i ? SIGNS[j] : x)))
                }
                style={[s.option, selected && s.optionOn]}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={o}
              >
                <Text style={s.optionText}>{tr(o)}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
      <Text style={s.small}>
        {tr("Saved to your account. A self-assessment, not a diagnosis.")}
      </Text>
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Pressable
        onPress={save}
        disabled={done < VIKRITI_QUESTIONS.length || saving}
        style={[
          s.primary,
          (done < VIKRITI_QUESTIONS.length || saving) && { opacity: 0.4 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Save my vikriti"
      >
        {saving ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={s.primaryText}>
            {done < VIKRITI_QUESTIONS.length
              ? `${done} of ${VIKRITI_QUESTIONS.length} answered`
              : tr("Save my vikriti")}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
