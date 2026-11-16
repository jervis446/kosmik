import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { track } from "../lib/analytics";
import { api, ApiError, type BirthDetails, type Gender, type Place } from "../lib/api";
import { tr } from "../lib/i18n";
import { type Colors, font, useTheme } from "../lib/theme";
import { parseDate } from "./DetailsForms";
import { Logo } from "./Logo";

const toInput = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const GENDERS: [Gender, string][] = [
  ["female", "Female"],
  ["male", "Male"],
  ["other", "Other"],
];

/** Birth details as one card of rows: name, gender, date, time and place, with Save and Cancel. */
export function BirthDetailsModal({
  visible,
  initial,
  onClose,
  onSaved,
}: {
  visible: boolean;
  initial: BirthDetails | null;
  onClose: () => void;
  onSaved: (d: BirthDetails) => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const [name, setName] = useState(initial?.name ?? "");
  const [gender, setGender] = useState<Gender | null>(initial?.gender ?? null);
  const [date, setDate] = useState(initial ? toInput(initial.birthDate) : "");
  const [time, setTime] = useState(initial?.birthTime ?? "");
  const [query, setQuery] = useState(initial?.place ?? "");
  const [place, setPlace] = useState<Place | null>(
    initial
      ? { name: initial.place, lat: initial.lat, lon: initial.lon, country: "", tzOffsetMin: initial.tzOffsetMin }
      : null,
  );
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState<"search" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (query.trim().length < 2) return;
    setError(null);
    setBusy("search");
    try {
      const r = await api.places(query);
      setPlaces(r.places);
      if (!r.places.length) setError(tr("No places found. Try the nearest city."));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tr("Something went wrong. Please try again."));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setError(null);
    const birthDate = parseDate(date);
    if (!birthDate) return setError(tr("Enter your date of birth as DD/MM/YYYY."));
    const t = time.trim();
    if (t && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(t))
      return setError(tr("Enter the birth time as HH:MM in 24-hour time (e.g. 06:45 or 18:30), or leave it blank."));
    if (!place) return setError(tr("Search for your place of birth and choose it from the list."));
    setBusy("save");
    try {
      const r = await api.saveProfile({
        name: name.trim() || null,
        gender,
        birthDate,
        birthTime: t ? t.padStart(5, "0") : null,
        place: place.name,
        lat: place.lat,
        lon: place.lon,
        tzOffsetMin: place.tzOffsetMin ?? initial?.tzOffsetMin ?? 330,
      });
      track("details/birth-saved");
      onSaved(r.details);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tr("Something went wrong. Please try again."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card} accessibilityViewIsModal testID="birth-modal">
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            <View style={s.head}>
              <View style={s.mark}>
                <Logo size={34} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.title}>{tr("Birth details")}</Text>
                <Text style={s.sub}>
                  {tr("These power every reading Kosmik gives you. Keep them accurate for the sharpest chart.")}
                </Text>
              </View>
            </View>

            <View style={s.rows}>
              <Row label={tr("FULL NAME")} s={s}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  style={s.value}
                  placeholder={tr("As you’d like to be addressed")}
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Name"
                />
              </Row>
              <Row label={tr("GENDER")} s={s}>
                <View style={s.segment} accessibilityRole="radiogroup">
                  {GENDERS.map(([g, label], i) => (
                    <Pressable
                      key={g}
                      onPress={() => setGender(g)}
                      style={[s.segBtn, i > 0 && s.segDivider, gender === g && { backgroundColor: colors.primary }]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: gender === g }}
                    >
                      <Text style={[s.segText, gender === g && { color: colors.onPrimary }]}>{tr(label)}</Text>
                    </Pressable>
                  ))}
                </View>
              </Row>
              <Row label={tr("DATE OF BIRTH")} s={s} icon="▦">
                <TextInput
                  value={date}
                  onChangeText={setDate}
                  style={s.value}
                  placeholder="DD/MM/YYYY"
                  placeholderTextColor={colors.muted}
                  inputMode="numeric"
                  accessibilityLabel="Date of birth"
                />
              </Row>
              <Row label={tr("TIME OF BIRTH")} s={s} icon="◷">
                <TextInput
                  value={time}
                  onChangeText={setTime}
                  style={s.value}
                  placeholder={tr("HH:MM, 24-hour (e.g. 06:45)")}
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Time of birth"
                />
              </Row>
              <Row label={tr("PLACE OF BIRTH")} s={s} last>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <TextInput
                      value={query}
                      onChangeText={(v) => {
                        setQuery(v);
                        setPlace(null);
                      }}
                      onSubmitEditing={search}
                      style={[s.value, { flex: 1 }]}
                      placeholder={tr("City, state")}
                      placeholderTextColor={colors.muted}
                      accessibilityLabel="Place of birth"
                    />
                    {!place ? (
                      <Pressable onPress={search} style={s.searchBtn} accessibilityRole="button" accessibilityLabel="Search places">
                        {busy === "search" ? (
                          <ActivityIndicator color={colors.text} size="small" />
                        ) : (
                          <Text style={s.searchText}>{tr("Search")}</Text>
                        )}
                      </Pressable>
                    ) : null}
                  </View>
                  {!place && places?.length ? (
                    <View style={s.results}>
                      {places.map((p) => (
                        <Pressable
                          key={`${p.lat},${p.lon}`}
                          onPress={() => {
                            setPlace(p);
                            setQuery(p.name);
                            setPlaces(null);
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
                </View>
              </Row>
            </View>

            {error ? <Text style={s.error}>{error}</Text> : null}

            <View style={s.foot}>
              <Text style={s.note}>
                {tr("Don’t know your birth time? Leave it blank, your reading stays approximate.")}
              </Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable onPress={onClose} style={s.cancel} accessibilityRole="button">
                  <Text style={s.cancelText}>{tr("Cancel")}</Text>
                </Pressable>
                <Pressable onPress={save} disabled={busy !== null} style={[s.save, busy !== null && { opacity: 0.6 }]} accessibilityRole="button">
                  {busy === "save" ? (
                    <ActivityIndicator color={colors.onPrimary} />
                  ) : (
                    <Text style={s.saveText}>{tr("Save")}</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Row({
  label,
  icon,
  last,
  s,
  children,
}: {
  label: string;
  icon?: string;
  last?: boolean;
  s: ReturnType<typeof styles>;
  children: React.ReactNode;
}) {
  return (
    <View style={[s.row, last && { borderBottomWidth: 0 }]}>
      <Text style={s.label}>{label}</Text>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 200 }}>
        {children}
        {icon ? <Text style={s.icon}>{icon}</Text> : null}
      </View>
    </View>
  );
}

const styles = (c: Colors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(8,4,10,0.72)",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
    },
    card: {
      width: "100%",
      maxWidth: 640,
      maxHeight: "92%",
      borderRadius: 24,
      borderWidth: 1,
      borderColor: `${c.primary}55`,
      backgroundColor: c.surface2,
      overflow: "hidden",
    },
    head: {
      flexDirection: "row",
      gap: 16,
      padding: 24,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
      backgroundColor: `${c.primary}1a`,
    },
    mark: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: `${c.primary}66`,
      alignItems: "center",
      justifyContent: "center",
    },
    title: { color: c.text, fontFamily: font.display, fontSize: 28 },
    sub: { color: c.muted, fontFamily: font.body, fontSize: 15, lineHeight: 22 },
    rows: { paddingHorizontal: 24 },
    row: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 12,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
    },
    label: { width: 150, color: c.muted, fontFamily: font.mono, fontSize: 12, letterSpacing: 2 },
    value: {
      flex: 1,
      color: c.text,
      fontFamily: font.medium,
      fontSize: 18,
      paddingVertical: 6,
      outlineStyle: "none",
    } as object,
    icon: { color: c.muted, fontSize: 18 },
    segment: { flexDirection: "row", borderWidth: 1, borderColor: c.line, borderRadius: 12, overflow: "hidden" },
    segBtn: { paddingVertical: 10, paddingHorizontal: 18 },
    segDivider: { borderLeftWidth: 1, borderLeftColor: c.line },
    segText: { color: c.text, fontFamily: font.medium, fontSize: 15 },
    searchBtn: { borderWidth: 1, borderColor: c.line, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
    searchText: { color: c.text, fontFamily: font.semibold, fontSize: 13 },
    results: { borderWidth: 1, borderColor: c.line, borderRadius: 12, overflow: "hidden" },
    result: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: c.line },
    resultText: { color: c.text, fontFamily: font.body, fontSize: 14 },
    error: { color: c.danger, fontFamily: font.medium, fontSize: 14, paddingHorizontal: 24, paddingTop: 8 },
    foot: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 14,
      padding: 24,
      borderTopWidth: 1,
      borderTopColor: c.line,
    },
    note: { flex: 1, minWidth: 220, color: c.muted, fontFamily: font.body, fontSize: 13, lineHeight: 19 },
    cancel: { borderWidth: 1, borderColor: c.line, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 24 },
    cancelText: { color: c.text, fontFamily: font.semibold, fontSize: 15 },
    save: { backgroundColor: c.primary, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 28, minWidth: 96, alignItems: "center" },
    saveText: { color: c.onPrimary, fontFamily: font.bold, fontSize: 15 },
  });
