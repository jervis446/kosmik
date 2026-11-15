import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { api, ApiError } from "../lib/api";
import { type Colors, font, useTheme } from "../lib/theme";
import { track } from "../lib/analytics";

const message = (e: unknown) =>
  e instanceof ApiError ? e.message : "Something went wrong. Please try again.";

/**
 * Asks for a WhatsApp number once, before the first question. It can't be skipped: one number
 * per account keeps the free questions fair.
 */
export function PhoneForm({ onDone }: { onDone: (phone: string) => void }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const send = () =>
    run(async () => {
      setSentTo((await api.startPhone(phone)).phone);
      track("phone/code-sent");
      setCode("");
    });
  const verify = () =>
    run(async () => {
      const r = await api.verifyPhone(code);
      track("phone/verified");
      onDone(r.phone);
    });

  return (
    <View style={{ gap: 12 }}>
      <Text style={s.glyph}>✆</Text>
      <Text style={s.title} role="heading">
        Add your WhatsApp number
      </Text>
      <Text style={s.small}>
        Kosmik sends a 6-digit code on WhatsApp. One number per account keeps
        the free questions fair. We never share it or send marketing.
      </Text>

      {sentTo === null ? (
        <>
          <View style={s.phoneRow}>
            <Text style={s.prefix}>+91</Text>
            <TextInput
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/[^\d ]/g, ""))}
              placeholder="98765 43210"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
              autoComplete="tel"
              maxLength={12}
              style={s.input}
              accessibilityLabel="WhatsApp number"
              onSubmitEditing={send}
            />
          </View>
          <Pressable
            onPress={send}
            disabled={busy || phone.replace(/\D/g, "").length !== 10}
            style={[
              s.primary,
              (busy || phone.replace(/\D/g, "").length !== 10) && {
                opacity: 0.4,
              },
            ]}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={s.primaryText}>Send code on WhatsApp</Text>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={s.small}>
            Code sent to {sentTo} on WhatsApp. It may take a minute.
          </Text>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit code"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            style={[s.input, s.codeInput]}
            accessibilityLabel="WhatsApp code"
            onSubmitEditing={verify}
          />
          <Pressable
            onPress={verify}
            disabled={busy || code.length !== 6}
            style={[s.primary, (busy || code.length !== 6) && { opacity: 0.4 }]}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={s.primaryText}>Verify</Text>
            )}
          </Pressable>
          <View style={{ flexDirection: "row", gap: 16 }}>
            <Pressable
              onPress={send}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={s.link}>Send again</Text>
            </Pressable>
            <Pressable
              onPress={() => setSentTo(null)}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={s.link}>Change number</Text>
            </Pressable>
          </View>
        </>
      )}
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

export function PhoneGate({
  visible,
  onDone,
  onSignOut,
  onClose,
}: {
  visible: boolean;
  onDone: (phone: string) => void;
  /** Shown when the number is mandatory. */
  onSignOut?: () => void;
  /** Shown when the number is optional (from Account). */
  onClose?: () => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.backdrop}>
        <View style={s.sheet} accessibilityViewIsModal testID="phone-gate">
          <PhoneForm onDone={onDone} />
          <Pressable onPress={onClose ?? onSignOut} accessibilityRole="button">
            <Text style={[s.small, { textDecorationLine: "underline" }]}>
              {onClose ? "Not now" : "Sign out"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = (c: Colors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center",
      padding: 16,
    },
    sheet: {
      backgroundColor: c.surface,
      borderRadius: 24,
      padding: 22,
      gap: 12,
      width: "100%",
      maxWidth: 420,
      alignSelf: "center",
    },
    glyph: { fontSize: 30, color: c.success },
    title: { color: c.text, fontFamily: font.display, fontSize: 26 },
    small: {
      color: c.muted,
      fontFamily: font.body,
      fontSize: 14,
      lineHeight: 20,
    },
    phoneRow: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 14,
      backgroundColor: c.bg,
      paddingLeft: 12,
    },
    prefix: { color: c.text, fontFamily: font.bold, fontSize: 16 },
    input: {
      outlineWidth: 0,
      flex: 1,
      color: c.text,
      fontFamily: font.medium,
      fontSize: 17,
      minHeight: 50,
      paddingHorizontal: 10,
    },
    codeInput: {
      flex: 0,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 14,
      backgroundColor: c.bg,
      letterSpacing: 6,
      textAlign: "center",
      fontSize: 22,
    },
    primary: {
      backgroundColor: c.primary,
      borderRadius: 999,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryText: { color: c.onPrimary, fontFamily: font.bold, fontSize: 15 },
    link: { color: c.primary, fontFamily: font.semibold, fontSize: 14 },
    error: { color: c.danger, fontFamily: font.semibold, fontSize: 14 },
  });
