import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Header } from "../components/Header";
import { useAuth } from "../lib/auth";
import { authConfigured } from "../lib/supabase";
import { font, useTheme } from "../lib/theme";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignIn() {
  const { session, sendCode, verifyCode, signInWithGoogle } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session) router.replace("/chat");
  }, [session]);

  const s = StyleSheet.create({
    google: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      minHeight: 50,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
    },
    googleG: { color: "#4285F4", fontFamily: font.heavy, fontSize: 18 },
    googleText: { color: colors.text, fontFamily: font.bold, fontSize: 16 },
    wrap: {
      padding: 24,
      gap: 14,
      maxWidth: 440,
      width: "100%",
      alignSelf: "center",
    },
    h: { color: colors.text, fontFamily: font.heavy, fontSize: 26 },
    p: {
      color: colors.muted,
      fontFamily: font.body,
      fontSize: 15,
      lineHeight: 22,
    },
    input: {
      color: colors.text,
      fontFamily: font.medium,
      fontSize: 17,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      paddingHorizontal: 14,
      minHeight: 52,
    },
    btn: {
      backgroundColor: colors.primary,
      borderRadius: 999,
      minHeight: 52,
      alignItems: "center",
      justifyContent: "center",
    },
    btnText: { color: colors.onPrimary, fontFamily: font.bold, fontSize: 16 },
    link: {
      color: colors.primary,
      fontFamily: font.semibold,
      fontSize: 15,
      paddingVertical: 10,
    },
    error: { color: colors.danger, fontFamily: font.semibold, fontSize: 14 },
  });

  const submitEmail = async () => {
    if (!EMAIL.test(email.trim()))
      return setError("Please enter a valid email address.");
    setError(null);
    setBusy(true);
    try {
      await sendCode(email);
      setStep("code");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (!/^\d{6}$/.test(code.trim()))
      return setError("Enter the 6-digit code from the email.");
    setError(null);
    setBusy(true);
    try {
      await verifyCode(email, code);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
      <Header title="Sign in" back />
      <View style={s.wrap}>
        <Text style={s.h}>
          {step === "email"
            ? "Sign in with your Asanoha account"
            : "Check your email"}
        </Text>
        <Text style={s.p}>
          {step === "email"
            ? "One account for every Asanoha app. Continue with Google, or we’ll email you a 6-digit code. You get 11 free questions a week and your chats are saved."
            : `We sent a code to ${email.trim()}. It expires in a few minutes.`}
        </Text>
        {!authConfigured ? (
          <Text style={s.error}>Sign-in isn’t set up in this build.</Text>
        ) : null}
        {step === "email" && Platform.OS === "web" ? (
          <>
            <Pressable
              style={s.google}
              onPress={() => {
                setError(null);
                signInWithGoogle().catch((e: Error) => setError(e.message));
              }}
              disabled={!authConfigured}
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
            >
              <Text style={s.googleG}>G</Text>
              <Text style={s.googleText}>Continue with Google</Text>
            </Pressable>
            <Text style={[s.p, { textAlign: "center" }]}>
              or use your email
            </Text>
          </>
        ) : null}
        {step === "email" ? (
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
            onSubmitEditing={submitEmail}
            accessibilityLabel="Email address"
            autoFocus
          />
        ) : (
          <TextInput
            style={[s.input, { letterSpacing: 6, fontSize: 22 }]}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            inputMode="numeric"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            onSubmitEditing={submitCode}
            accessibilityLabel="6-digit code"
            autoFocus
          />
        )}
        {error ? (
          <Text style={s.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Pressable
          style={[s.btn, busy && { opacity: 0.6 }]}
          onPress={step === "email" ? submitEmail : submitCode}
          disabled={busy || !authConfigured}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={s.btnText}>
              {step === "email" ? "Email me a code" : "Sign in"}
            </Text>
          )}
        </Pressable>
        {step === "code" ? (
          <Pressable
            onPress={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            accessibilityRole="button"
          >
            <Text style={s.link}>Use a different email</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
