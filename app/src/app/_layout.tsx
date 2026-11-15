// Import single weights: the package entry points pull in every weight (about 3 MB of fonts).
import { Fraunces_500Medium } from "@expo-google-fonts/fraunces/500Medium";
import { NotoSerifDevanagari_500Medium } from "@expo-google-fonts/noto-serif-devanagari/500Medium";
import { PlusJakartaSans_400Regular } from "@expo-google-fonts/plus-jakarta-sans/400Regular";
import { PlusJakartaSans_500Medium } from "@expo-google-fonts/plus-jakarta-sans/500Medium";
import { PlusJakartaSans_600SemiBold } from "@expo-google-fonts/plus-jakarta-sans/600SemiBold";
import { PlusJakartaSans_700Bold } from "@expo-google-fonts/plus-jakarta-sans/700Bold";
import { PlusJakartaSans_800ExtraBold } from "@expo-google-fonts/plus-jakarta-sans/800ExtraBold";
import { useFonts } from "expo-font";
import { type ErrorBoundaryProps, Stack, usePathname } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { pageView, reportError, startAnalytics } from "../lib/analytics";
import { UpdateBanner } from "../lib/updates";

import { AuthProvider } from "../lib/auth";
import { ShellProvider } from "../lib/shell";
import { ThemeProvider, useTheme } from "../lib/theme";

function Shell() {
  const { colors, isDark } = useTheme();
  const path = usePathname();
  useEffect(() => startAnalytics(), []);
  useEffect(() => pageView(path), [path]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <UpdateBanner />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
    </View>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    NotoSerifDevanagari_500Medium,
    Fraunces_500Medium,
  });
  if (!loaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0A070D",
        }}
      >
        <ActivityIndicator color="#B54A84" />
      </View>
    );
  }
  return (
    <ThemeProvider>
      <AuthProvider>
        <ShellProvider>
          <Shell />
        </ShellProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

/** Shown if a screen crashes: the error is reported, and the person can try again. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => reportError("render", error.message, error.stack), [error]);
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: 24,
        backgroundColor: "#0A070D",
      }}
    >
      <Text style={{ color: "#F5F3FF", fontSize: 18, textAlign: "center" }}>
        Something went wrong on this screen. It has been reported.
      </Text>
      <Pressable
        onPress={retry}
        accessibilityRole="button"
        style={{
          backgroundColor: "#B54A84",
          borderRadius: 999,
          paddingHorizontal: 20,
          paddingVertical: 12,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 15 }}>Try again</Text>
      </Pressable>
    </View>
  );
}
