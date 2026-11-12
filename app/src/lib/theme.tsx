import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";

/** Kosmik's palette, shared with the website. Dark first. */
const dark = {
  bg: "#0B0A14",
  surface: "#16142A",
  surface2: "#1E1B38",
  line: "rgba(167,163,194,0.18)",
  text: "#F5F3FF",
  muted: "#A7A3C2",
  primary: "#8B5CF6",
  primarySoft: "rgba(139,92,246,0.18)",
  onPrimary: "#FFFFFF",
  accent: "#F59E0B",
  accentSoft: "rgba(245,158,11,0.16)",
  success: "#22C55E",
  danger: "#F87171",
};

const light: typeof dark = {
  bg: "#FFFBF5",
  surface: "#FFFFFF",
  surface2: "#F6F1FF",
  line: "rgba(26,21,48,0.12)",
  text: "#1A1530",
  muted: "#5E5878",
  primary: "#6D28D9",
  primarySoft: "rgba(109,40,217,0.10)",
  onPrimary: "#FFFFFF",
  accent: "#EA580C",
  accentSoft: "rgba(234,88,12,0.10)",
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
