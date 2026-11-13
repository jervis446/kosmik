import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  api,
  ApiError,
  type BirthDetails,
  type Hand,
  type Place,
} from "../lib/api";
import { pickPalmPhoto } from "../lib/palm";
import { type Colors, font, useTheme } from "../lib/theme";

const message = (e: unknown) =>
  e instanceof ApiError
    ? e.message
    : e instanceof Error
      ? e.message
      : "Something went wrong. Please try again.";

/** "+05:30" style label for minutes east of UTC. */
export const tzLabel = (min: number) =>
  `UTC${min < 0 ? "−" : "+"}${String(Math.floor(Math.abs(min) / 60)).padStart(2, "0")}:${String(Math.abs(min) % 60).padStart(2, "0")}`;

const toInputDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

/** DD/MM/YYYY (as people write it in India) to YYYY-MM-DD, or null if it isn't a real date. */
export function parseDate(text: string): string | null {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(text);
  if (!m) return null;
  const [d, mo, y] = [+m[1], +m[2], +m[3]];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== mo - 1 ||
    date.getUTCDate() !== d
  )
    return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function Check({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      style={{
        flexDirection: "row",
        gap: 10,
        alignItems: "flex-start",
        minHeight: 40,
        paddingVertical: 6,
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
    >
      <Text
        style={{
          fontSize: 18,
          color: on ? colors.primary : colors.muted,
          lineHeight: 22,
        }}
      >
        {on ? "☑" : "☐"}
      </Text>
      <Text
        style={{
          flex: 1,
          color: colors.text,
          fontFamily: font.body,
          fontSize: 14,
          lineHeight: 21,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Date, time and place of birth for the kundli. */
export function BirthForm({
  initial,
  onSaved,
}: {
  initial?: BirthDetails | null;
  onSaved: (d: BirthDetails) => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const [name, setName] = useState(initial?.name ?? "");
  const [date, setDate] = useState(
    initial ? toInputDate(initial.birthDate) : "",
  );
  const [time, setTime] = useState(initial?.birthTime ?? "");
  const [noTime, setNoTime] = useState(!!initial && initial.birthTime === null);
  const [query, setQuery] = useState(initial?.place ?? "");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [place, setPlace] = useState<Place | null>(
    initial
      ? {
          name: initial.place,
          lat: initial.lat,
          lon: initial.lon,
          country: "",
          tzOffsetMin: initial.tzOffsetMin,
        }
      : null,
  );
  const [tz, setTz] = useState(initial?.tzOffsetMin ?? 330);
  const [consent, setConsent] = useState(!!initial);
  const [busy, setBusy] = useState<"search" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    setError(null);
    setBusy("search");
    try {
      const r = await api.places(query);
      setPlaces(r.places);
      if (!r.places.length)
        setError(
          "No places found. Try the city and state, e.g. “Etawah, Uttar Pradesh”.",
        );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setError(null);
    const birthDate = parseDate(date);
    if (!birthDate) return setError("Enter your date of birth as DD/MM/YYYY.");
    const birthTime = noTime ? null : time.trim();
    if (birthTime !== null && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(birthTime))
      return setError(
        "Enter the birth time as HH:MM in 24-hour time (e.g. 06:45 or 18:30), or tick “I don’t know my birth time”.",
      );
    if (!place)
      return setError(
        "Search for your place of birth and choose it from the list.",
      );
    if (!consent)
      return setError("Please agree to Kosmik keeping your birth details.");
    setBusy("save");
    try {
      const r = await api.saveProfile({
        name: name.trim() || null,
        birthDate,
        birthTime: birthTime?.padStart(5, "0") ?? null,
        place: place.name,
        lat: place.lat,
        lon: place.lon,
        tzOffsetMin: place.tzOffsetMin ?? tz,
      });
      onSaved(r.details);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <View style={s.field}>
        <Text style={s.label}>Name (optional)</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          style={s.input}
          placeholder="As you’d like to be addressed"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Name"
        />
      </View>
      <View style={s.field}>
        <Text style={s.label}>Date of birth</Text>
        <TextInput
          value={date}
          onChangeText={setDate}
          style={s.input}
          placeholder="DD/MM/YYYY"
          placeholderTextColor={colors.muted}
          inputMode="numeric"
          accessibilityLabel="Date of birth"
        />
      </View>
      <View style={s.field}>
        <Text style={s.label}>Time of birth</Text>
        {!noTime ? (
          <TextInput
            value={time}
            onChangeText={setTime}
            style={s.input}
            placeholder="HH:MM, 24-hour (e.g. 06:45)"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Time of birth"
          />
        ) : null}
        <Check
          on={noTime}
          onToggle={() => setNoTime((v) => !v)}
          label="I don’t know my birth time (Kosmik can’t work out your lagna or houses without it)"
        />
      </View>
      <View style={s.field}>
        <Text style={s.label}>Place of birth</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            value={query}
            onChangeText={(v) => {
              setQuery(v);
              setPlace(null);
            }}
            onSubmitEditing={search}
            style={[s.input, { flex: 1 }]}
            placeholder="City, state"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Place of birth"
          />
          <Pressable
            onPress={search}
            disabled={busy !== null || query.trim().length < 2}
            style={[
              s.secondary,
              (busy !== null || query.trim().length < 2) && { opacity: 0.5 },
            ]}
            accessibilityRole="button"
          >
            {busy === "search" ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={s.secondaryText}>Search</Text>
            )}
          </Pressable>
        </View>
        {place ? (
          <Text style={s.chosen}>✓ {place.name}</Text>
        ) : places?.length ? (
          <View style={s.results}>
            {places.map((p) => (
              <Pressable
                key={`${p.lat},${p.lon}`}
                onPress={() => {
                  setPlace(p);
                  setQuery(p.name);
                  setPlaces(null);
                  if (p.tzOffsetMin !== null) setTz(p.tzOffsetMin);
                }}
                style={s.result}
                accessibilityRole="button"
              >
                <Text style={s.resultText} numberOfLines={2}>
                  {p.name}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {place && place.tzOffsetMin === null ? (
          <View style={{ gap: 6 }}>
            <Text style={s.small}>
              Born outside India: choose the time zone in force there on your
              birthday.
            </Text>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <Pressable
                onPress={() => setTz((t) => Math.max(-720, t - 30))}
                style={s.step}
                accessibilityRole="button"
                accessibilityLabel="Earlier time zone"
              >
                <Text style={s.secondaryText}>−</Text>
              </Pressable>
              <Text
                style={[s.secondaryText, { minWidth: 96, textAlign: "center" }]}
              >
                {tzLabel(tz)}
              </Text>
              <Pressable
                onPress={() => setTz((t) => Math.min(840, t + 30))}
                style={s.step}
                accessibilityRole="button"
                accessibilityLabel="Later time zone"
              >
                <Text style={s.secondaryText}>+</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        <Text style={s.small}>
          Only the place name is sent to OpenStreetMap to find it.
        </Text>
      </View>
      <Check
        on={consent}
        onToggle={() => setConsent((v) => !v)}
        label="I agree to Kosmik keeping my birth details to read my chart. I can delete them any time in Account."
      />
      {error ? (
        <Text style={s.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Pressable
        onPress={save}
        disabled={busy !== null}
        style={[s.primary, busy !== null && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel="Save birth details"
      >
        {busy === "save" ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={s.primaryText}>Save birth details</Text>
        )}
      </Pressable>
    </View>
  );
}

/** Photos of both palms, saved one hand at a time. */
export function PalmForm({
  onChanged,
}: {
  onChanged?: (saved: Record<Hand, boolean>) => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const [saved, setSaved] = useState<Record<Hand, string | null | undefined>>({
    left: undefined,
    right: undefined,
  });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<Hand | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .profile()
      .then(async (p) => {
        const load = async (hand: Hand) =>
          p.palms[hand]
            ? api
                .palmPhoto(hand)
                .then((x) => `data:${x.mime};base64,${x.data}`)
                .catch(() => null)
            : null;
        const [left, right] = await Promise.all([load("left"), load("right")]);
        if (!live) return;
        setSaved({ left, right });
        if (left || right) setConsent(true);
      })
      .catch(() => live && setSaved({ left: null, right: null }));
    return () => {
      live = false;
    };
  }, []);

  const report = (next: Record<Hand, string | null | undefined>) =>
    onChanged?.({ left: !!next.left, right: !!next.right });

  const add = async (hand: Hand, source: "library" | "camera") => {
    setError(null);
    if (!consent)
      return setError("Please agree to Kosmik keeping your palm photos first.");
    setBusy(hand);
    try {
      const photo = await pickPalmPhoto(source);
      if (!photo) return;
      await api.savePalmPhoto(hand, photo.base64, photo.mime);
      const next = {
        ...saved,
        [hand]: `data:${photo.mime};base64,${photo.base64}`,
      };
      setSaved(next);
      report(next);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (hand: Hand) => {
    setError(null);
    setBusy(hand);
    try {
      await api.deletePalmPhoto(hand);
      const next = { ...saved, [hand]: null };
      setSaved(next);
      report(next);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <Text style={s.small}>
        Open hand, palm facing the camera, in good light, with the lines filling
        most of the photo.
      </Text>
      <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
        {(["left", "right"] as Hand[]).map((hand) => (
          <View key={hand} style={s.slot} testID={`palm-slot-${hand}`}>
            <Text style={s.label}>
              {hand === "left" ? "Left hand" : "Right hand"}
            </Text>
            {saved[hand] === undefined ? (
              <ActivityIndicator color={colors.muted} />
            ) : saved[hand] ? (
              <Image
                source={{ uri: saved[hand]! }}
                style={s.thumb}
                accessibilityLabel={`Your ${hand} palm`}
              />
            ) : (
              <View style={[s.thumb, s.empty]}>
                <Text style={{ fontSize: 30 }}>✋</Text>
              </View>
            )}
            {busy === hand ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                <Pressable
                  onPress={() => add(hand, "library")}
                  style={s.secondary}
                  accessibilityRole="button"
                  accessibilityLabel={`Upload ${hand} palm`}
                >
                  <Text style={s.secondaryText}>
                    {saved[hand] ? "Replace" : "Upload"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => add(hand, "camera")}
                  style={s.secondary}
                  accessibilityRole="button"
                  accessibilityLabel={`Take ${hand} palm photo`}
                >
                  <Text style={s.secondaryText}>Camera</Text>
                </Pressable>
                {saved[hand] ? (
                  <Pressable
                    onPress={() => remove(hand)}
                    style={s.secondary}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${hand} palm`}
                  >
                    <Text style={[s.secondaryText, { color: colors.danger }]}>
                      Delete
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>
        ))}
      </View>
      <Check
        on={consent}
        onToggle={() => setConsent((v) => !v)}
        label="I agree to Kosmik keeping my palm photos to read them when I ask. I can delete them any time."
      />
      {error ? (
        <Text style={s.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** The popup that asks for details when a question needs them. */
export function DetailsModal({
  kind,
  onClose,
  onDone,
}: {
  kind: "birth" | "palm" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const [palms, setPalms] = useState<Record<Hand, boolean>>({
    left: false,
    right: false,
  });
  return (
    <Modal
      visible={kind !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.backdrop}>
        <View style={s.sheet} accessibilityViewIsModal>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={s.sheetTitle} role="heading">
              {kind === "palm" ? "Add your palm photos" : "Your birth details"}
            </Text>
            <Pressable
              onPress={onClose}
              style={s.close}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={{ color: colors.muted, fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 6 }}>
            <Text style={s.small}>
              {kind === "palm"
                ? "Kosmik reads both hands. Add them once and every palm question uses them."
                : "Kosmik calculates your chart from these. Add them once and every chart question uses them."}
            </Text>
            {kind === "birth" ? <BirthForm onSaved={onDone} /> : null}
            {kind === "palm" ? (
              <>
                <PalmForm onChanged={setPalms} />
                <Pressable
                  onPress={onDone}
                  disabled={!palms.left && !palms.right}
                  style={[
                    s.primary,
                    !palms.left && !palms.right && { opacity: 0.4 },
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={s.primaryText}>
                    {palms.left && palms.right
                      ? "Read my palms"
                      : "Continue with one hand"}
                  </Text>
                </Pressable>
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = (c: Colors) =>
  StyleSheet.create({
    field: { gap: 6 },
    label: { color: c.text, fontFamily: font.semibold, fontSize: 14 },
    input: {
      color: c.text,
      fontFamily: font.body,
      fontSize: 16,
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 12,
      paddingHorizontal: 12,
      minHeight: 46,
    },
    small: {
      color: c.muted,
      fontFamily: font.body,
      fontSize: 13,
      lineHeight: 19,
    },
    chosen: { color: c.success, fontFamily: font.semibold, fontSize: 13 },
    results: {
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 12,
      overflow: "hidden",
    },
    result: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
    },
    resultText: { color: c.text, fontFamily: font.medium, fontSize: 14 },
    step: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.line,
      alignItems: "center",
      justifyContent: "center",
    },
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
    secondary: {
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 999,
      paddingHorizontal: 14,
      minHeight: 40,
      justifyContent: "center",
      alignItems: "center",
    },
    secondaryText: { color: c.text, fontFamily: font.bold, fontSize: 14 },
    slot: {
      flexBasis: 150,
      flexGrow: 1,
      gap: 8,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 16,
      padding: 12,
    },
    thumb: { width: "100%", aspectRatio: 1, borderRadius: 12 },
    empty: {
      backgroundColor: c.surface2,
      alignItems: "center",
      justifyContent: "center",
    },
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      padding: 16,
    },
    sheet: {
      backgroundColor: c.surface,
      borderRadius: 22,
      padding: 18,
      gap: 10,
      maxHeight: "92%",
      width: "100%",
      maxWidth: 520,
      alignSelf: "center",
    },
    sheetTitle: {
      flex: 1,
      color: c.text,
      fontFamily: font.heavy,
      fontSize: 20,
    },
    close: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
  });
