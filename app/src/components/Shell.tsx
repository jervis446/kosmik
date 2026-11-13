import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useShell } from "../lib/shell";
import { type Colors, font, useTheme } from "../lib/theme";
import { Sidebar } from "./Sidebar";

/** Chat layout: sidebar on the left (a drawer on phones) and the conversation on the right. */
export function Shell({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const { colors, isDark, setPref } = useTheme();
  const shell = useShell();
  const s = styles(colors);

  return (
    <SafeAreaView
      style={{ flex: 1, flexDirection: "row", backgroundColor: colors.bg }}
      edges={["top", "bottom"]}
    >
      {shell.wide ? (
        <View style={s.sideWide}>
          <Sidebar />
        </View>
      ) : null}

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.top}>
          {!shell.wide ? (
            <Pressable
              onPress={shell.openDrawer}
              style={s.icon}
              accessibilityRole="button"
              accessibilityLabel="Open menu"
            >
              <Text style={s.iconText}>☰</Text>
            </Pressable>
          ) : null}
          <Text style={s.title} numberOfLines={1}>
            {title ?? "Kosmik"}
          </Text>
          <Pressable
            onPress={() => setPref(isDark ? "light" : "dark")}
            style={s.icon}
            accessibilityRole="button"
            accessibilityLabel={isDark ? "Use light theme" : "Use dark theme"}
          >
            <Text style={s.iconText}>{isDark ? "☀" : "☾"}</Text>
          </Pressable>
          {!shell.wide ? (
            <Pressable
              onPress={() => shell.newChat()}
              style={s.icon}
              accessibilityRole="button"
              accessibilityLabel="New chat"
            >
              <Text style={s.iconText}>✎</Text>
            </Pressable>
          ) : null}
        </View>
        {children}
      </View>

      {shell.drawerOpen ? (
        <View style={StyleSheet.absoluteFill}>
          <Pressable
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0,0,0,0.45)" },
            ]}
            onPress={shell.closeDrawer}
            accessibilityLabel="Close menu"
          />
          <SafeAreaView style={s.drawer} edges={["top", "bottom", "left"]}>
            <Sidebar />
          </SafeAreaView>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = (c: Colors) =>
  StyleSheet.create({
    sideWide: { width: 280, borderRightWidth: 1, borderRightColor: c.line },
    drawer: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      width: "84%",
      maxWidth: 320,
      backgroundColor: c.surface,
    },
    top: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      minHeight: 52,
    },
    title: {
      flex: 1,
      color: c.text,
      fontFamily: font.bold,
      fontSize: 17,
      paddingHorizontal: 6,
    },
    icon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    iconText: { color: c.text, fontSize: 20 },
  });
