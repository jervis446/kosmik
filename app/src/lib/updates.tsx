import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { type Colors, font, useTheme } from "./theme";

const read = () =>
  fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { release?: string } | null) => j?.release ?? null)
    .catch(() => null);

/** True once a newer Kosmik has been deployed than the one this tab loaded. */
export function useNewVersion(): boolean {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    let mine: string | null = null;
    let live = true;
    read().then((v) => (mine = v));
    const check = () =>
      read().then((v) => {
        if (live && mine && v && v !== mine) setStale(true);
      });
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    const t = setInterval(check, 5 * 60_000);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(t);
    };
  }, []);
  return stale;
}

/** The "new version" pill. */
export function UpdateBanner() {
  const stale = useNewVersion();
  const { colors } = useTheme();
  const s = styles(colors);
  if (!stale) return null;
  return (
    <View style={s.wrap} pointerEvents="box-none">
      <Pressable
        onPress={() => globalThis.location?.reload()}
        style={s.pill}
        accessibilityRole="button"
      >
        <Text style={s.text}>✦ Kosmik just got better · Refresh</Text>
      </Pressable>
    </View>
  );
}

const styles = (c: Colors) =>
  StyleSheet.create({
    wrap: {
      position: "absolute",
      top: 10,
      left: 0,
      right: 0,
      alignItems: "center",
      zIndex: 50,
    },
    pill: {
      backgroundColor: c.primary,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 8,
      shadowColor: c.primary,
      shadowOpacity: 0.5,
      shadowRadius: 14,
    },
    text: { color: c.onPrimary, fontFamily: font.semibold, fontSize: 14 },
  });
