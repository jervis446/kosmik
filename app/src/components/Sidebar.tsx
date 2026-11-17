import { router, usePathname } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { ChatKind, ConversationSummary } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useShell } from "../lib/shell";
import { type Colors, font, useTheme } from "../lib/theme";
import { useMe } from "../lib/me";
import { AccountMenu } from "./AccountMenu";
import { Logo } from "./Logo";
import { tr } from "../lib/i18n";

/** Ayurveda's colour: leafy green, on both themes. */
const AYUR = "#3FB68B";
const SHANTI = "#8E7CF0";

function group(chats: ConversationSummary[], now: number) {
  const day = 24 * 60 * 60 * 1000;
  const buckets: { label: string; items: ConversationSummary[] }[] = [
    { label: tr("Today"), items: [] },
    { label: tr("Previous 7 days"), items: [] },
    { label: tr("Older"), items: [] },
  ];
  for (const c of chats) {
    const age = now - c.updatedAt;
    buckets[age < day ? 0 : age < 7 * day ? 1 : 2].items.push(c);
  }
  return buckets.filter((b) => b.items.length);
}

/** ChatGPT-style sidebar: new chat, topics, your chats, and your account at the bottom. */
export function Sidebar({
  onCollapse,
  onMenuChange,
}: {
  onCollapse?: () => void;
  /** Tells the shell when the account menu opens or closes (it is wider than the sidebar). */
  onMenuChange?: (open: boolean) => void;
} = {}) {
  const { colors } = useTheme();
  const { session } = useAuth();
  const shell = useShell();
  const s = styles(colors);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | ChatKind>("all");
  const [menu, setMenuState] = useState(false);
  const setMenu = (open: boolean) => {
    setMenuState(open);
    onMenuChange?.(open);
  };
  // Which part of Kosmik is open, so it can be highlighted.
  const path = usePathname();
  const newKind = shell.newKind === "ayurveda" || shell.newKind === "shanti" ? shell.newKind : "kosmik";
  const activeKind = shell.activeId ? (shell.chats?.find((c) => c.id === shell.activeId)?.kind ?? newKind) : newKind;
  const section = path.startsWith("/reports") ? "reports" : path.startsWith("/chat") ? activeKind : null;
  // Your name from your birth details (saved, so it shows at once); otherwise your email's name.
  const name = useMe()?.name ?? null;
  const [now] = useState(() => Date.now());
  const email = session?.user.email ?? "";
  const shown = name || email.split("@")[0];

  return (
    <View
      style={s.side}
      accessibilityRole="menu"
      accessibilityLabel="Kosmik menu"
    >
      <View style={s.brandRow}>
        <Logo size={34} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={s.brand}>Kosmik</Text>
          <Text style={s.by}>
            by{" "}
            <Text style={{ color: colors.accent, fontFamily: font.heavy }}>
              asanoha
            </Text>
          </Text>
        </View>
        {shell.wide && onCollapse ? (
          <Pressable
            onPress={onCollapse}
            style={s.icon}
            accessibilityRole="button"
            accessibilityLabel="Close sidebar"
          >
            <Text style={s.iconText}>⇤</Text>
          </Pressable>
        ) : null}
        {!shell.wide ? (
          <Pressable
            onPress={shell.closeDrawer}
            style={s.icon}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
          >
            <Text style={s.iconText}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        onPress={() => shell.newChat()}
        style={({ pressed }) => [
          s.askBtn,
          section === "kosmik"
            ? { borderColor: colors.primary, backgroundColor: `${colors.primary}${pressed ? "44" : "33"}` }
            : { borderColor: colors.line, backgroundColor: pressed ? `${colors.primary}1f` : "transparent" },
        ]}
        accessibilityRole="button"
        accessibilityLabel="New chat"
        accessibilityState={{ selected: section === "kosmik" }}
      >
        <Text style={[s.askGlyph, { color: colors.highlight }]}>✦</Text>
        <Text style={[s.askText, section !== "kosmik" && { color: colors.muted }]}>{tr("Ask Kosmik")}</Text>
      </Pressable>
      <Pressable
        onPress={() => shell.newChat("ayurveda")}
        style={({ pressed }) => [
          s.askBtn,
          section === "ayurveda"
            ? { borderColor: AYUR, backgroundColor: `${AYUR}${pressed ? "40" : "2e"}` }
            : { borderColor: colors.line, backgroundColor: pressed ? `${AYUR}1a` : "transparent" },
        ]}
        accessibilityRole="button"
        accessibilityLabel="New Ayurveda chat"
        accessibilityState={{ selected: section === "ayurveda" }}
      >
        <Text style={[s.askGlyph, { color: AYUR }]}>❀</Text>
        <Text style={[s.askText, { color: section === "ayurveda" ? AYUR : colors.muted }]}>{tr("Ask Ayurveda")}</Text>
      </Pressable>
      <Pressable
        onPress={() => shell.newChat("shanti")}
        style={({ pressed }) => [
          s.askBtn,
          section === "shanti"
            ? { borderColor: SHANTI, backgroundColor: `${SHANTI}${pressed ? "40" : "2e"}` }
            : { borderColor: colors.line, backgroundColor: pressed ? `${SHANTI}1a` : "transparent" },
        ]}
        accessibilityRole="button"
        accessibilityLabel="New Shanti chat"
        accessibilityState={{ selected: section === "shanti" }}
      >
        <Text style={[s.askGlyph, { color: SHANTI }]}>☾</Text>
        <Text style={[s.askText, { color: section === "shanti" ? SHANTI : colors.muted }]}>{tr("Talk to Shanti")}</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          shell.closeDrawer();
          router.push("/reports");
        }}
        style={({ pressed }) => [
          s.navRow,
          section === "reports" && { backgroundColor: `${colors.accent}24`, borderColor: colors.accent },
          pressed && { backgroundColor: colors.surface2 },
        ]}
        accessibilityRole="link"
        accessibilityLabel="Reports"
        accessibilityState={{ selected: section === "reports" }}
      >
        <View style={s.navIcon}>
          <Text style={{ fontSize: 15 }}>📖</Text>
        </View>
        <Text style={[s.navText, section === "reports" && { color: colors.accent, fontFamily: font.semibold }]}>{tr("Reports")}</Text>
      </Pressable>

      {session && shell.chats?.length ? (
        <View style={s.filters} accessibilityRole="tablist">
          {(["all", "kosmik", "ayurveda", "shanti"] as const).map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[s.filter, filter === f && s.filterOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === f }}
            >
              <Text style={[s.filterText, filter === f && { color: colors.text }]}>
                {tr(f === "all" ? "All" : f === "kosmik" ? "Kosmik" : f === "ayurveda" ? "Ayurveda" : "Shanti")}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 2, paddingBottom: 12 }}
      >
        {session ? (
          shell.chats === null ? (
            <ActivityIndicator style={{ marginTop: 16 }} color={colors.muted} />
          ) : shell.chats.length === 0 ? (
            <Text
              style={[s.section, { textTransform: "none", letterSpacing: 0 }]}
            >
              {tr("Your chats will appear here.")}
            </Text>
          ) : (
            group(shell.chats.filter((c) => filter === "all" || (c.kind ?? "kosmik") === filter), now).map((g) => (
              <View key={g.label} style={{ gap: 2 }}>
                <Text style={s.section}>{g.label}</Text>
                {g.items.map((c) =>
                  confirming === c.id ? (
                    <View
                      key={c.id}
                      style={[s.row, { backgroundColor: colors.surface2 }]}
                    >
                      <Text style={[s.rowText, { flex: 1 }]} numberOfLines={1}>
                        {tr("Delete this chat?")}
                      </Text>
                      <Pressable
                        onPress={() => {
                          setConfirming(null);
                          shell
                            .removeChat(c.id)
                            .catch(() => shell.refreshChats());
                        }}
                        style={s.smallBtn}
                        accessibilityRole="button"
                      >
                        <Text style={[s.smallText, { color: colors.danger }]}>
                          {tr("Delete")}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setConfirming(null)}
                        style={s.smallBtn}
                        accessibilityRole="button"
                      >
                        <Text style={s.smallText}>{tr("Keep")}</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View
                      key={c.id}
                      style={[
                        s.row,
                        c.id === shell.activeId && {
                          backgroundColor: colors.primarySoft,
                        },
                      ]}
                    >
                      <Pressable
                        onPress={() => shell.openChat(c.id)}
                        style={{
                          flex: 1,
                          minHeight: 36,
                          justifyContent: "center",
                        }}
                        accessibilityRole="link"
                        accessibilityLabel={`Open chat: ${c.title}`}
                      >
                        <Text style={s.rowText} numberOfLines={1}>
                          <Text
                            style={{ color: c.kind === "ayurveda" ? AYUR : c.kind === "shanti" ? SHANTI : colors.highlight }}
                            accessibilityLabel={c.kind === "ayurveda" ? "Ayurveda chat" : c.kind === "shanti" ? "Shanti chat" : "Kosmik chat"}
                          >
                            {c.kind === "ayurveda" ? "❀ " : c.kind === "shanti" ? "☾ " : "✦ "}
                          </Text>
                          {c.title}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setConfirming(c.id)}
                        style={s.del}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete chat: ${c.title}`}
                      >
                        <Text style={s.delText}>✕</Text>
                      </Pressable>
                    </View>
                  ),
                )}
              </View>
            ))
          )
        ) : (
          <View style={s.guestNote}>
            <Text style={s.rowText}>
              {tr("Sign in to save your chats and get 11 free questions a week.")}
            </Text>
          </View>
        )}
      </ScrollView>

      {session ? (
        <Pressable
          onPress={() => setMenu(!menu)}
          style={[s.account, menu && { backgroundColor: colors.surface2 }]}
          accessibilityRole="button"
          accessibilityLabel="Account"
          accessibilityState={{ expanded: menu }}
        >
          <View style={s.avatar}>
            <Text style={s.avatarText}>{(shown[0] ?? "?").toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.rowText, { fontFamily: font.semibold }]} numberOfLines={1} testID="account-name">
              {shown}
            </Text>
            <Text style={s.small}>{tr("Account · Upgrade")}</Text>
          </View>
          <Text style={s.small}>{menu ? "⌄" : "⌃"}</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => {
            shell.closeDrawer();
            router.push("/sign-in");
          }}
          style={[
            s.newChat,
            { backgroundColor: colors.primary, borderColor: colors.primary },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
        >
          <Text style={[s.newChatText, { color: colors.onPrimary }]}>
            {tr("Sign in")}
          </Text>
        </Pressable>
      )}
      {menu && session ? <AccountMenu onClose={() => setMenu(false)} /> : null}
    </View>
  );
}

const styles = (c: Colors) =>
  StyleSheet.create({
    side: { flex: 1, backgroundColor: c.surface, padding: 12, gap: 10 },
    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 6,
      paddingTop: 4,
    },
    brand: {
      color: c.text,
      fontFamily: font.display,
      fontSize: 22,
      letterSpacing: -0.3,
    },
    by: { color: c.muted, fontFamily: font.semibold, fontSize: 11 },
    icon: {
      width: 40,
      height: 40,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    iconText: { color: c.muted, fontSize: 18 },
    navRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 14, marginBottom: 4, borderWidth: 1, borderColor: "transparent" },
    navIcon: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" },
    navText: { color: c.text, fontFamily: font.medium, fontSize: 15 },
    askBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderRadius: 14,
      paddingVertical: 11,
      paddingHorizontal: 14,
      marginBottom: 8,
    },
    askGlyph: { fontSize: 16, width: 18, textAlign: "center" },
    askText: { color: c.text, fontFamily: font.semibold, fontSize: 15 },
    // Sized to fit on one line at the narrowest sidebar (220px); wraps rather than overflowing.
    filters: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", paddingTop: 6, paddingBottom: 8 },
    filter: { paddingVertical: 5, paddingHorizontal: 4, borderRadius: 999, borderWidth: 1, borderColor: "transparent" },
    filterOn: { borderColor: c.line, backgroundColor: c.surface2 },
    filterText: { color: c.muted, fontFamily: font.medium, fontSize: 12 },
    newChat: {
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 12,
      minHeight: 44,
      paddingHorizontal: 14,
      justifyContent: "center",
    },
    newChatText: { color: c.text, fontFamily: font.bold, fontSize: 15 },
    section: {
      color: c.muted,
      fontFamily: font.bold,
      fontSize: 11,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      paddingHorizontal: 10,
      paddingTop: 14,
      paddingBottom: 4,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 10,
      minHeight: 40,
      borderRadius: 10,
    },
    glyph: {
      width: 22,
      textAlign: "center",
      color: c.accent,
      fontSize: 16,
      fontFamily: font.verse,
    },
    rowText: { color: c.text, fontFamily: font.medium, fontSize: 14 },
    del: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 8,
    },
    delText: { color: c.muted, fontSize: 12 },
    smallBtn: { paddingHorizontal: 8, minHeight: 32, justifyContent: "center" },
    smallText: { color: c.text, fontFamily: font.bold, fontSize: 13 },
    guestNote: {
      padding: 10,
      marginTop: 12,
      borderRadius: 12,
      backgroundColor: c.surface2,
    },
    account: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 8,
      borderRadius: 12,
      borderTopWidth: 1,
      borderTopColor: c.line,
    },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { color: c.onPrimary, fontFamily: font.heavy, fontSize: 15 },
    small: { color: c.muted, fontFamily: font.medium, fontSize: 12 },
  });
