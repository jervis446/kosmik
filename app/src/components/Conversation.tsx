import { router } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { api, ApiError, type Block, type Lang, type Layer } from "../lib/api";
import { useAuth } from "../lib/auth";
import { type Colors, font, useTheme } from "../lib/theme";
import { Blocks } from "./Blocks";

export type Turn =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      blocks: Block[];
      layer: Layer | null;
      messageId: string | null;
      feedback: 1 | -1 | null;
    };

const LANGS: { key: Lang | undefined; label: string }[] = [
  { key: undefined, label: "Auto" },
  { key: "en", label: "EN" },
  { key: "hi", label: "हिं" },
  { key: "hinglish", label: "Hinglish" },
];

const CHIPS = [
  "Gita verse for anxiety",
  "Pull 3 tarot cards",
  "Saturn in 7th house",
  "Verse of the day",
  "What is Rohini nakshatra?",
  "Explain my kundli",
];

const LAYER_LABEL: Record<Layer, string> = {
  direct: "From the library",
  exact: "Answered before",
  semantic: "Answered before",
  ai: "Written for you, grounded in the library",
  safety: "",
  limit: "",
};

let seq = 0;
const nextId = () => `t${Date.now()}-${seq++}`;

/** The ask thread plus the prompt bar. Used for a new chat and for a saved one (mount with a key to reset). */
export function Conversation({
  initialTurns = [],
  initialConversationId = null,
}: {
  initialTurns?: Turn[];
  initialConversationId?: string | null;
}) {
  const { colors } = useTheme();
  const { session } = useAuth();
  const s = styles(colors);
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId,
  );
  const [input, setInput] = useState("");
  const [lang, setLang] = useState<Lang | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    if (q.length > 500) {
      setError("Please keep your question under 500 characters.");
      return;
    }
    setError(null);
    setInput("");
    setBusy(true);
    setTurns((t) => [...t, { id: nextId(), role: "user", text: q }]);
    try {
      const r = await api.ask(q, lang, conversationId);
      if (r.conversationId) setConversationId(r.conversationId);
      setRemaining(r.remaining);
      setTurns((t) => [
        ...t,
        {
          id: nextId(),
          role: "assistant",
          blocks: r.blocks,
          layer: r.layer,
          messageId: r.messageId,
          feedback: null,
        },
      ]);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Something went wrong. Please try again.",
      );
      setInput(q);
      setTurns((t) => t.slice(0, -1));
    } finally {
      setBusy(false);
    }
  };

  const rate = async (turnId: string, messageId: string, value: 1 | -1) => {
    setTurns((t) =>
      t.map((x) =>
        x.id === turnId && x.role === "assistant"
          ? { ...x, feedback: value }
          : x,
      ),
    );
    try {
      await api.feedback(messageId, value);
    } catch {
      setTurns((t) =>
        t.map((x) =>
          x.id === turnId && x.role === "assistant"
            ? { ...x, feedback: null }
            : x,
        ),
      );
    }
  };

  const goSignIn = () => router.push("/sign-in");
  const goPremium = () => router.push("/premium");

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        ref={scroll}
        contentContainerStyle={s.thread}
        onContentSizeChange={() =>
          scroll.current?.scrollToEnd({ animated: true })
        }
        keyboardShouldPersistTaps="handled"
      >
        {turns.length === 0 ? (
          <View style={{ gap: 14, paddingTop: 24 }}>
            <Text style={s.hello}>Namaste. What’s on your mind?</Text>
            <Text style={s.sub}>
              Ask about the Gita, your rashi, a graha, a nakshatra or a tarot
              card. Answers come from a curated library first.
            </Text>
            <View style={s.chips}>
              {CHIPS.map((c) => (
                <Pressable
                  key={c}
                  style={s.chip}
                  onPress={() => send(c)}
                  accessibilityRole="button"
                >
                  <Text style={s.chipText}>{c}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {turns.map((t) =>
          t.role === "user" ? (
            <View key={t.id} style={s.userBubble}>
              <Text style={s.userText} selectable>
                {t.text}
              </Text>
            </View>
          ) : (
            <View key={t.id} style={{ gap: 8 }} testID="answer">
              <Blocks
                blocks={t.blocks}
                onSignIn={goSignIn}
                onPremium={goPremium}
              />
              <View style={s.metaRow}>
                {t.layer && LAYER_LABEL[t.layer] ? (
                  <Text
                    style={s.meta}
                    testID="layer"
                    accessibilityHint={t.layer}
                  >
                    {LAYER_LABEL[t.layer]}
                  </Text>
                ) : (
                  <View style={{ flex: 1 }} />
                )}
                {t.messageId && session ? (
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    {([1, -1] as const).map((v) => (
                      <Pressable
                        key={v}
                        onPress={() => rate(t.id, t.messageId!, v)}
                        style={[
                          s.rate,
                          t.feedback === v && {
                            backgroundColor: colors.primarySoft,
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={v === 1 ? "Helpful" : "Not helpful"}
                        accessibilityState={{ selected: t.feedback === v }}
                      >
                        <Text style={{ fontSize: 16 }}>
                          {v === 1 ? "👍" : "👎"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          ),
        )}
        {busy ? (
          <View
            style={[s.metaRow, { gap: 8 }]}
            accessibilityLiveRegion="polite"
          >
            <ActivityIndicator color={colors.primary} />
            <Text style={s.meta}>Looking through the library…</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={s.bar}>
        {error ? (
          <Text style={s.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <View style={s.langRow}>
          {LANGS.map((l) => (
            <Pressable
              key={l.label}
              onPress={() => setLang(l.key)}
              style={[
                s.lang,
                lang === l.key && {
                  backgroundColor: colors.primarySoft,
                  borderColor: colors.primary,
                },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: lang === l.key }}
              accessibilityLabel={`Answer language ${l.label}`}
            >
              <Text style={s.langText}>{l.label}</Text>
            </Pressable>
          ))}
          <View style={{ flex: 1 }} />
          {remaining !== null ? (
            <Text style={s.meta} testID="remaining">
              {remaining} left
            </Text>
          ) : null}
        </View>
        <View style={s.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask Kosmik…"
            placeholderTextColor={colors.muted}
            style={s.input}
            multiline
            maxLength={500}
            onSubmitEditing={() => send(input)}
            submitBehavior="submit"
            returnKeyType="send"
            accessibilityLabel="Your question"
            editable={!busy}
          />
          <Pressable
            onPress={() => send(input)}
            disabled={busy || !input.trim()}
            style={[s.send, (busy || !input.trim()) && { opacity: 0.5 }]}
            accessibilityRole="button"
            accessibilityLabel="Ask"
          >
            <Text style={s.sendText}>Ask</Text>
          </Pressable>
        </View>
        <Text style={s.foot}>
          For reflection and guidance, not a substitute for medical, legal or
          financial advice.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = (c: Colors) =>
  StyleSheet.create({
    thread: {
      padding: 16,
      gap: 18,
      maxWidth: 760,
      width: "100%",
      alignSelf: "center",
      flexGrow: 1,
    },
    hello: {
      color: c.text,
      fontFamily: font.heavy,
      fontSize: 28,
      lineHeight: 36,
    },
    sub: {
      color: c.muted,
      fontFamily: font.body,
      fontSize: 16,
      lineHeight: 24,
    },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
    chip: {
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 10,
      minHeight: 44,
      justifyContent: "center",
    },
    chipText: { color: c.text, fontFamily: font.medium, fontSize: 14 },
    userBubble: {
      alignSelf: "flex-end",
      maxWidth: "85%",
      backgroundColor: c.primary,
      borderRadius: 20,
      borderBottomRightRadius: 6,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    userText: {
      color: c.onPrimary,
      fontFamily: font.medium,
      fontSize: 16,
      lineHeight: 22,
    },
    metaRow: { flexDirection: "row", alignItems: "center" },
    meta: { flex: 1, color: c.muted, fontFamily: font.medium, fontSize: 12 },
    rate: {
      minWidth: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 999,
    },
    bar: {
      borderTopWidth: 1,
      borderTopColor: c.line,
      backgroundColor: c.surface,
      padding: 12,
      gap: 8,
      width: "100%",
      maxWidth: 760,
      alignSelf: "center",
    },
    error: { color: c.danger, fontFamily: font.semibold, fontSize: 14 },
    langRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    lang: {
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 999,
      paddingHorizontal: 12,
      minHeight: 36,
      justifyContent: "center",
    },
    langText: { color: c.text, fontFamily: font.semibold, fontSize: 13 },
    inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
    input: {
      flex: 1,
      minHeight: 48,
      maxHeight: 140,
      color: c.text,
      fontFamily: font.body,
      fontSize: 16,
      backgroundColor: c.bg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.line,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    send: {
      backgroundColor: c.primary,
      borderRadius: 999,
      paddingHorizontal: 20,
      minHeight: 48,
      justifyContent: "center",
    },
    sendText: { color: c.onPrimary, fontFamily: font.bold, fontSize: 16 },
    foot: {
      color: c.muted,
      fontFamily: font.body,
      fontSize: 11,
      textAlign: "center",
    },
  });
