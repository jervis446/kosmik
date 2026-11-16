import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { type AdminPayment, type AdminPayments as Data, api, ApiError } from "../lib/api";
import { type Colors, font, useTheme } from "../lib/theme";

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const when = (ms: number) =>
  new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const what = (p: AdminPayment) => (p.credits ? `${p.credits} report credit${p.credits === 1 ? "" : "s"}` : `Premium ${p.days} days`);
const who = (p: { name: string | null; phone: string | null; userId: string }) =>
  [p.name, p.phone].filter(Boolean).join(" · ") || `user ${p.userId.slice(0, 8)}`;

/** Owner-only: manual UPI payments to check against the bank statement, recent payments and blocked accounts. */
export function AdminPayments() {
  const { colors } = useTheme();
  const s = styles(colors);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .adminPayments()
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load payments."));
  }, []);
  useEffect(load, [load]);

  const act = async (key: string, run: () => Promise<string>) => {
    setBusy(key);
    setError(null);
    try {
      setFlash(await run());
      setConfirm(null);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That didn’t work. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <View style={s.card}>{error ? <Text style={s.error}>{error}</Text> : <ActivityIndicator color={colors.primary} />}</View>;

  return (
    <View style={{ gap: 16 }} testID="admin-payments">
      <View style={s.card}>
        <Text style={s.title}>Payments to check · {data.toCheck.length}</Text>
        <Text style={s.muted}>
          Buyers who entered a UTR got access straight away. Find each UTR in your bank statement: Approve if the money arrived,
          Decline if not (access is taken back). {data.blockAfter} declines block an account from buying.
        </Text>
        {flash ? <Text style={[s.muted, { color: colors.success }]}>{flash}</Text> : null}
        {error ? <Text style={s.error}>{error}</Text> : null}
        {data.toCheck.length === 0 ? <Text style={s.muted}>Nothing to check right now.</Text> : null}
        {data.toCheck.map((p) => (
          <View key={p.id} style={s.row} testID="payment-to-check">
            <View style={{ flex: 1, minWidth: 220, gap: 3 }}>
              <Text style={s.big}>
                {rupees(p.amountPaise)} · {what(p)}
              </Text>
              <Text style={s.mono}>UTR {p.utr ?? "—"}</Text>
              <Text style={s.muted}>
                {who(p)} · {when(p.provisionalAt ?? p.createdAt)} · {p.id}
              </Text>
              {p.declines ? <Text style={[s.muted, { color: colors.accent }]}>{p.declines} earlier decline{p.declines === 1 ? "" : "s"}</Text> : null}
            </View>
            {confirm === p.id ? (
              <View style={s.actions}>
                <Text style={[s.muted, { maxWidth: 220 }]}>Decline and take the access back?</Text>
                <Pressable
                  onPress={() => act(p.id, async () => ((await api.declinePayment(p.id)).blocked ? "Declined. That account is now blocked from buying." : "Declined and access taken back."))}
                  style={[s.btn, { backgroundColor: colors.danger }]}
                  accessibilityRole="button"
                >
                  <Text style={s.btnText}>{busy === p.id ? "…" : "Yes, decline"}</Text>
                </Pressable>
                <Pressable onPress={() => setConfirm(null)} style={s.ghost} accessibilityRole="button">
                  <Text style={s.ghostText}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <View style={s.actions}>
                <Pressable
                  onPress={() => act(p.id, async () => ((await api.approvePayment(p.id)).approved ? "Approved." : "Already handled."))}
                  disabled={busy !== null}
                  style={[s.btn, { backgroundColor: colors.success }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Approve ${p.id}`}
                >
                  <Text style={s.btnText}>{busy === p.id ? "…" : "Approve"}</Text>
                </Pressable>
                <Pressable onPress={() => setConfirm(p.id)} disabled={busy !== null} style={s.ghost} accessibilityRole="button" accessibilityLabel={`Decline ${p.id}`}>
                  <Text style={[s.ghostText, { color: colors.danger }]}>Decline</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))}
      </View>

      <View style={s.card}>
        <Text style={s.title}>Blocked accounts · {data.blocked.length}</Text>
        {data.blocked.length === 0 ? <Text style={s.muted}>No one is blocked.</Text> : null}
        {data.blocked.map((b) => (
          <View key={b.userId} style={s.row}>
            <View style={{ flex: 1, minWidth: 200, gap: 3 }}>
              <Text style={s.big}>{who(b)}</Text>
              <Text style={s.muted}>
                Blocked {when(b.blockedAt)} · {b.declines} declined payments
              </Text>
            </View>
            <Pressable
              onPress={() => act(`u-${b.userId}`, async () => ((await api.unblockPayer(b.userId)).unblocked ? "Unblocked. They can buy again." : "Already unblocked."))}
              disabled={busy !== null}
              style={s.ghost}
              accessibilityRole="button"
            >
              <Text style={s.ghostText}>{busy === `u-${b.userId}` ? "…" : "Unblock"}</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <View style={s.card}>
        <Text style={s.title}>Recent payments</Text>
        {data.recent.length === 0 ? <Text style={s.muted}>No payments yet.</Text> : null}
        {data.recent.map((p) => (
          <View key={p.id} style={s.recent}>
            <Text style={[s.pill, pillColor(p, colors)]}>{label(p)}</Text>
            <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
              <Text style={s.body}>
                {rupees(p.amountPaise)} · {what(p)} · {who(p)}
              </Text>
              <Text style={s.muted}>
                {when(p.createdAt)} · {p.id}
                {p.utr ? ` · UTR ${p.utr}` : ""}
              </Text>
              {p.note ? <Text style={[s.muted, { fontSize: 12 }]}>{p.note}</Text> : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const label = (p: AdminPayment) =>
  p.status === "paid"
    ? p.reviewed === "approved" && p.provisionalAt ? "APPROVED" : "PAID"
    : p.reviewed === "declined"
      ? "DECLINED"
      : p.status === "pending" && p.provisionalAt
        ? "TO CHECK"
        : p.status.toUpperCase();
const pillColor = (p: AdminPayment, c: Colors) => {
  const l = label(p);
  const col = l === "PAID" || l === "APPROVED" ? c.success : l === "TO CHECK" ? c.accent : l === "PENDING" ? c.muted : c.danger;
  return { color: col, borderColor: col };
};

const styles = (c: Colors) =>
  StyleSheet.create({
    card: { gap: 12, padding: 18, borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
    title: { color: c.text, fontFamily: font.display, fontSize: 20 },
    muted: { color: c.muted, fontFamily: font.body, fontSize: 13, lineHeight: 19 },
    body: { color: c.text, fontFamily: font.medium, fontSize: 14 },
    big: { color: c.text, fontFamily: font.semibold, fontSize: 16 },
    mono: { color: c.accent, fontFamily: font.mono, fontSize: 13, letterSpacing: 1 },
    error: { color: c.danger, fontFamily: font.medium, fontSize: 14 },
    row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.line },
    recent: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.line },
    actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
    btn: { borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16 },
    btnText: { color: "#FFFFFF", fontFamily: font.semibold, fontSize: 13 },
    ghost: { borderWidth: 1, borderColor: c.line, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
    ghostText: { color: c.text, fontFamily: font.semibold, fontSize: 13 },
    pill: { fontFamily: font.mono, fontSize: 10, letterSpacing: 1.2, borderWidth: 1, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8, minWidth: 84, textAlign: "center" },
  });
