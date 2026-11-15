import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { track } from "../lib/analytics";
import {
  api,
  ApiError,
  type Gender,
  type Place,
  type Snapshot,
} from "../lib/api";
import { type Colors, font, useTheme } from "../lib/theme";
import { Logo } from "./Logo";
import { PhoneForm } from "./PhoneGate";

type Step = "phone" | "about" | "birth" | "snapshot";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const pad = (n: number) => String(n).padStart(2, "0");
const message = (e: unknown) =>
  e instanceof ApiError || e instanceof Error
    ? e.message
    : "Something went wrong. Please try again.";

/**
 * The first-run journey after sign-in: WhatsApp number (when required), a little about you,
 * birth details, then a snapshot of your chart and your first question.
 */
export function Onboarding({
  visible,
  needPhone,
  onPhoneVerified,
  onClose,
  onSignOut,
  onAsk,
}: {
  visible: boolean;
  needPhone: boolean;
  onPhoneVerified: () => void;
  /** Closing is allowed once the number is verified. */
  onClose: () => void;
  onSignOut: () => void;
  onAsk: (question: string) => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  // Fixed when the journey opens, so verifying the number doesn't renumber the steps.
  const [withPhone] = useState(needPhone);
  const steps: Step[] = withPhone
    ? ["phone", "about", "birth", "snapshot"]
    : ["about", "birth", "snapshot"];
  const [step, setStep] = useState<Step>(steps[0]);
  const [phoneDone, setPhoneDone] = useState(!withPhone);
  const at = steps.indexOf(step);
  useEffect(() => {
    if (visible) track(`onboarding/${step}`);
  }, [visible, step]);

  // About you
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  // Snapshot
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [first, setFirst] = useState("");

  const HEAD: Record<Step, [string, string, string]> = {
    phone: [
      "Verify",
      "Your WhatsApp number",
      "A 6-digit code keeps one free account per person.",
    ],
    about: [
      "About you",
      "A little about you",
      "So Kosmik knows how to talk to you.",
    ],
    birth: [
      "Birth details",
      "Your birth details",
      "Your chart is drawn from the exact moment and place you were born.",
    ],
    snapshot: [
      "Snapshot",
      "Your cosmic snapshot",
      snap?.name
        ? `Drawn from the moment you just gave us, ${snap.name}.`
        : "Drawn from the moment you just gave us.",
    ],
  };
  const [label, title, sub] = HEAD[step];

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.backdrop}>
        <View
          style={[s.frame, wide && { flexDirection: "row" }]}
          accessibilityViewIsModal
          testID="onboarding"
        >
          {wide ? (
            <View style={s.side}>
              <View style={s.brandRow}>
                <Logo size={40} />
                <Text style={s.brand}>Kosmik</Text>
              </View>
              <Text style={s.sideTitle}>
                {step === "snapshot" ? "Your sky, " : "Read the sky "}
                <Text style={{ color: colors.highlight }}>
                  {step === "snapshot"
                    ? "now part of every answer"
                    : "you were born under"}
                </Text>
              </Text>
              <View style={{ flex: 1 }} />
              {[
                "Your details stay private to you",
                "Kosmik remembers every chat",
                "Gita, tarot and herbs are always free",
              ].map((t) => (
                <View key={t} style={{ flexDirection: "row", gap: 10 }}>
                  <Text style={{ color: colors.success }}>✓</Text>
                  <Text style={s.sideItem}>{t}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.main}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.topRow}>
              {at > 0 && step !== "snapshot" && !(steps[at - 1] === "phone") ? (
                <Pressable
                  onPress={() => setStep(steps[at - 1])}
                  accessibilityRole="button"
                >
                  <Text style={s.mono}>← BACK</Text>
                </Pressable>
              ) : (
                <View />
              )}
              {phoneDone ? (
                <Pressable
                  onPress={onClose}
                  style={s.close}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={{ gap: 10 }}>
              <View style={s.row}>
                <Text style={s.mono}>{label.toUpperCase()}</Text>
                <Text style={s.mono}>
                  STEP {at + 1} OF {steps.length}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {steps.map((x, i) => (
                  <View
                    key={x}
                    style={[
                      s.seg,
                      i <= at && { backgroundColor: colors.primary },
                    ]}
                  />
                ))}
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={s.title} role="heading">
                {title}
              </Text>
              <Text style={s.sub}>{sub}</Text>
            </View>

            {step === "phone" ? (
              <PhoneForm
                onDone={() => {
                  setPhoneDone(true);
                  onPhoneVerified();
                  setStep("about");
                }}
              />
            ) : null}

            {step === "about" ? (
              <View style={{ gap: 18 }}>
                <View style={{ gap: 8 }}>
                  <Text style={s.mono}>NAME</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="What should Kosmik call you?"
                    placeholderTextColor={colors.muted}
                    style={s.input}
                    maxLength={80}
                    autoComplete="name"
                    accessibilityLabel="Your name"
                  />
                </View>
                <View style={{ gap: 8 }}>
                  <Text style={s.mono}>GENDER</Text>
                  <View
                    style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}
                  >
                    {(["female", "male", "other"] as Gender[]).map((g) => (
                      <Pressable
                        key={g}
                        onPress={() => setGender(g)}
                        style={[s.pill, gender === g && s.pillOn]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: gender === g }}
                      >
                        <Text
                          style={[
                            s.pillText,
                            gender === g && { color: colors.highlight },
                          ]}
                        >
                          {g[0].toUpperCase() + g.slice(1)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <Primary
                  label="Continue"
                  disabled={!name.trim()}
                  onPress={() => setStep("birth")}
                />
                <Text style={[s.mono, { textAlign: "center" }]}>
                  ● YOU CAN CHANGE THIS LATER
                </Text>
              </View>
            ) : null}

            {step === "birth" ? (
              <BirthStep
                name={name.trim()}
                gender={gender}
                onSaved={() =>
                  api
                    .snapshot()
                    .then((x) => {
                      setSnap(x);
                      setStep("snapshot");
                    })
                    .catch(() => setStep("snapshot"))
                }
              />
            ) : null}

            {step === "snapshot" ? (
              <View style={{ gap: 14 }}>
                {snap?.lines.map((l) => (
                  <View key={l.kind} style={s.snapCard} testID="snapshot-line">
                    <View style={s.snapIcon}>
                      <Text style={{ color: colors.highlight, fontSize: 18 }}>
                        {l.kind === "mind"
                          ? "☾"
                          : l.kind === "work"
                            ? "☉"
                            : "⇡"}
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 8,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <Text style={s.snapTitle}>{l.title}</Text>
                        <Text style={s.tag}>{l.tag.toUpperCase()}</Text>
                      </View>
                      <Text style={s.sub}>{l.text}</Text>
                    </View>
                  </View>
                )) ?? <ActivityIndicator color={colors.primary} />}
                {snap?.western ? (
                  <View style={s.snapCard} testID="snapshot-western">
                    <View style={s.snapIcon}>
                      <Text style={{ color: colors.highlight, fontSize: 18 }}>
                        ✧
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 8,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <Text style={s.snapTitle}>Your Western big three</Text>
                        <Text style={s.tag}>TROPICAL</Text>
                      </View>
                      <Text style={[s.sub, { color: colors.text }]}>
                        Sun {snap.western.sun} · Moon {snap.western.moon}
                        {snap.western.rising
                          ? ` · Rising ${snap.western.rising}`
                          : ""}
                      </Text>
                      <Text style={s.sub}>
                        Next solar return: {snap.western.solarReturn}
                        {snap.western.cusp
                          ? ` · born on the ${snap.western.cusp}`
                          : ""}
                      </Text>
                    </View>
                  </View>
                ) : null}
                {snap?.dasha ? (
                  <Text style={s.sub}>
                    Running dasha:{" "}
                    <Text style={{ color: colors.highlight }}>
                      {snap.dasha}
                    </Text>
                  </Text>
                ) : null}
                <Text style={[s.mono, { marginTop: 6 }]}>
                  YOUR FIRST QUESTION
                </Text>
                <View style={s.askRow}>
                  <TextInput
                    value={first}
                    onChangeText={setFirst}
                    placeholder="e.g. Should I switch jobs this year?"
                    placeholderTextColor={colors.muted}
                    style={[s.input, { flex: 1, borderWidth: 0 }]}
                    onSubmitEditing={() => first.trim() && onAsk(first.trim())}
                    accessibilityLabel="Your first question"
                  />
                  <Pressable
                    onPress={() => first.trim() && onAsk(first.trim())}
                    disabled={!first.trim()}
                    style={[s.send, !first.trim() && { opacity: 0.4 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Ask"
                  >
                    <Text style={{ color: colors.onPrimary, fontSize: 18 }}>
                      ↑
                    </Text>
                  </Pressable>
                </View>
                <Pressable onPress={onClose} accessibilityRole="button">
                  <Text style={[s.mono, { textAlign: "center" }]}>
                    MAYBE LATER · TAKE ME IN
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {!phoneDone ? (
              <Pressable onPress={onSignOut} accessibilityRole="button">
                <Text
                  style={[
                    s.mono,
                    { textAlign: "center", textDecorationLine: "underline" },
                  ]}
                >
                  SIGN OUT
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Primary({
  label,
  onPress,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={[s.primary, (disabled || busy) && { opacity: 0.45 }]}
      accessibilityRole="button"
    >
      {busy ? (
        <ActivityIndicator color={colors.onPrimary} />
      ) : (
        <Text style={s.primaryText}>{label}</Text>
      )}
    </Pressable>
  );
}

/** A tappable column of values, like a wheel. */
function Column({
  items,
  value,
  onPick,
  label,
}: {
  items: { v: number | string; t: string }[];
  value: number | string | null;
  onPick: (v: number | string) => void;
  label: string;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <ScrollView
      style={s.column}
      contentContainerStyle={{ gap: 4, paddingVertical: 4 }}
      accessibilityLabel={label}
      nestedScrollEnabled
    >
      {items.map((i) => (
        <Pressable
          key={String(i.v)}
          onPress={() => onPick(i.v)}
          style={[s.cell, value === i.v && s.cellOn]}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === i.v }}
          accessibilityLabel={`${label} ${i.t}`}
        >
          <Text
            style={[s.cellText, value === i.v && { color: colors.onPrimary }]}
          >
            {i.t}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function BirthStep({
  name,
  gender,
  onSaved,
}: {
  name: string;
  gender: Gender | null;
  onSaved: () => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const thisYear = new Date().getFullYear();
  const [open, setOpen] = useState<"date" | "time" | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [hour, setHour] = useState<number | null>(null);
  const [minute, setMinute] = useState<number | null>(null);
  const [ampm, setAmpm] = useState<"AM" | "PM">("AM");
  const [noTime, setNoTime] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [tz, setTz] = useState(330);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateOk = day && month && year;
  const timeOk = noTime || (hour !== null && minute !== null);
  const dateText = dateOk ? `${day} ${MONTHS[month - 1]} ${year}` : "";
  const timeText =
    hour !== null && minute !== null
      ? `${pad(hour)}:${pad(minute)} ${ampm}`
      : "";

  const search = async () => {
    if (query.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      setResults((await api.places(query)).places);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!dateOk || !timeOk || !place) return;
    const h24 = hour === null ? 0 : (hour % 12) + (ampm === "PM" ? 12 : 0);
    setBusy(true);
    setError(null);
    try {
      await api.saveProfile({
        name: name || null,
        gender,
        birthDate: `${year}-${pad(month)}-${pad(day)}`,
        birthTime: noTime ? null : `${pad(h24)}:${pad(minute ?? 0)}`,
        place: place.name,
        lat: place.lat,
        lon: place.lon,
        tzOffsetMin: place.tzOffsetMin ?? tz,
      });
      track("details/birth-saved");
      onSaved();
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
        <View style={{ flex: 1, minWidth: 180, gap: 8 }}>
          <Text style={s.mono}>DATE OF BIRTH</Text>
          <Pressable
            onPress={() => setOpen(open === "date" ? null : "date")}
            style={[s.input, s.field]}
            accessibilityRole="button"
            accessibilityLabel="Date of birth"
          >
            <Text style={dateText ? s.value : s.placeholder}>
              {dateText || "Select a date"}
            </Text>
            <Text style={s.placeholder}>▦</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1, minWidth: 180, gap: 8 }}>
          <Text style={s.mono}>TIME OF BIRTH</Text>
          <Pressable
            onPress={() => !noTime && setOpen(open === "time" ? null : "time")}
            style={[s.input, s.field, noTime && { opacity: 0.5 }]}
            accessibilityRole="button"
            accessibilityLabel="Time of birth"
          >
            <Text style={timeText && !noTime ? s.value : s.placeholder}>
              {noTime ? "Not known" : timeText || "Select a time"}
            </Text>
            <Text style={s.placeholder}>◷</Text>
          </Pressable>
        </View>
      </View>

      {open ? (
        <View style={s.picker}>
          <View style={s.row}>
            <Text style={s.mono}>
              {open === "date" ? "DAY · MONTH · YEAR" : "TIME OF DAY"}
            </Text>
            <Text style={[s.mono, { color: colors.text }]}>
              {open === "date" ? dateText || "--" : timeText || "--:--"}
            </Text>
          </View>
          {open === "date" ? (
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Column
                label="Day"
                value={day}
                onPick={(v) => setDay(v as number)}
                items={[...Array(31)].map((_, i) => ({
                  v: i + 1,
                  t: pad(i + 1),
                }))}
              />
              <Column
                label="Month"
                value={month}
                onPick={(v) => setMonth(v as number)}
                items={MONTHS.map((m, i) => ({ v: i + 1, t: m }))}
              />
              <Column
                label="Year"
                value={year}
                onPick={(v) => setYear(v as number)}
                items={[...Array(thisYear - 1919)].map((_, i) => ({
                  v: thisYear - i,
                  t: String(thisYear - i),
                }))}
              />
            </View>
          ) : (
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Column
                label="Hour"
                value={hour}
                onPick={(v) => setHour(v as number)}
                items={[...Array(12)].map((_, i) => ({
                  v: i + 1,
                  t: pad(i + 1),
                }))}
              />
              <Column
                label="Minute"
                value={minute}
                onPick={(v) => setMinute(v as number)}
                items={[...Array(60)].map((_, i) => ({ v: i, t: pad(i) }))}
              />
              <Column
                label="AM or PM"
                value={ampm}
                onPick={(v) => setAmpm(v as "AM" | "PM")}
                items={[
                  { v: "AM", t: "AM" },
                  { v: "PM", t: "PM" },
                ]}
              />
            </View>
          )}
          <View style={s.row}>
            <Pressable
              onPress={() => {
                if (open === "date") {
                  setDay(null);
                  setMonth(null);
                  setYear(null);
                } else {
                  setHour(null);
                  setMinute(null);
                }
              }}
              accessibilityRole="button"
            >
              <Text style={s.mono}>CLEAR</Text>
            </Pressable>
            <Pressable
              onPress={() => setOpen(null)}
              style={s.done}
              accessibilityRole="button"
            >
              <Text style={[s.mono, { color: colors.onPrimary }]}>DONE</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Pressable
        onPress={() => setNoTime(!noTime)}
        style={{ flexDirection: "row", gap: 10, alignItems: "center" }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: noTime }}
      >
        <View
          style={[
            s.radio,
            noTime && {
              borderColor: colors.primary,
              backgroundColor: colors.primary,
            },
          ]}
        />
        <Text style={s.sub}>I don’t know my time of birth</Text>
      </Pressable>

      <View style={{ gap: 8 }}>
        <Text style={s.mono}>PLACE OF BIRTH</Text>
        {place ? (
          <Pressable
            onPress={() => setPlace(null)}
            style={[s.input, s.field]}
            accessibilityRole="button"
            accessibilityLabel="Change place of birth"
          >
            <Text style={s.value} numberOfLines={1}>
              ⌖ {place.name}
            </Text>
            <Text style={s.placeholder}>change</Text>
          </Pressable>
        ) : (
          <View style={[s.input, s.field, { paddingRight: 6 }]}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={search}
              placeholder="⌖  City, State, Country"
              placeholderTextColor={colors.muted}
              style={
                {
                  flex: 1,
                  color: colors.text,
                  fontFamily: font.medium,
                  fontSize: 16,
                  minHeight: 44,
                  outlineWidth: 0,
                } as object
              }
              accessibilityLabel="Place of birth"
            />
            <Pressable
              onPress={search}
              style={s.done}
              accessibilityRole="button"
              accessibilityLabel="Search places"
            >
              <Text style={[s.mono, { color: colors.onPrimary }]}>SEARCH</Text>
            </Pressable>
          </View>
        )}
        {!place && results ? (
          <View style={s.results}>
            {results.length ? (
              results.map((r) => (
                <Pressable
                  key={`${r.lat},${r.lon}`}
                  onPress={() => {
                    setPlace(r);
                    setResults(null);
                  }}
                  style={s.result}
                  accessibilityRole="button"
                >
                  <Text style={s.value} numberOfLines={2}>
                    {r.name}
                  </Text>
                </Pressable>
              ))
            ) : (
              <Text style={[s.sub, { padding: 12 }]}>
                No places found. Try the nearest city.
              </Text>
            )}
          </View>
        ) : null}
        {place && place.tzOffsetMin === null ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={s.sub}>Time zone at birth:</Text>
            <Pressable
              onPress={() => setTz(tz - 30)}
              style={s.step}
              accessibilityLabel="Earlier time zone"
            >
              <Text style={s.value}>−</Text>
            </Pressable>
            <Text style={s.value}>
              UTC{tz < 0 ? "−" : "+"}
              {pad(Math.floor(Math.abs(tz) / 60))}:{pad(Math.abs(tz) % 60)}
            </Text>
            <Pressable
              onPress={() => setTz(tz + 30)}
              style={s.step}
              accessibilityLabel="Later time zone"
            >
              <Text style={s.value}>+</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <Pressable
        onPress={() => setConsent(!consent)}
        style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent }}
        accessibilityLabel="I agree to Kosmik keeping my birth details to read my chart"
      >
        <View
          style={[
            s.box,
            consent && {
              borderColor: colors.primary,
              backgroundColor: colors.primary,
            },
          ]}
        >
          {consent ? (
            <Text style={{ color: colors.onPrimary, fontSize: 12 }}>✓</Text>
          ) : null}
        </View>
        <Text style={[s.sub, { flex: 1 }]}>
          Kosmik may keep my birth details to read my chart. Only I can see
          them, and I can delete them any time.
        </Text>
      </Pressable>

      {error ? (
        <Text style={{ color: colors.danger, fontFamily: font.semibold }}>
          {error}
        </Text>
      ) : null}
      <Primary
        label="See my snapshot"
        onPress={save}
        busy={busy}
        disabled={!dateOk || !timeOk || !place || !consent}
      />
      <Text style={[s.mono, { textAlign: "center" }]}>
        ● YOU CAN REFINE THESE ANY TIME
      </Text>
    </View>
  );
}

const styles = (c: Colors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(4,2,8,0.72)",
      justifyContent: "center",
      padding: 14,
    },
    frame: {
      backgroundColor: c.bg,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: c.line,
      width: "100%",
      maxWidth: 980,
      maxHeight: "94%",
      alignSelf: "center",
      overflow: "hidden",
    },
    side: {
      width: "36%",
      padding: 28,
      gap: 18,
      backgroundColor: c.primarySoft,
      borderRightWidth: 1,
      borderRightColor: c.line,
    },
    brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    mark: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    markText: { color: c.onPrimary, fontSize: 18 },
    brand: { color: c.text, fontFamily: font.display, fontSize: 24 },
    sideTitle: {
      color: c.text,
      fontFamily: font.display,
      fontSize: 34,
      lineHeight: 42,
    },
    sideItem: {
      color: c.muted,
      fontFamily: font.body,
      fontSize: 15,
      lineHeight: 21,
      flex: 1,
    },
    main: { padding: 26, gap: 20, flexGrow: 1 },
    topRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      minHeight: 36,
    },
    close: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.line,
      alignItems: "center",
      justifyContent: "center",
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    mono: {
      color: c.muted,
      fontFamily: font.mono,
      fontSize: 11,
      letterSpacing: 2,
    },
    seg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: c.line },
    title: {
      color: c.text,
      fontFamily: font.display,
      fontSize: 34,
      lineHeight: 42,
    },
    sub: {
      color: c.muted,
      fontFamily: font.body,
      fontSize: 15,
      lineHeight: 22,
    },
    input: {
      color: c.text,
      fontFamily: font.medium,
      fontSize: 16,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 14,
      backgroundColor: c.surface2,
      paddingHorizontal: 14,
      minHeight: 52,
      outlineWidth: 0,
    },
    field: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    value: {
      color: c.text,
      fontFamily: font.medium,
      fontSize: 16,
      flexShrink: 1,
    },
    placeholder: { color: c.muted, fontFamily: font.body, fontSize: 16 },
    pill: {
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 14,
      paddingHorizontal: 18,
      minHeight: 46,
      justifyContent: "center",
    },
    pillOn: { borderColor: c.primary, backgroundColor: c.primarySoft },
    pillText: { color: c.text, fontFamily: font.semibold, fontSize: 15 },
    primary: {
      backgroundColor: c.primary,
      borderRadius: 16,
      minHeight: 54,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: c.primary,
      shadowOpacity: 0.35,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
    },
    primaryText: {
      color: c.onPrimary,
      fontFamily: font.semibold,
      fontSize: 17,
    },
    picker: {
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 16,
      backgroundColor: c.surface2,
      padding: 12,
      gap: 10,
    },
    column: { flex: 1, maxHeight: 220 },
    cell: {
      minHeight: 40,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    cellOn: { backgroundColor: c.primary },
    cellText: { color: c.text, fontFamily: font.mono, fontSize: 15 },
    done: {
      backgroundColor: c.primary,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: c.muted,
    },
    box: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: c.muted,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
    },
    results: {
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 14,
      overflow: "hidden",
      backgroundColor: c.surface2,
    },
    result: { padding: 12, borderBottomWidth: 1, borderBottomColor: c.line },
    step: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: c.line,
      alignItems: "center",
      justifyContent: "center",
    },
    snapCard: {
      flexDirection: "row",
      gap: 14,
      padding: 16,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface2,
    },
    snapIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: c.primarySoft,
      alignItems: "center",
      justifyContent: "center",
    },
    snapTitle: { color: c.text, fontFamily: font.display, fontSize: 20 },
    tag: {
      color: c.highlight,
      fontFamily: font.mono,
      fontSize: 10,
      letterSpacing: 1.5,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    askRow: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: c.primary,
      borderRadius: 16,
      backgroundColor: c.surface2,
      paddingRight: 6,
    },
    send: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
    },
  });
