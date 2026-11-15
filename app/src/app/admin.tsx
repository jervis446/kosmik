import { useEffect, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Header } from "../components/Header";
import { GOATCOUNTER_CODE } from "../lib/analytics";
import { type AdminErrors, api, ApiError } from "../lib/api";
import { type Colors, font, useTheme } from "../lib/theme";
import { Sky } from "../components/Sky";

const when = (ms: number) =>
  new Date(ms).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

/** Owner-only: the last 7 days of errors, grouped, and a link to the analytics dashboard. */
export default function Admin() {
  const { colors } = useTheme();
  const s = styles(colors);
  const [data, setData] = useState<AdminErrors | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api
      .adminErrors()
      .then(setData)
      .catch((e) =>
        setError(
          e instanceof ApiError && e.status === 404
            ? "This page is for Kosmik's owner."
            : e instanceof Error
              ? e.message
              : "Could not load.",
        ),
      );
  }, []);

  const total = (src: string) =>
    data?.days
      .filter((d) => d.source === src)
      .reduce((n, d) => n + d.count, 0) ?? 0;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.bg }}
      edges={["top", "bottom"]}
    >
      <Sky />
      <Header title="Admin" back />
      <ScrollView contentContainerStyle={s.page}>
        <Pressable
          onPress={() =>
            Linking.openURL(`https://${GOATCOUNTER_CODE}.goatcounter.com`)
          }
          style={s.card}
          accessibilityRole="link"
        >
          <Text style={s.title}>Analytics ↗</Text>
          <Text style={s.muted}>
            Visits, pages and actions (sign-ins, questions by type, WhatsApp
            checks, quiz, palm photos, Premium) on GoatCounter.
          </Text>
        </Pressable>

        <View style={s.card}>
          <Text style={s.title}>Errors, last 7 days</Text>
          {error ? (
            <Text style={[s.muted, { color: colors.danger }]}>{error}</Text>
          ) : null}
          {!data && !error ? <Text style={s.muted}>…</Text> : null}
          {data ? (
            <Text style={s.muted} testID="error-totals">
              App: {total("client")} · Server: {total("server")} ·{" "}
              {data.groups.length} kinds
            </Text>
          ) : null}
          {data?.days.length ? (
            <View style={{ gap: 4 }}>
              {data.days.map((d) => (
                <Text key={`${d.day}${d.source}`} style={s.small}>
                  {d.day} · {d.source === "client" ? "app" : "server"} ·{" "}
                  {d.count}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        {data?.groups.map((g) => (
          <Pressable
            key={g.fingerprint}
            onPress={() =>
              setOpen(open === g.fingerprint ? null : g.fingerprint)
            }
            style={s.card}
            accessibilityRole="button"
            testID="error-group"
          >
            <View
              style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
            >
              <Text
                style={[
                  s.badge,
                  g.source === "server" && {
                    backgroundColor: colors.accentSoft,
                  },
                ]}
              >
                {g.source === "client" ? "app" : "server"} · {g.kind}
              </Text>
              <Text style={[s.small, { flex: 1, textAlign: "right" }]}>
                ×{g.count} · last {when(g.last_at)}
              </Text>
            </View>
            <Text style={s.message} selectable>
              {g.message}
            </Text>
            {g.path ? <Text style={s.small}>{g.path}</Text> : null}
            {open === g.fingerprint && g.detail ? (
              <Text style={s.code} selectable>
                {g.detail}
              </Text>
            ) : null}
          </Pressable>
        ))}
        {data && !data.groups.length ? (
          <Text style={s.muted}>No errors. </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (c: Colors) =>
  StyleSheet.create({
    page: {
      padding: 16,
      gap: 12,
      maxWidth: 820,
      width: "100%",
      alignSelf: "center",
    },
    card: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 16,
      padding: 14,
      gap: 8,
    },
    title: { color: c.text, fontFamily: font.bold, fontSize: 16 },
    muted: {
      color: c.muted,
      fontFamily: font.body,
      fontSize: 14,
      lineHeight: 20,
    },
    small: { color: c.muted, fontFamily: font.medium, fontSize: 12 },
    message: {
      color: c.text,
      fontFamily: font.semibold,
      fontSize: 14,
      lineHeight: 20,
    },
    badge: {
      color: c.text,
      backgroundColor: c.surface2,
      fontFamily: font.bold,
      fontSize: 11,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      overflow: "hidden",
    },
    code: {
      color: c.text,
      fontFamily: "monospace",
      fontSize: 11,
      lineHeight: 16,
      backgroundColor: c.bg,
      padding: 8,
      borderRadius: 8,
    },
  });
