import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Conversation, type Turn } from "../../components/Conversation";
import { Header } from "../../components/Header";
import { api, ApiError, type StoredMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { font, useTheme } from "../../lib/theme";

const toTurns = (messages: StoredMessage[]): Turn[] =>
  messages.map((m) =>
    m.role === "user"
      ? { id: m.id, role: "user", text: m.content }
      : {
          id: m.id,
          role: "assistant",
          blocks: m.blocks ?? [{ type: "text", text: m.content }],
          layer: m.layer,
          messageId: m.id,
          feedback: m.feedback,
        },
  );

export default function SavedChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, ready } = useAuth();
  const { colors } = useTheme();
  const [data, setData] = useState<{
    title: string;
    messages: StoredMessage[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !session) return;
    let live = true;
    api
      .conversation(id)
      .then((r) => live && setData(r))
      .catch(
        (e) =>
          live &&
          setError(
            e instanceof ApiError ? e.message : "Couldn’t load this chat.",
          ),
      );
    return () => {
      live = false;
    };
  }, [id, session, ready]);

  const turns = useMemo(() => (data ? toTurns(data.messages) : []), [data]);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
      <Header title={data?.title ?? "Chat"} back />
      {ready && !session ? (
        <Text
          style={{
            color: colors.danger,
            fontFamily: font.semibold,
            padding: 16,
          }}
        >
          Sign in to see your saved chats.
        </Text>
      ) : error ? (
        <Text
          style={{
            color: colors.danger,
            fontFamily: font.semibold,
            padding: 16,
          }}
        >
          {error}
        </Text>
      ) : !data ? (
        <View style={{ padding: 24 }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <Conversation
          key={id}
          initialTurns={turns}
          initialConversationId={id}
        />
      )}
    </SafeAreaView>
  );
}
