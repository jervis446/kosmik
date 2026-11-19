import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Header } from "../components/Header";
import { Sky } from "../components/Sky";
import { useAuth } from "../lib/auth";
import { tr } from "../lib/i18n";
import { setNext } from "../lib/next";
import { supabase } from "../lib/supabase";
import { font, useTheme } from "../lib/theme";

/**
 * The MCP server's address is part of the app, never taken from the link: this page sends the
 * person's session token there, so a crafted link must not be able to point it anywhere else.
 */
const MCP = (process.env.EXPO_PUBLIC_MCP_URL ?? "https://kosmik-mcp.prime-adarsh108.workers.dev").replace(/\/+$/, "");

/** /connect: allow Claude or ChatGPT to use your Kosmik account (the MCP sign-in, step 2). */
export default function Connect() {
  const { handle, app, host, local } = useLocalSearchParams<{ handle?: string; app?: string; host?: string; local?: string }>();
  const { session, ready } = useAuth();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = (app ?? "").slice(0, 80) || tr("An AI app");

  // Not signed in yet: sign in first, then come back to this same page.
  useEffect(() => {
    if (!ready || session || !handle) return;
    setNext(`/connect?${new URLSearchParams({ handle, app: app ?? "", host: host ?? "", ...(local ? { local } : {}) })}`);
    router.replace("/sign-in");
  }, [ready, session, handle, app, host, local]);

  const allow = async () => {
    if (!handle || Platform.OS !== "web") return;
    setBusy(true);
    setError(null);
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error(tr("Please sign in again."));
      const res = await fetch(`${MCP}/connect/code`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ handle }),
      });
      const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
      if (!res.ok || !body.code) throw new Error(body.error ?? tr("Something went wrong. Please try again."));
      globalThis.location.assign(`${MCP}/authorize/finish?code=${encodeURIComponent(body.code)}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const cancel = () => {
    if (!handle || Platform.OS !== "web") return router.replace("/chat");
    globalThis.location.assign(`${MCP}/authorize/deny?handle=${encodeURIComponent(handle)}`);
  };

  const text = { color: colors.text, fontFamily: font.body, fontSize: 15, lineHeight: 23 } as const;
  const muted = { ...text, color: colors.muted, fontSize: 14, lineHeight: 21 } as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top", "bottom"]}>
      <Sky />
      <Header title={tr("Connect")} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, maxWidth: 560, width: "100%", alignSelf: "center" }}>
        {!handle ? (
          <Text style={text}>{tr("This page is opened from Claude or ChatGPT when you add Kosmik there. Start again from that app.")}</Text>
        ) : !session ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : (
          <>
            <Text style={{ color: colors.text, fontFamily: font.display, fontSize: 26 }} role="heading">
              {tr("Connect Kosmik to {v0}?", { v0: name })}
            </Text>
            <Text style={text}>
              {tr("{v0} will be able to read your birth details, kundali, dashas, transits and prakriti results, and with Premium your reports. It can’t change your account or buy anything.", { v0: name })}
            </Text>
            <View style={{ gap: 6, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
              <Text style={muted}>{tr("Access goes to: {v0}", { v0: host || "?" })}</Text>
              <Text style={muted}>{tr("The app named itself, so check that this is the app you just used.")}</Text>
              {local ? <Text style={[muted, { color: colors.danger }]}>{tr("This sends access to an app on your own computer. Allow only if you just started this from it.")}</Text> : null}
              <Text style={muted}>{tr("Your chart is shared with that AI company to answer you. You can disconnect any time in its settings.")}</Text>
            </View>
            {error ? <Text style={{ color: colors.danger, fontFamily: font.medium, fontSize: 14 }}>{error}</Text> : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Pressable
                onPress={allow}
                disabled={busy}
                accessibilityRole="button"
                testID="connect-allow"
                style={{ backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 22, opacity: busy ? 0.6 : 1 }}
              >
                {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={{ color: colors.onPrimary, fontFamily: font.semibold, fontSize: 15 }}>{tr("Allow")}</Text>}
              </Pressable>
              <Pressable
                onPress={cancel}
                disabled={busy}
                accessibilityRole="button"
                style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 20, backgroundColor: colors.surface }}
              >
                <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 15 }}>{tr("Cancel")}</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
