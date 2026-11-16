import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Shell } from "../../components/Shell";
import { track } from "../../lib/analytics";
import { api, ApiError, type PackId, type ReportsList, type ReportSummary } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useMe } from "../../lib/me";
import { tr } from "../../lib/i18n";
import { type Colors, font, useTheme } from "../../lib/theme";

const rupees = (paise: number) => `₹${Math.round(paise / 100)}`;

/** Reports: deep readings from your full chart, unlocked with report credits. */
export default function Reports() {
  const { session, ready } = useAuth();
  const { colors } = useTheme();
  const s = styles(colors);
  const { order } = useLocalSearchParams<{ order?: string }>();
  const [data, setData] = useState<ReportsList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<PackId | "test" | null>(null);
  const admin = !!useMe()?.admin;
  const [orderState, setOrderState] = useState<"waiting" | "paid" | "failed" | null>(order ? "waiting" : null);

  const load = useCallback(() => {
    api
      .reports()
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : tr("Something went wrong. Please try again.")));
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace("/sign-in");
      return;
    }
    load();
  }, [ready, session, load]);

  // Back from the UPI page: wait for the bank's confirmation, then show the new credits.
  useEffect(() => {
    if (!order || !session) return;
    let stop = false;
    let tries = 0;
    const tick = async () => {
      if (stop) return;
      const p = await api.payment(order).catch(() => null);
      if (p?.status === "paid") {
        setOrderState("paid");
        track("reports/pack-paid");
        load();
        return;
      }
      if (p && p.status !== "pending") return setOrderState("failed");
      if (++tries < 120) setTimeout(tick, 5000);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [order, session, load]);

  const buy = async (pack: PackId, test = false) => {
    setPaying(test ? "test" : pack);
    setError(null);
    try {
      track(`reports/buy-${pack}`);
      const r = await api.pay(pack, test);
      if (Platform.OS === "web" && globalThis.location) globalThis.location.assign(r.checkoutUrl);
      else await Linking.openURL(r.checkoutUrl);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tr("Something went wrong. Please try again."));
    } finally {
      setPaying(null);
    }
  };

  return (
    <Shell>
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.crumb}>{tr("KOSMIK / REPORTS")}</Text>
        <Text style={s.title}>{tr("Reports")}</Text>
        <Text style={s.lead}>{tr("Deep, one-time readings prepared from your full chart, kept for you to come back to.")}</Text>

        {orderState === "waiting" ? (
          <View style={[s.banner, { borderColor: colors.accent }]} testID="order-waiting">
            <ActivityIndicator color={colors.accent} />
            <Text style={s.bannerText}>{tr("Waiting for your payment to be confirmed. Your credits appear here by themselves.")}</Text>
          </View>
        ) : orderState === "paid" ? (
          <View style={[s.banner, { borderColor: colors.success }]}>
            <Text style={s.bannerText}>✓ {tr("Payment received. Your report credits are ready.")}</Text>
          </View>
        ) : orderState === "failed" ? (
          <View style={[s.banner, { borderColor: colors.danger }]}>
            <Text style={s.bannerText}>{tr("This payment wasn’t completed")}</Text>
          </View>
        ) : null}

        {error ? <Text style={s.error}>{error}</Text> : null}
        {!data ? (
          error ? null : <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : (
          <>
            <View style={s.credits} testID="report-credits">
              <View style={{ flex: 1, minWidth: 220, gap: 4 }}>
                <Text style={s.creditsTitle}>
                  {data.credits > 0
                    ? tr(data.credits === 1 ? "You have 1 report credit" : "You have {v0} report credits", { v0: data.credits })
                    : tr("No report credits left")}
                </Text>
                <Text style={s.muted}>
                  {data.credits > 0 ? tr("Open any report below to unlock it.") : tr("Buy a pack to unlock any report below.")}
                </Text>
              </View>
              <View style={s.packs}>
                {data.packs.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => buy(p.id)}
                    disabled={paying !== null}
                    style={[s.pack, p.id === "r3" && s.packBest]}
                    accessibilityRole="button"
                    accessibilityLabel={`Buy ${p.name} for ${rupees(p.amountPaise)}`}
                  >
                    {paying === p.id ? (
                      <ActivityIndicator color={colors.text} />
                    ) : (
                      <>
                        <Text style={s.packName}>{tr(p.name)}</Text>
                        <Text style={s.packPrice}>{rupees(p.amountPaise)}</Text>
                      </>
                    )}
                  </Pressable>
                ))}
                {admin ? (
                  <Pressable
                    onPress={() => buy("r1", true)}
                    disabled={paying !== null}
                    style={[s.pack, { borderStyle: "dashed" }]}
                    accessibilityRole="button"
                    accessibilityLabel="Admin test: 1 report for ₹1"
                    testID="test-pack"
                  >
                    {paying === "test" ? (
                      <ActivityIndicator color={colors.text} />
                    ) : (
                      <>
                        <Text style={s.packName}>Test · admin</Text>
                        <Text style={s.packPrice}>₹1</Text>
                      </>
                    )}
                  </Pressable>
                ) : null}
              </View>
            </View>

            {data.groups.map((g) => {
              const items = data.reports.filter((r) => r.group === g.key);
              if (!items.length) return null;
              return (
                <View key={g.key} style={{ gap: 14 }}>
                  <View style={s.groupRow}>
                    <Text style={s.group}>{tr(g.title).toUpperCase()}</Text>
                    <View style={s.groupLine} />
                  </View>
                  <View style={s.grid}>
                    {items.map((r) => (
                      <ReportCard key={r.key} r={r} s={s} />
                    ))}
                  </View>
                </View>
              );
            })}
            <Text style={[s.muted, { marginTop: 8 }]}>
              {tr("One credit unlocks one report for good. Prices include GST, paid once by UPI.")}
            </Text>
          </>
        )}
      </ScrollView>
    </Shell>
  );
}

