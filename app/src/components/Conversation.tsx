import { router } from "expo-router";
import { useRef, useState } from "react";
import {
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

import {
  api,
  ApiError,
  type AskResult,
  type Block,
  type Lang,
  type Layer,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { useShell } from "../lib/shell";
import { type Colors, font, useTheme } from "../lib/theme";
import { Blocks } from "./Blocks";
import { DetailsModal } from "./DetailsForms";
import { Thinking } from "./Thinking";

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
  { key: "en", label: "English" },
  { key: "hi", label: "हिंदी" },
  { key: "hinglish", label: "Hinglish" },
];

const LAYER_LABEL: Record<Layer, string> = {
  direct: "From the library",
  exact: "Answered before",
  semantic: "Answered before",
  ai: "Written for you, grounded in the library",
  safety: "",
  limit: "",
};

const MAX_LEN = 500;
const PALM_WORDS =
  /palm|hast ?rekha|hatheli|life ?line|heart ?line|head ?line|fate ?line|हथेली|हस्तरेखा/i;

const QUIZ_WORDS = /\b(quiz|test|retake|redo|take|find out)\b/i;

/** What Kosmik can do, shown on an empty chat. Plain text: people just type their question. */
const HINTS: [string, string, string][] = [
  [
    "ॐ",
    "Bhagavad Gita",
    "Ask for a verse (“Gita 2.47”, “verse of the day”) or what the Gita says about something on your mind.",
  ],
  ["✦", "Tarot", "“Pull 3 tarot cards” or “What does The Star mean?”"],
  [
    "☉",
    "Your kundli",
    "“What does my chart say about career?” Kosmik calculates your chart from your birth details; it asks for them the first time.",
  ],
  [
    "✋",
    "Palm reading",
    "“Read my palm.” Kosmik needs photos of both palms; it asks for them the first time, or add them in Account → My details.",
  ],
  [
    "❀",
    "Ayurveda",
    "“What is Ashwagandha?”, “Which herbs balance Pitta?” or “What is my dosha?” Kosmik asks 12 quick questions the first time.",
  ],
];
let seq = 0;
const nextId = () => `t${Date.now()}-${seq++}`;
const message = (e: unknown) =>
  e instanceof ApiError
    ? e.message
    : e instanceof Error
      ? e.message
      : "Something went wrong. Please try again.";

/** The chat: home screen with topics when empty, the thread, and the composer. Mount with a key to reset. */
export function Conversation({
  initialTurns = [],
  initialConversationId = null,
}: {
  initialTurns?: Turn[];
  initialConversationId?: string | null;
}) {
  const { colors } = useTheme();
  const { session } = useAuth();
  const shell = useShell();
  const s = styles(colors);
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId,
  );
  const [input, setInput] = useState("");
  const [inputHeight, setInputHeight] = useState(24);
  const [lang, setLang] = useState<Lang | undefined>(undefined);
  const [busy, setBusy] = useState<"ask" | "palm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [modal, setModal] = useState<{
    kind: "birth" | "palm" | "prakriti";
    question: string;
  } | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);

  const received = (r: AskResult, question: string) => {
    if (r.conversationId && r.conversationId !== conversationId) {
      setConversationId(r.conversationId);
      shell.setActiveId(r.conversationId);
    }
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
    // Questions about your own chart or palm need your saved details: ask for them right away.
    const need = r.blocks.find(
      (b) =>
        b.type === "notice" &&
        (b.kind === "needs-details" ||
          b.kind === "needs-palm" ||
          b.kind === "needs-prakriti" ||
          b.kind === "retake"),
    );
    if (need?.type === "notice") {
      setModal({
        kind:
          need.kind === "needs-details"
            ? "birth"
            : need.kind === "needs-prakriti"
              ? "prakriti"
              : "palm",
        question,
      });
    }
  };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    if (q.length > MAX_LEN) {
      setError(`Please keep your question under ${MAX_LEN} characters.`);
      return;
    }
    setError(null);
    setInput("");
    setInputHeight(24);
    setBusy(PALM_WORDS.test(q) ? "palm" : "ask");
    setTurns((t) => [...t, { id: nextId(), role: "user", text: q }]);
    try {
      received(await api.ask(q, lang, conversationId), q);
    } catch (e) {
      setError(message(e));
      setInput(q);
      setTurns((t) => t.slice(0, -1));
    } finally {
      setBusy(null);
    }
  };

  const rate = async (turnId: string, messageId: string, value: 1 | -1) => {
    const set = (v: 1 | -1 | null) =>
      setTurns((t) =>
        t.map((x) =>
          x.id === turnId && x.role === "assistant" ? { ...x, feedback: v } : x,
        ),
      );
    set(value);
    try {
      await api.feedback(messageId, value);
    } catch {
      set(null);
    }
  };

  /** The question asked just before an answer, so it can be asked again once details are added. */
  const lastQuestion = (answerId: string) => {
    const i = turns.findIndex((x) => x.id === answerId);
    for (let j = i - 1; j >= 0; j--) {
      const x = turns[j];
      if (x.role === "user") return x.text;
    }
    return "";
  };

  const onKeyPress = (e: {
    nativeEvent: { key: string; shiftKey?: boolean };
    preventDefault?: () => void;
  }) => {
    // On a computer, Enter sends and Shift+Enter starts a new line.
    if (
      Platform.OS === "web" &&
      e.nativeEvent.key === "Enter" &&
      !e.nativeEvent.shiftKey
    ) {
      e.preventDefault?.();
      send(input);
    }
  };

  const cycleLang = () =>
    setLang(
      LANGS[(LANGS.findIndex((l) => l.key === lang) + 1) % LANGS.length].key,
    );
  const langLabel = LANGS.find((l) => l.key === lang)?.label ?? "Auto";
  const canSend = !busy && !!input.trim();

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
          <View style={{ gap: 18, paddingTop: 12 }}>
            <View style={{ gap: 6 }}>
              <Text style={s.hello}>Namaste. What’s on your mind?</Text>
              <Text style={s.sub}>
                Just ask. Kosmik works out whether it’s about the Gita, tarot,
                your chart, your palm or Ayurveda.
              </Text>
            </View>
            <View style={s.hints}>
              {HINTS.map(([glyph, title, text]) => (
                <View key={title} style={s.hint}>
                  <Text style={s.hintGlyph}>{glyph}</Text>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={s.hintTitle}>{title}</Text>
                    <Text style={s.sub}>{text}</Text>
                  </View>
                </View>
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
            <View key={t.id} style={s.answerRow} testID="answer">
              <View style={s.avatar}>
                <Text style={s.avatarText}>✦</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
                <Blocks
                  blocks={t.blocks}
                  onSignIn={() => router.push("/sign-in")}
                  onPremium={() => router.push("/premium")}
                  onDetails={() =>
                    setModal({ kind: "birth", question: lastQuestion(t.id) })
                  }
                  onPalm={() =>
                    setModal({ kind: "palm", question: lastQuestion(t.id) })
                  }
                  onPrakriti={() =>
                    setModal({
                      kind: "prakriti",
                      question: lastQuestion(t.id),
                    })
                  }
                  onAsk={(q) => send(q)}
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
                    <View style={{ flexDirection: "row", gap: 2 }}>
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
                          accessibilityLabel={
                            v === 1 ? "Helpful" : "Not helpful"
                          }
                          accessibilityState={{ selected: t.feedback === v }}
                        >
                          <Text style={{ fontSize: 15 }}>
                            {v === 1 ? "👍" : "👎"}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          ),
        )}
        {busy ? (
          <View style={s.answerRow}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>✦</Text>
            </View>
            <Thinking kind={busy} />
          </View>
        ) : null}
      </ScrollView>

      <View style={s.dock}>
        {error ? (
          <Text style={s.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <View style={s.composer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask Kosmik anything…"
            placeholderTextColor={colors.muted}
            style={[
              s.input,
              { height: Math.min(160, Math.max(24, inputHeight)) },
            ]}
            multiline
            maxLength={MAX_LEN}
            onContentSizeChange={(e) =>
              setInputHeight(e.nativeEvent.contentSize.height)
            }
            onKeyPress={onKeyPress}
            accessibilityLabel="Your question"
            editable={!busy}
          />
          <View style={s.toolRow}>
            <Pressable
              onPress={cycleLang}
              style={s.langPill}
              accessibilityRole="button"
              accessibilityLabel={`Answer language: ${langLabel}. Tap to change.`}
            >
              <Text style={s.langText}>{langLabel}</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => send(input)}
              disabled={!canSend}
              style={[s.send, !canSend && { opacity: 0.35 }]}
              accessibilityRole="button"
              accessibilityLabel="Ask"
            >
              <Text style={s.sendText}>↑</Text>
            </Pressable>
          </View>
        </View>
        <Text style={s.foot}>
          {remaining !== null ? (
            <Text testID="remaining">
              {remaining} {session ? "left this week" : "left today"}
              {session ? " · " : " · Sign in for 11 a week · "}
            </Text>
          ) : null}
          For reflection, not medical, legal or financial advice.
        </Text>
      </View>
      <DetailsModal
        kind={modal?.kind ?? null}
        onClose={() => setModal(null)}
        onDone={() => {
          const q = modal?.question;
          setModal(null);
          // After the quiz, a request to take it shows the result instead of opening it again.
          if (q && modal?.kind === "prakriti" && QUIZ_WORDS.test(q))
            send("What is my prakriti?");
          else if (q) send(q);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = (c: Colors) =>
  StyleSheet.create({
    thread: {
      padding: 16,
      gap: 22,
      maxWidth: 780,
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
      fontSize: 15,
      lineHeight: 22,
    },
    hints: { gap: 10 },
    hint: {
      flexDirection: "row",
      gap: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 16,
      padding: 14,
    },
    hintGlyph: {
      color: c.accent,
      fontFamily: font.verse,
      fontSize: 18,
      width: 24,
      textAlign: "center",
    },
    hintTitle: { color: c.text, fontFamily: font.bold, fontSize: 15 },
    userBubble: {
      alignSelf: "flex-end",
      maxWidth: "82%",
      backgroundColor: c.surface2,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 8,
    },
    userText: {
      color: c.text,
      fontFamily: font.medium,
      fontSize: 16,
      lineHeight: 23,
    },
    answerRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
    avatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: c.primarySoft,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    avatarText: { color: c.primary, fontSize: 14 },
    metaRow: { flexDirection: "row", alignItems: "center" },
    meta: { flex: 1, color: c.muted, fontFamily: font.medium, fontSize: 12 },
    rate: {
      minWidth: 40,
      minHeight: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 999,
    },
    dock: {
      paddingHorizontal: 12,
      paddingBottom: 8,
      paddingTop: 4,
      gap: 6,
      width: "100%",
      maxWidth: 780,
      alignSelf: "center",
    },
    error: {
      color: c.danger,
      fontFamily: font.semibold,
      fontSize: 14,
      paddingHorizontal: 6,
    },
    composer: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 26,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 8,
      gap: 6,
    },
    input: {
      color: c.text,
      fontFamily: font.body,
      fontSize: 16,
      lineHeight: 24,
      padding: 0,
      outlineStyle: "none",
    } as object,
    toolRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    langPill: {
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 999,
      paddingHorizontal: 12,
      minHeight: 38,
      justifyContent: "center",
    },
    langText: { color: c.text, fontFamily: font.semibold, fontSize: 13 },
    send: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.text,
      alignItems: "center",
      justifyContent: "center",
    },
    sendText: {
      color: c.bg,
      fontFamily: font.heavy,
      fontSize: 20,
      lineHeight: 22,
    },
    foot: {
      color: c.muted,
      fontFamily: font.body,
      fontSize: 11,
      textAlign: "center",
    },
  });
