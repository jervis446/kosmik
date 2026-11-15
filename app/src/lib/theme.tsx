import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";

/** Kosmik's palette. Night: deep plum-black with a magenta accent and warm gold highlights. */
const dark = {
  bg: "#0A070D",
  surface: "rgba(24,17,30,0.88)",
  surface2: "#221829",
  line: "rgba(232,180,215,0.13)",
  text: "#F7EEF4",
  muted: "#A99BB1",
  primary: "#B54A84",
  primarySoft: "rgba(181,74,132,0.18)",
  onPrimary: "#FFFFFF",
  accent: "#E8A65A",
  accentSoft: "rgba(232,166,90,0.14)",
  /** Planets, houses and dates picked out in answers. */
  highlight: "#EBA3CB",
  success: "#4ADE80",
  danger: "#F87171",
};

/** Day: warm paper with the same plum accent. */
const light: typeof dark = {
  bg: "#FFF9F4",
  surface: "rgba(255,255,255,0.92)",
  surface2: "#F8EEF3",
  line: "rgba(58,22,44,0.12)",
  text: "#24121C",
  muted: "#6E5A66",
  primary: "#8E2F63",
  primarySoft: "rgba(142,47,99,0.10)",
  onPrimary: "#FFFFFF",
  accent: "#C2620E",
  accentSoft: "rgba(194,98,14,0.10)",
  highlight: "#9C2F6B",
  success: "#15803D",
  danger: "#B91C1C",
};

export type Colors = typeof dark;
export type ThemePref = "system" | "light" | "dark";

export const font = {
  body: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  heavy: "PlusJakartaSans_800ExtraBold",
  verse: "NotoSerifDevanagari_500Medium",
  /** Headings. */
  display: "Fraunces_500Medium",
  /** Small spaced-out labels. */
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};

type Ctx = {
  colors: Colors;
  isDark: boolean;
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
};
const ThemeCtx = createContext<Ctx | null>(null);
const KEY = "kosmik/theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>("system");

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === "light" || v === "dark" || v === "system") setPrefState(v);
      })
      .catch(() => {});
  }, []);

  const value = useMemo(() => {
    const isDark = pref === "system" ? system !== "light" : pref === "dark";
    return {
      colors: isDark ? dark : light,
      isDark,
      pref,
      setPref: (p: ThemePref) => {
        setPrefState(p);
        AsyncStorage.setItem(KEY, p).catch(() => {});
      },
    };
  }, [pref, system]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
