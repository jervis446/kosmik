import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Header } from "../components/Header";
import { api, type Me } from "../lib/api";
import { useAuth } from "../lib/auth";
import { GRIEVANCE } from "../lib/legal";
import { type Colors, font, type ThemePref, useTheme } from "../lib/theme";

const date = (ms: number) =>
  new Date(ms).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** Everything about your account in one place: plan and usage, upgrade, theme, legal, sign out. */
export default function Account() {
  const { session, ready, signOut } = useAuth();
  const { colors, pref, setPref } = useTheme();
  const s = styles(colors);
  const [me, setMe] = useState<Me | null | undefined>();

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace("/sign-in");
      return;
    }
    let stopped = false;
    api
      .me()
      .then((m) => !stopped && setMe(m))
      .catch(() => !stopped && setMe(null));
    return () => {
      stopped = true;
    };
  }, [ready, session]);

  const email = session?.user.email ?? "";
  const premium = !!me?.premiumUntil;
  const limit = me?.usage.limit ?? null;
  const used = me?.usage.used ?? 0;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.bg }}
      edges={["top", "bottom"]}
    >
      <Header title="Account" back />
      <ScrollView contentContainerStyle={s.page}>
        <View style={s.profile}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{(email[0] ?? "?").toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.email} numberOfLines={1} selectable>
              {email}
            </Text>
            <Text style={s.muted}>
              Asanoha account · works across Asanoha apps
            </Text>
          </View>
        </View>

        <View style={[s.card, premium && { borderColor: colors.primary }]}>
          <View style={s.row}>
            <Text style={s.cardTitle}>{premium ? "Premium" : "Starter"}</Text>
            <Text
              style={[
                s.badge,
                premium && {
                  backgroundColor: colors.primary,
                  color: colors.onPrimary,
                },
              ]}
            >
              {premium ? "Unlimited" : "Free"}
            </Text>
          </View>
          <Text style={s.muted} testID="plan">
            {me === undefined
              ? "…"
              : premium
                ? `Premium, unlimited questions until ${date(me!.premiumUntil!)}.`
                : "Starter: 11 questions a week, refilled every Monday."}
          </Text>
          {!premium && limit !== null ? (
            <View style={{ gap: 6 }}>
              <View
                style={s.track}
                accessibilityLabel={`${used} of ${limit} questions used this week`}
              >
                <View
                  style={[
                    s.fill,
                    { width: `${Math.min(100, (100 * used) / limit)}%` },
                  ]}
                />
              </View>
              <Text style={s.small}>
                {used} of {limit} used this week · {Math.max(0, limit - used)}{" "}
                left
              </Text>
            </View>
          ) : null}
          <Pressable
            onPress={() => router.push("/premium")}
            style={s.primary}
            accessibilityRole="button"
          >
            <Text style={s.primaryText}>
              {premium ? "Add more Premium days" : "Get Premium"}
            </Text>
          </Pressable>
          {!premium ? (
            <Text style={s.small}>
              ₹51 for 7 days or ₹101 for 30 days, paid once by UPI.
            </Text>
          ) : null}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Appearance</Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {(["system", "light", "dark"] as ThemePref[]).map((p) => (
              <Pressable
                key={p}
                onPress={() => setPref(p)}
                style={[
                  s.choice,
                  pref === p && {
                    backgroundColor: colors.primarySoft,
                    borderColor: colors.primary,
                  },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: pref === p }}
              >
                <Text style={s.choiceText}>
                  {p === "system"
                    ? "Same as phone"
                    : p === "light"
                      ? "Light"
                      : "Dark"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>About</Text>
          {[
            ["Privacy", "/privacy"],
            ["Terms", "/terms"],
          ].map(([label, href]) => (
            <Pressable
              key={href}
              onPress={() => router.push(href as "/privacy" | "/terms")}
              style={s.link}
              accessibilityRole="link"
            >
              <Text style={s.linkText}>{label}</Text>
              <Text style={s.muted}>›</Text>
            </Pressable>
          ))}
          <Text style={s.small} selectable>
            {GRIEVANCE}
          </Text>
        </View>

        <Pressable
          onPress={() => signOut().then(() => router.replace("/"))}
          style={[
            s.choice,
            { alignSelf: "flex-start", borderColor: colors.danger },
          ]}
          accessibilityRole="button"
        >
          <Text style={{ color: colors.danger, fontFamily: font.bold }}>
            Sign out
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (c: Colors) =>
  StyleSheet.create({
    page: {
      padding: 20,
      gap: 16,
      maxWidth: 600,
      width: "100%",
      alignSelf: "center",
    },
    profile: { flexDirection: "row", alignItems: "center", gap: 14 },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { color: c.onPrimary, fontFamily: font.heavy, fontSize: 22 },
    email: { color: c.text, fontFamily: font.bold, fontSize: 17 },
    muted: {
      color: c.muted,
      fontFamily: font.body,
      fontSize: 14,
      lineHeight: 20,
    },
    small: {
      color: c.muted,
      fontFamily: font.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    card: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 20,
      padding: 18,
      gap: 12,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    cardTitle: { color: c.text, fontFamily: font.bold, fontSize: 17 },
    badge: {
      color: c.text,
      backgroundColor: c.surface2,
      fontFamily: font.bold,
      fontSize: 12,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      overflow: "hidden",
    },
    track: {
      height: 8,
      borderRadius: 4,
      backgroundColor: c.surface2,
      overflow: "hidden",
    },
    fill: { height: 8, borderRadius: 4, backgroundColor: c.primary },
    primary: {
      backgroundColor: c.primary,
      borderRadius: 999,
      minHeight: 46,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryText: { color: c.onPrimary, fontFamily: font.bold, fontSize: 15 },
    choice: {
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 999,
      paddingHorizontal: 16,
      minHeight: 42,
      justifyContent: "center",
    },
    choiceText: { color: c.text, fontFamily: font.semibold },
    link: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      minHeight: 44,
    },
    linkText: { color: c.text, fontFamily: font.semibold, fontSize: 15 },
  });
