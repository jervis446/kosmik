import { Redirect } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../lib/auth";
import { useShell } from "../lib/shell";
import { type Colors, font, useTheme } from "../lib/theme";
import { Sidebar } from "./Sidebar";

const SIDE_MIN = 220;
const SIDE_MAX = 440;
const SIDE_DEFAULT = 280;
/** Dragging the sidebar narrower than this closes it, as in ChatGPT. */
const SIDE_COLLAPSE = 170;
const SIDE_KEY = "kosmik-sidebar";

type SideState = { width: number; collapsed: boolean };

function loadSide(): SideState {
  try {
    const saved = JSON.parse(
      globalThis.localStorage?.getItem(SIDE_KEY) ?? "null",
    );
    if (saved && typeof saved.width === "number")
      return {
        width: Math.min(SIDE_MAX, Math.max(SIDE_MIN, saved.width)),
        collapsed: !!saved.collapsed,
      };
  } catch {
    // no saved width
  }
  return { width: SIDE_DEFAULT, collapsed: false };
}

function saveSide(state: SideState) {
  try {
    globalThis.localStorage?.setItem(SIDE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable: the width just isn't remembered
  }
}

const setSelecting = (on: boolean) => {
  const body = globalThis.document?.body;
  if (body) body.style.userSelect = on ? "" : "none";
};

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
  const { session, ready } = useAuth();
  const s = styles(colors);
  const [side, setSide] = useState<SideState>(loadSide);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [handleHover, setHandleHover] = useState(false);
  const update = (next: SideState) => {
    setSide(next);
    saveSide(next);
  };
  const [drag] = useState(() => {
    // The width when the drag began (the saved width is always the current one).
    let start = SIDE_DEFAULT;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        start = loadSide().width;
        setSelecting(false);
        setDragWidth(start);
      },
      onPanResponderMove: (_e, g) =>
        setDragWidth(Math.min(SIDE_MAX, start + g.dx)),
      onPanResponderRelease: (_e, g) => {
        setSelecting(true);
        setDragWidth(null);
        const w = start + g.dx;
        if (w < SIDE_COLLAPSE) update({ width: start, collapsed: true });
        else
          update({
            width: Math.min(SIDE_MAX, Math.max(SIDE_MIN, w)),
            collapsed: false,
          });
      },
      onPanResponderTerminate: () => {
        setSelecting(true);
        setDragWidth(null);
      },
    });
  });
  const showSide = shell.wide && !side.collapsed;
  const sideWidth =
    dragWidth === null ? side.width : Math.max(SIDE_COLLAPSE - 20, dragWidth);
  const closing = dragWidth !== null && dragWidth < SIDE_COLLAPSE;

  // Kosmik works only when signed in.
  if (!ready)
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <SafeAreaView
      style={{ flex: 1, flexDirection: "row", backgroundColor: colors.bg }}
      edges={["top", "bottom"]}
    >
      {showSide ? (
        <View
          style={[s.sideWide, { width: sideWidth, opacity: closing ? 0.5 : 1 }]}
          testID="sidebar"
        >
          <Sidebar onCollapse={() => update({ ...side, collapsed: true })} />
          <View
            {...drag.panHandlers}
            onPointerEnter={() => setHandleHover(true)}
            onPointerLeave={() => setHandleHover(false)}
            style={[s.handle, { cursor: "col-resize" } as object]}
            accessibilityRole="adjustable"
            accessibilityLabel="Resize sidebar"
            testID="sidebar-handle"
          >
            <View
              style={[
                s.handleLine,
                (handleHover || dragWidth !== null) && {
                  backgroundColor: colors.primary,
                },
              ]}
            />
          </View>
        </View>
      ) : null}

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.top}>
          {shell.wide && side.collapsed ? (
            <Pressable
              onPress={() => update({ ...side, collapsed: false })}
              style={s.icon}
              accessibilityRole="button"
              accessibilityLabel="Open sidebar"
            >
              <Text style={s.iconText}>☰</Text>
            </Pressable>
          ) : null}
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
          {!showSide ? (
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
    sideWide: { borderRightWidth: 1, borderRightColor: c.line },
    handle: {
      position: "absolute",
      top: 0,
      bottom: 0,
      right: -5,
      width: 10,
      alignItems: "center",
      zIndex: 10,
    },
    handleLine: { width: 2, flex: 1, backgroundColor: "transparent" },
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
