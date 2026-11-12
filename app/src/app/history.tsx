import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Header } from "../components/Header";
import { api, ApiError, type ConversationSummary } from "../lib/api";
import { useAuth } from "../lib/auth";
import { font, useTheme } from "../lib/theme";

const when = (ms: number) =>
  new Date(ms).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function confirm(message: string): Promise<boolean> {
  if (Platform.OS === "web")
    return Promise.resolve(globalThis.confirm?.(message) ?? true);
  return new Promise((resolve) =>
    Alert.alert("Delete chat?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Delete", style: "destructive", onPress: () => resolve(true) },
    ]),
  );
}

export default function History() {
  const { session, ready } = useAuth();
  const { colors } = useTheme();
  const [items, setItems] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .conversations()
      .then((r) => setItems(r.conversations))
      .catch((e) =>
        setError(
          e instanceof ApiError ? e.message : "Couldn’t load your chats.",
        ),
      );
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!session) router.replace("/sign-in");
    else load();
  }, [ready, session, load]);

  const remove = async (c: ConversationSummary) => {
    if (!(await confirm(`“${c.title}” will be deleted for good.`))) return;
    const before = items;
    setItems((x) => x?.filter((i) => i.id !== c.id) ?? null);
    try {
      await api.deleteConversation(c.id);
    } catch {
      setItems(before);
      setError("Couldn’t delete that chat. Please try again.");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
      <Header title="Your chats" back />
      {error ? (
        <Text
          style={{
            color: colors.danger,
            fontFamily: font.semibold,
            padding: 16,
          }}
        >
          {error}
        </Text>
      ) : null}
      {!items ? (
        <View style={{ padding: 24 }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{
            padding: 16,
            gap: 10,
            maxWidth: 760,
            width: "100%",
            alignSelf: "center",
          }}
          ListEmptyComponent={
            <Text
              style={{
                color: colors.muted,
                fontFamily: font.body,
                fontSize: 16,
              }}
            >
              No chats yet. Ask something and it’ll show up here.
            </Text>
          }
          renderItem={({ item }) => (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.surface,
                borderColor: colors.line,
                borderWidth: 1,
                borderRadius: 16,
              }}
            >
              <Pressable
                style={{ flex: 1, padding: 14, gap: 4 }}
                onPress={() =>
                  router.push({
                    pathname: "/chat/[id]",
                    params: { id: item.id },
                  })
                }
                accessibilityRole="link"
              >
                <Text
                  style={{
                    color: colors.text,
                    fontFamily: font.semibold,
                    fontSize: 16,
                  }}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                <Text
                  style={{
                    color: colors.muted,
                    fontFamily: font.body,
                    fontSize: 13,
                  }}
                >
                  {when(item.updatedAt)}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => remove(item)}
                style={{
                  minWidth: 48,
                  minHeight: 48,
                  alignItems: "center",
                  justifyContent: "center",
                }}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${item.title}`}
              >
                <Text style={{ color: colors.danger, fontSize: 18 }}>✕</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
