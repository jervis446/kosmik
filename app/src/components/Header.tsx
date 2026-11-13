import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { font, useTheme } from "../lib/theme";

/** Top bar for pages outside the chat (account, premium, sign-in, legal): back, title, theme. */
export function Header({ title, back }: { title?: string; back?: boolean }) {
  const { colors, isDark, setPref } = useTheme();
  const s = StyleSheet.create({
    bar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    brand: {
      color: colors.muted,
      fontFamily: font.semibold,
      fontSize: 12,
      letterSpacing: 1,
    },
    name: { color: colors.text, fontFamily: font.heavy, fontSize: 20 },
    btn: {
      minWidth: 44,
      minHeight: 44,
      paddingHorizontal: 10,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 999,
    },
    btnText: { color: colors.text, fontFamily: font.semibold, fontSize: 14 },
  });
  return (
    <View style={s.bar}>
      {back ? (
        <Pressable
          style={s.btn}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={[s.btnText, { fontSize: 20 }]}>‹</Text>
        </Pressable>
      ) : null}
      <Pressable
        style={{ flex: 1 }}
        onPress={() => router.push("/")}
        accessibilityRole="link"
        accessibilityLabel="Kosmik home"
      >
        <Text style={s.brand}>ASANOHA</Text>
        <Text style={s.name} numberOfLines={1}>
          {title ?? "Kosmik"}
        </Text>
      </Pressable>
      <Pressable
        style={s.btn}
        onPress={() => setPref(isDark ? "light" : "dark")}
        accessibilityRole="button"
        accessibilityLabel={isDark ? "Use light theme" : "Use dark theme"}
      >
        <Text style={s.btnText}>{isDark ? "☀" : "☾"}</Text>
      </Pressable>
    </View>
  );
}