function ReportCard({ r, s }: { r: ReportSummary; s: ReturnType<typeof styles> }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/reports/[key]", params: { key: r.key } })}
      style={({ pressed }) => [s.card, r.ayurveda && s.cardAyur, pressed && { opacity: 0.85 }]}
      accessibilityRole="link"
      accessibilityLabel={`${r.title} report${r.owned ? ", yours" : ", locked"}`}
      testID={`report-${r.key}`}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={s.iconTile}>
          <Text style={{ fontSize: 22 }}>{r.icon}</Text>
        </View>
        {r.badge ? (
          <Text style={[s.badge, r.badge === "trending" ? s.badgeHot : s.badgeNew]}>
            {tr(r.badge === "trending" ? "TRENDING" : "NEW")}
          </Text>
        ) : null}
      </View>
      <Text style={s.cardTitle}>{tr(r.title)}</Text>
      <Text style={s.cardTag}>{tr(r.tagline)}</Text>
      <View style={s.cardFoot}>
        <Text style={[s.mono, r.owned && { color: s.owned.color }]}>{r.owned ? `✓ ${tr("YOURS")}` : `🔒 ${tr("LOCKED")}`}</Text>
        <Text style={s.mono}>{tr("OPEN")} →</Text>
      </View>
    </Pressable>
  );
}

const styles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: 24, paddingTop: 24, gap: 18, maxWidth: 1080, width: "100%", alignSelf: "center" },
    crumb: { color: c.muted, fontFamily: font.mono, fontSize: 12, letterSpacing: 3 },
    title: { color: c.text, fontFamily: font.display, fontSize: 34, lineHeight: 42, marginTop: -8 },
    lead: { color: c.muted, fontFamily: font.body, fontSize: 15, lineHeight: 23, marginTop: -10 },
    banner: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 16, padding: 16, backgroundColor: c.surface },
    bannerText: { flex: 1, color: c.text, fontFamily: font.medium, fontSize: 15 },
    error: { color: c.danger, fontFamily: font.medium, fontSize: 15 },
    credits: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 18,
      padding: 18,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: `${c.primary}66`,
      backgroundColor: `${c.primary}1c`,
    },
    creditsTitle: { color: c.text, fontFamily: font.display, fontSize: 20 },
    muted: { color: c.muted, fontFamily: font.body, fontSize: 14, lineHeight: 21 },
    packs: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    pack: {
      minWidth: 112,
      alignItems: "center",
      gap: 2,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
    },
    packBest: { borderColor: c.primary, backgroundColor: c.primary },
    packName: { color: c.text, fontFamily: font.semibold, fontSize: 12 },
    packPrice: { color: c.text, fontFamily: font.display, fontSize: 17 },
    groupRow: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 10 },
    group: { color: c.muted, fontFamily: font.mono, fontSize: 12, letterSpacing: 3 },
    groupLine: { flex: 1, height: 1, backgroundColor: c.line },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
    card: {
      flexBasis: 220,
      flexGrow: 1,
      maxWidth: 300,
      minHeight: 190,
      gap: 6,
      padding: 18,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
    },
    cardAyur: { borderColor: "#3FB68B66" },
    iconTile: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", marginBottom: 8 },
    badge: { fontFamily: font.mono, fontSize: 9, letterSpacing: 1.4, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, overflow: "hidden" },
    badgeHot: { backgroundColor: c.primary, color: c.onPrimary },
    badgeNew: { borderWidth: 1, borderColor: c.accent, color: c.accent },
    cardTitle: { color: c.text, fontFamily: font.display, fontSize: 19 },
    cardTag: { flex: 1, color: c.muted, fontFamily: font.body, fontSize: 13, lineHeight: 19 },
    cardFoot: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12, marginTop: 6 },
    mono: { color: c.muted, fontFamily: font.mono, fontSize: 10, letterSpacing: 1.8 },
    owned: { color: c.success },
  });
