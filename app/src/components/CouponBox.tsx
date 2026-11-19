import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { track } from "../lib/analytics";
import { api, ApiError } from "../lib/api";
import { tr } from "../lib/i18n";
import { type Colors, font, useTheme } from "../lib/theme";

/**
 * "Have a coupon?" on the Reports page. Shown only when the server says this account can use one
 * (an IIM Indore sign-in while a coupon is running) and hasn't yet. The code is checked on the server.
 */
export function CouponBox({ onRedeemed }: { onRedeemed: () => void }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let stopped = false;
    api
      .couponStatus()
      .then((c) => !stopped && setShow(c.eligible && !c.used))
      .catch(() => {});
    return () => {
      stopped = true;
    };
  }, []);

  if (done) {
    return (
      <View style={[s.box, { borderColor: colors.success }]} testID="coupon-done">
        <Text style={[s.title, { color: colors.success }]}>✓ {tr("Coupon applied: 1 free report credit added.")}</Text>
        <Text style={s.muted}>{tr("Open any report below to unlock it.")}</Text>
      </View>
    );
  }
  if (!show) return null;

  const apply = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.redeemCoupon(code.trim());
      track("reports/coupon-redeemed");
      setDone(true);
      onRedeemed();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tr("Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} style={s.link} accessibilityRole="button" testID="coupon-open">
        <Text style={s.linkText}>{tr("Have a coupon? Get the ₹99 report free →")}</Text>
      </Pressable>
    );
  }

  return (
    <View style={s.box} testID="coupon-box">
      <Text style={s.title}>{tr("Do you have a coupon?")}</Text>
      <Text style={s.muted}>{tr("Enter it to unlock one report for free.")}</Text>
      <View style={s.row}>
        <TextInput
          value={code}
          onChangeText={(t) => {
            setCode(t);
            setError(null);
          }}
          onSubmitEditing={apply}
          placeholder={tr("Coupon code")}
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={40}
          style={s.input}
          accessibilityLabel={tr("Coupon code")}
          testID="coupon-input"
        />
        <Pressable onPress={apply} disabled={busy || !code.trim()} style={[s.apply, (busy || !code.trim()) && { opacity: 0.5 }]} accessibilityRole="button" testID="coupon-apply">
          {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={s.applyText}>{tr("Apply")}</Text>}
        </Pressable>
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

const styles = (c: Colors) =>
  StyleSheet.create({
    link: { alignSelf: "flex-start", paddingVertical: 4 },
    linkText: { color: c.highlight, fontFamily: font.semibold, fontSize: 14 },
    box: { borderWidth: 1, borderColor: c.line, borderRadius: 18, padding: 16, gap: 8, backgroundColor: c.surface },
    title: { color: c.text, fontFamily: font.semibold, fontSize: 15 },
    muted: { color: c.muted, fontFamily: font.body, fontSize: 14 },
    row: { flexDirection: "row", gap: 8, alignItems: "center" },
    input: {
      flex: 1,
      minWidth: 0,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: c.text,
      fontFamily: font.medium,
      fontSize: 15,
      backgroundColor: c.surface2,
    },
    apply: { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 18, minWidth: 80, alignItems: "center" },
    applyText: { color: c.onPrimary, fontFamily: font.bold, fontSize: 15 },
    error: { color: c.danger, fontFamily: font.medium, fontSize: 14 },
  });
