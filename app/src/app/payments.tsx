import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Shell } from "../components/Shell";
import { api, ApiError, type Purchase } from "../lib/api";
import { useAuth } from "../lib/auth";
import { tr } from "../lib/i18n";
import { OPERATOR } from "../lib/legal";
import { type Colors, font, useTheme } from "../lib/theme";

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const when = (ms: number) =>
  new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/** Every Premium purchase on this account, newest first, each with its receipt details. */
export default function Payments() {
  const { session, ready } = useAuth();
  const { colors } = useTheme();
  const s = styles(colors);
  const [list, setList] = useState<Purchase[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace("/sign-in");
      return;
    }
    let live = true;
    api
      .payments()
      .then((r) => live && setList(r.payments))
      .catch((e) => live && setError(e instanceof ApiError ? e.message : tr("Something went wrong. Please try again.")));
    return () => {
      live = false;
    };
  }, [ready, session]);

  return (
    <Shell>
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.crumb}>{tr("KOSMIK / PAYMENTS")}</Text>
        <Text style={s.title}>{tr("Payments & invoices")}</Text>
        <Text style={s.lead}>
          {tr("Every purchase on this account, newest first.")}{" "}
          <Text style={{ color: colors.muted }}>
            {tr("Each one has its own receipt, issued by {v0}.", { v0: OPERATOR.name })}
          </Text>
        </Text>

        {error ? <Text style={s.error}>{error}</Text> : null}
        {list === null && !error ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : list?.length === 0 ? (
          <View style={s.empty} testID="payments-empty">
            <Text style={s.emptyIcon}>🧾</Text>
            <Text style={s.emptyTitle}>{tr("No purchases yet")}</Text>
            <Text style={s.emptyText}>{tr("Premium days you buy will be listed here the moment you buy them.")}</Text>
            <Pressable onPress={() => router.push("/premium")} style={s.cta} accessibilityRole="button">
              <Text style={s.ctaText}>{tr("Get Premium")}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {list?.map((p) => (
              <View key={p.id} style={s.row} testID="payment">
                <View style={{ flex: 1, minWidth: 200, gap: 4 }}>
                  <Text style={s.rowTitle}>
                    {p.credits
                      ? tr(p.credits === 1 ? "1 report credit" : "{v0} report credits", { v0: p.credits })
                      : tr("Premium · {v0} days", { v0: p.days })}
                  </Text>
                  <Text style={s.small}>{when(p.paidAt ?? p.createdAt)}</Text>
                  {p.utr ? <Text style={s.mono}>UTR {p.utr}</Text> : null}
                  <Text style={s.mono}>
                    {tr("Receipt")} #{p.id.slice(0, 8).toUpperCase()} · {OPERATOR.name}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <Text style={s.amount}>{rupees(p.amountPaise)}</Text>
                  <Text
                    style={[
                      s.pill,
                      p.status === "paid"
                        ? { color: colors.success, borderColor: colors.success }
                        : p.status === "failed"
                          ? { color: colors.danger, borderColor: colors.danger }
                          : { color: colors.muted, borderColor: colors.line },
                    ]}
                  >
                    {p.status === "paid" ? tr("Paid") : p.status === "failed" ? tr("Not completed") : tr("Waiting")}
                  </Text>
                </View>
              </View>
            ))}
            <Text style={s.small}>{tr("Prices include GST. Questions about a payment? Help → WhatsApp or email us with the UTR.")}</Text>
          </View>
        )}
      </ScrollView>
    </Shell>
  );
}

const styles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: 24, paddingTop: 32, gap: 14, maxWidth: 980, width: "100%", alignSelf: "center" },
    crumb: { color: c.muted, fontFamily: font.mono, fontSize: 12, letterSpacing: 3 },
    title: { color: c.text, fontFamily: font.display, fontSize: 44, lineHeight: 52 },
    lead: { color: c.text, fontFamily: font.body, fontSize: 17, lineHeight: 26, maxWidth: 620, marginBottom: 10 },
    error: { color: c.danger, fontFamily: font.medium, fontSize: 15 },
    empty: {
      alignItems: "center",
      gap: 8,
      paddingVertical: 56,
      paddingHorizontal: 20,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 20,
      backgroundColor: c.surface,
    },
    emptyIcon: { fontSize: 26, marginBottom: 6 },
    emptyTitle: { color: c.text, fontFamily: font.medium, fontSize: 20 },
    emptyText: { color: c.muted, fontFamily: font.body, fontSize: 15, textAlign: "center", maxWidth: 420, lineHeight: 22 },
    cta: { marginTop: 10, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 20 },
    ctaText: { color: c.onPrimary, fontFamily: font.semibold, fontSize: 14 },
    row: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      padding: 18,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 16,
      backgroundColor: c.surface,
    },
    rowTitle: { color: c.text, fontFamily: font.semibold, fontSize: 17 },
    amount: { color: c.text, fontFamily: font.display, fontSize: 24 },
    pill: { borderWidth: 1, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10, fontFamily: font.mono, fontSize: 11 },
    small: { color: c.muted, fontFamily: font.body, fontSize: 13 },
    mono: { color: c.muted, fontFamily: font.mono, fontSize: 11, letterSpacing: 0.6 },
  });
