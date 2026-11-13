import { Link, router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Header } from "../components/Header";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { font, type ThemePref, useTheme } from "../lib/theme";

export default function Account() {
  const { session, ready, signOut } = useAuth();
  const { colors, pref, setPref } = useTheme();

  const [premiumUntil, setPremiumUntil] = useState<number | null | undefined>();

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace("/sign-in");
      return;
    }
    let stopped = false;
    api
      .me()
      .then((m) => !stopped && setPremiumUntil(m.premiumUntil))
      .catch(() => !stopped && setPremiumUntil(null));
    return () => {
      stopped = true;
    };
  }, [ready, session]);

  const row = {
    color: colors.text,
    fontFamily: font.semibold,
    fontSize: 16,
  } as const;
  const btn = {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: "center",
  } as const;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
      <Header title="Account" back />
      <View
        style={{
          padding: 20,
          gap: 18,
          maxWidth: 560,
          width: "100%",
          alignSelf: "center",
        }}
      >
        <View style={{ gap: 4 }}>
          <Text
            style={{
              color: colors.muted,
              fontFamily: font.medium,
              fontSize: 13,
            }}
          >
            Signed in as
          </Text>
          <Text style={row} selectable>
            {session?.user.email}
          </Text>
        </View>
        <View style={{ gap: 8 }}>
          <Text style={row}>Theme</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["system", "light", "dark"] as ThemePref[]).map((p) => (
              <Pressable
                key={p}
                onPress={() => setPref(p)}
                style={[
                  btn,
                  pref === p && {
                    backgroundColor: colors.primarySoft,
                    borderColor: colors.primary,
                  },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: pref === p }}
              >
                <Text
                  style={{
                    color: colors.text,
                    fontFamily: font.semibold,
                    textTransform: "capitalize",
                  }}
                >
                  {p}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <Text style={row}>Plan</Text>
          <Text
            style={{
              color: colors.muted,
              fontFamily: font.body,
              fontSize: 15,
              lineHeight: 22,
            }}
            testID="plan"
          >
            {premiumUntil === undefined
              ? "…"
              : premiumUntil
                ? `Premium, unlimited questions until ${new Date(premiumUntil).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.`
                : "Starter: 11 questions a week, refilled every Monday."}
          </Text>
          <Pressable
            onPress={() => router.push("/premium")}
            style={[
              btn,
              {
                alignSelf: "flex-start",
                backgroundColor: colors.primarySoft,
                borderColor: colors.primary,
              },
            ]}
            accessibilityRole="button"
          >
            <Text style={{ color: colors.text, fontFamily: font.bold }}>
              {premiumUntil ? "Add more Premium days" : "Get Premium"}
            </Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
          <Link
            href="/privacy"
            style={{ color: colors.primary, fontFamily: font.semibold }}
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            style={{ color: colors.primary, fontFamily: font.semibold }}
          >
            Terms
          </Link>
        </View>
        <Pressable
          onPress={() => signOut().then(() => router.replace("/"))}
          style={[btn, { alignSelf: "flex-start", borderColor: colors.danger }]}
          accessibilityRole="button"
        >
          <Text style={{ color: colors.danger, fontFamily: font.bold }}>
            Sign out
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
