import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { ConversationSummary } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useShell } from "../lib/shell";
import { type Colors, font, useTheme } from "../lib/theme";

function group(chats: ConversationSummary[], now: number) {
  const day = 24 * 60 * 60 * 1000;
  const buckets: { label: string; items: ConversationSummary[] }[] = [
    { label: "Today", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Older", items: [] },
  ];
  for (const c of chats) {
    const age = now - c.updatedAt;
    buckets[age < day ? 0 : age < 7 * day ? 1 : 2].items.push(c);
  }
  return buckets.filter((b) => b.items.length);
}

/** ChatGPT-style sidebar: new chat, topics, your chats, and your account at the bottom. */
export function Sidebar({ onCollapse }: { onCollapse?: () => void } = {}) {
  const { colors } = useTheme();
  const { session } = useAuth();
  const shell = useShell();
  const s = styles(colors);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const email = session?.user.email ?? "";

  return (
    <View
      style={s.side}
      accessibilityRole="menu"
      accessibilityLabel="Kosmik menu"
    >
      <View style={s.brandRow}>
        <View style={{ flex: 1 }}>
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
        style={s.newChat}
        accessibilityRole="button"
        accessibilityLabel="New chat"
      >
        <Text style={s.newChatText}>＋ New chat</Text>
      </Pressable>

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
              Your chats will appear here.
            </Text>
          ) : (
            group(shell.chats, now).map((g) => (
              <View key={g.label} style={{ gap: 2 }}>
                <Text style={s.section}>{g.label}</Text>
                {g.items.map((c) =>
                  confirming === c.id ? (
                    <View
                      key={c.id}
                      style={[s.row, { backgroundColor: colors.surface2 }]}
                    >
                      <Text style={[s.rowText, { flex: 1 }]} numberOfLines={1}>
                        Delete this chat?
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
                          Delete
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setConfirming(null)}
                        style={s.smallBtn}
                        accessibilityRole="button"
                      >
                        <Text style={s.smallText}>Keep</Text>
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
              Sign in to save your chats and get 11 free questions a week.
            </Text>
          </View>
        )}
      </ScrollView>

      {session ? (
        <Pressable
          onPress={() => {
            shell.closeDrawer();
            router.push("/account");
          }}
          style={s.account}
          accessibilityRole="link"
          accessibilityLabel="Account"
        >
          <View style={s.avatar}>
            <Text style={s.avatarText}>{(email[0] ?? "?").toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.rowText} numberOfLines={1}>
              {email}
            </Text>
            <Text style={s.small}>Account · Upgrade</Text>
          </View>
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
            Sign in
          </Text>
        </Pressable>
      )}
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
      fontFamily: font.heavy,
      fontSize: 20,
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
