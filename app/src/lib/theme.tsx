import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";

/** Kosmik's palette. Night: deep aubergine-black, a magenta-rose primary and saffron (kesari) gold. */
const dark = {
  bg: "#0C0810",
  surface: "rgba(27,16,29,0.9)",
  surface2: "#201324",
  line: "rgba(240,170,210,0.13)",
  text: "#FBF1F6",
  muted: "#B09AAD",
  primary: "#C2407F",
  primarySoft: "rgba(194,64,127,0.18)",
  onPrimary: "#FFFFFF",
  accent: "#F2A640",
  accentSoft: "rgba(242,166,64,0.14)",
  /** Planets, houses and dates picked out in answers. */
  highlight: "#F0A3C8",
  success: "#4ADE80",
  danger: "#F87171",
};

/** Day: warm paper with the same rose and saffron. */
const light: typeof dark = {
  bg: "#FFF8F3",
  surface: "rgba(255,255,255,0.94)",
  surface2: "#FBEFF4",
  line: "rgba(70,20,46,0.12)",
  text: "#26101C",
  muted: "#6F5866",
  primary: "#A0285F",
  primarySoft: "rgba(160,40,95,0.10)",
  onPrimary: "#FFFFFF",
  accent: "#C46A12",
  accentSoft: "rgba(196,106,18,0.10)",
  highlight: "#A0285F",
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
/** Shared with the landing page (same key on the web), so the two always show the same theme. */
const KEY = "kosmik/theme";
const isPref = (v: unknown): v is ThemePref => v === "light" || v === "dark" || v === "system";

/** On the web the saved choice is read at once, so the first frame is already in the right theme. */
function savedOnWeb(): ThemePref | null {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) ?? localStorage.getItem("kosmik-theme") : null;
    return isPref(v) ? v : null;
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>(() => savedOnWeb() ?? "system");

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (isPref(v)) setPrefState(v);
      })
      .catch(() => {});
    // A change made on the landing page or in another tab shows here too.
    if (typeof window === "undefined" || !window.addEventListener) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setPrefState(isPref(e.newValue) ? e.newValue : "system");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
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
