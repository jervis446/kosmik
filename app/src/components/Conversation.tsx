import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
  type ChatKind,
  type Lang,
  type Layer,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAnswerLang } from "../lib/lang";
import { refreshMe, useMe } from "../lib/me";
import { useShell } from "../lib/shell";
import { type Colors, font, useTheme } from "../lib/theme";
import { Blocks, highlight } from "./Blocks";
import { DetailsModal } from "./DetailsForms";
import { Engines } from "./Engines";
import { Logo } from "./Logo";
import { Thinking } from "./Thinking";
import { track } from "../lib/analytics";
import { tr } from "../lib/i18n";

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

/** The layer label in the answer's own language: Hindi when the answer is in Devanagari. */
/** Common first things to say in a Shanti chat. */
const SHANTI_STARTERS = [
  "I just went through a breakup",
  "I feel lost after failing",
  "How do I live with losing someone?",
  "Fights at home are wearing me down",
  "I feel alone even with people around",
];

/** Common first questions in an Ayurveda chat. */
const AYUR_STARTERS = [
  "Gas and bloating after meals",
  "Acidity and burning in the chest",
  "I can’t sleep well",
  "Hair fall and dandruff",
  "Low energy all day",
  "What is my prakriti?",
];

const LAYER_LABEL_HI: Partial<Record<Layer, string>> = {
  direct: "लाइब्रेरी से",
  exact: "पहले दिया गया जवाब",
  semantic: "पहले दिया गया जवाब",
  ai: "आपके लिए लिखा, Kosmik ने",
};
const LAYER_LABEL_HINGLISH: Partial<Record<Layer, string>> = {
  direct: "Library se",
  exact: "Pehle diya gaya jawaab",
  semantic: "Pehle diya gaya jawaab",
  ai: "Aapke liye likha, Kosmik ne",
};
function layerLabel(layer: Layer, blocks: Block[], picked: Lang | undefined): string {
  if (!LAYER_LABEL[layer]) return "";
  const text = blocks.map((b) => (b.type === "text" ? b.text : "")).join(" ");
  const letters = [...text].filter((c) => /\p{L}/u.test(c));
  const deva = letters.filter((c) => /[\u0900-\u097F]/.test(c)).length;
  if (letters.length && deva / letters.length > 0.5) return LAYER_LABEL_HI[layer] ?? LAYER_LABEL[layer];
  if (picked === "hinglish") return LAYER_LABEL_HINGLISH[layer] ?? LAYER_LABEL[layer];
  return LAYER_LABEL[layer];
}

const LAYER_LABEL: Record<Layer, string> = {
  direct: "From the library",
  exact: "Answered before",
  semantic: "Answered before",
  ai: "Written for you, by Kosmik",
  safety: "",
  limit: "",
};

/** Up to 300 words a question (the character cap only stops pasted essays). */
const MAX_WORDS = 300;
const MAX_LEN = 2400;
const wordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);
const PALM_WORDS =
  /palm|hast ?rekha|hatheli|life ?line|heart ?line|head ?line|fate ?line|हथेली|हस्तरेखा/i;

const QUIZ_WORDS = /\b(quiz|test|retake|redo|take|find out)\b/i;

let seq = 0;
const nextId = () => `t${Date.now()}-${seq++}`;
const message = (e: unknown) =>
  e instanceof ApiError
    ? e.message
    : e instanceof Error
      ? e.message
      : tr("Something went wrong. Please try again.");

/** The chat: home screen with topics when empty, the thread, and the composer. Mount with a key to reset. */
export function Conversation({
  initialTurns = [],
  initialConversationId = null,
  initialKind = null,
}: {
  initialTurns?: Turn[];
  initialConversationId?: string | null;
  /** Ayurveda or Kosmik; null for a new chat that its first answer will decide. */
  initialKind?: ChatKind | null;
}) {
  const { colors } = useTheme();
  const { session } = useAuth();
  const shell = useShell();
  const s = styles(colors);
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId,
  );
  const [kind, setKind] = useState<ChatKind | null>(initialKind);
  const ayurveda = kind === "ayurveda";
  const shanti = kind === "shanti";
  const [input, setInput] = useState("");
  const [inputHeight, setInputHeight] = useState(24);
  const [lang, setLang] = useAnswerLang();
  const [langOpen, setLangOpen] = useState(false);
  const [busy, setBusy] = useState<"ask" | "palm" | null>(null);
  /** The answer as it is being written, shown until the finished one arrives. */
  const [live, setLive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Questions left, shown in the composer from the start (Premium has no limit, so no pill):
  // the saved account info at once, then the count each answer returns.
  const me = useMe();
  const [answered, setRemaining] = useState<number | null>(null);
  const remaining = answered ?? (me && me.usage.limit !== null ? Math.max(0, me.usage.limit - me.usage.used) : null);
  const [modal, setModal] = useState<{
    kind: "birth" | "palm" | "prakriti" | "vikriti";
    question: string;
  } | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);

  const received = (r: AskResult, question: string) => {
    // What was asked about, never the question itself.
    track(`ask/${r.layer}`);
    const card = r.blocks.find((b) => b.type !== "text");
    if (card)
      track(
        `answer/${card.type === "notice" ? `notice-${card.kind}` : card.type}`,
      );
    if (r.kind && r.kind !== kind) setKind(r.kind);
    if (r.conversationId && r.conversationId !== conversationId) {
      setConversationId(r.conversationId);
      shell.setActiveId(r.conversationId);
    }
    setRemaining(r.remaining);
    if (session) void refreshMe(session.user.id);
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
          b.kind === "needs-vikriti" ||
          b.kind === "retake"),
    );
    if (need?.type === "notice") {
      setModal({
        kind:
          need.kind === "needs-details"
            ? "birth"
            : need.kind === "needs-prakriti"
              ? "prakriti"
              : need.kind === "needs-vikriti"
                ? "vikriti"
                : "palm",
        question,
      });
    }
  };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    if (wordCount(q) > MAX_WORDS || q.length > MAX_LEN) {
      setError(tr("Please keep your question under {v0} words.", { v0: MAX_WORDS }));
      return;
    }
    setError(null);
    setInput("");
    setInputHeight(24);
    setBusy(PALM_WORDS.test(q) ? "palm" : "ask");
    setTurns((t) => [...t, { id: nextId(), role: "user", text: q }]);
    try {
      received(await api.askLive(q, lang, conversationId, setLive, undefined, kind), q);
    } catch (e) {
      setError(message(e));
      setInput(q);
      setTurns((t) => t.slice(0, -1));
    } finally {
      setBusy(null);
      setLive(null);
    }
  };

  // The person picked their tarot card(s): draw and read them for the question.
  const pickTarot = async (q: string, count: 1 | 3) => {
    if (busy) return;
    setError(null);
    setBusy("ask");
    try {
      received(await api.askLive(q, lang, conversationId, setLive, { count }, kind), q);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
      setLive(null);
    }
  };

  // A question handed over from elsewhere (the first question at the end of onboarding).
  const pendingQuestion = shell.pending;
  useEffect(() => {
    if (!pendingQuestion || turns.length) return;
    const t = setTimeout(() => {
      shell.clearPending();
      send(pendingQuestion);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuestion]);

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
        {turns.length === 0 && ayurveda ? (
          <View style={{ gap: 18, paddingTop: 12 }} testID="ayurveda-home">
            <View style={{ gap: 6 }}>
              <Text style={[s.sub, { fontFamily: font.mono, letterSpacing: 1.5, fontSize: 12 }]}>
                {tr("KOSMIK / AYURVEDA")}
              </Text>
              <Text style={s.hello}>{tr("What’s bothering you?")}</Text>
              <Text style={s.sub}>
                {tr("Tell Kosmik like you’d tell a vaidya: what you feel, since when, and what makes it better or worse. You’ll get an Ayurvedic reading with diet, routine and remedies.")}
              </Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {AYUR_STARTERS.map((q) => (
                <Pressable
                  key={q}
                  onPress={() => send(tr(q))}
                  style={({ pressed }) => [s.starter, pressed && { borderColor: colors.success }]}
                  accessibilityRole="button"
                >
                  <Text style={s.starterText}>{tr(q)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {turns.length === 0 && shanti ? (
          <View style={{ gap: 18, paddingTop: 12 }} testID="shanti-home">
            <View style={{ gap: 6 }}>
              <Text style={[s.sub, { fontFamily: font.mono, letterSpacing: 1.5, fontSize: 12 }]}>
                {tr("KOSMIK / SHANTI")}
              </Text>
              <Text style={s.hello}>{tr("Tell me what’s on your heart.")}</Text>
              <Text style={s.sub}>
                {tr("Say it the way it is. Shanti listens, and answers with what the Gita and the old texts teach about pain like yours. Nothing you say here is shown to anyone else.")}
              </Text>
              <Text style={[s.sub, { fontSize: 12 }]}>
                {tr("Not therapy. If you might hurt yourself, call Tele-MANAS 14416 (free, 24×7). In danger right now: 112.")}
              </Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {SHANTI_STARTERS.map((q) => (
                <Pressable
                  key={q}
                  onPress={() => send(tr(q))}
                  style={({ pressed }) => [s.starter, pressed && { borderColor: "#8E7CF0" }]}
                  accessibilityRole="button"
                >
                  <Text style={s.starterText}>{tr(q)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {turns.length === 0 && !ayurveda && !shanti ? (
          <View style={{ gap: 18, paddingTop: 12 }}>
            <View style={{ gap: 6 }}>
              <Text style={s.hello}>{tr("Namaste. What’s on your mind?")}</Text>
              <Text style={s.sub}>
                {tr("Just ask, in English, Hindi or Hinglish. Or hover a card for ideas.")}
              </Text>
            </View>
            <Engines onAsk={(q) => send(q)} />
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
              <Logo size={30} />
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
                  onVikriti={() =>
                    setModal({
                      kind: "vikriti",
                      question: lastQuestion(t.id),
                    })
                  }
                  onPrakriti={() =>
                    setModal({
                      kind: "prakriti",
                      question: lastQuestion(t.id),
                    })
                  }
                  onAsk={(q) => send(q)}
                  onAyurveda={(q) => shell.askNew(q, "ayurveda")}
                  onSwitch={(q, k) => shell.askNew(q, k)}
                  onTarotPick={
                    t.id === turns[turns.length - 1]?.id && !busy
                      ? pickTarot
                      : undefined
                  }
                />
                <View style={s.metaRow}>
                  {t.layer && layerLabel(t.layer, t.blocks, lang) ? (
                    <Text
                      style={s.meta}
                      testID="layer"
                      accessibilityHint={t.layer}
                    >
                      {layerLabel(t.layer, t.blocks, lang)}
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
                            v === 1 ? tr("Helpful") : tr("Not helpful")
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
        {busy && live ? (
          <View style={s.answerRow} testID="live-answer">
            <Logo size={30} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.liveText}>
                {highlight(live, colors.highlight)}
                <Text style={{ color: colors.primary }}> ▍</Text>
              </Text>
            </View>
          </View>
        ) : busy ? (
          <View style={s.answerRow}>
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
            placeholder={ayurveda ? tr("Describe what you feel, since when…") : shanti ? tr("Say what’s on your mind…") : tr("Ask Kosmik anything…")}
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
            {langOpen ? (
              <View style={s.langMenu} accessibilityRole="radiogroup" accessibilityLabel="Answer language">
                {LANGS.map((l) => (
                  <Pressable
                    key={l.label}
                    onPress={() => {
                      setLang(l.key);
                      setLangOpen(false);
                      track(`lang/${l.key ?? "auto"}`);
                    }}
                    style={[s.langPill, l.key === lang && s.langOn]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: l.key === lang }}
                  >
                    <Text style={[s.langText, l.key === lang && { color: colors.bg }]}>{l.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Pressable
                onPress={() => setLangOpen(true)}
                style={s.langPill}
                accessibilityRole="button"
                accessibilityLabel={`Answer language: ${langLabel}. Tap to change.`}
              >
                <Text style={s.langText}>
                  {lang ? tr("Answers in {v0}", { v0: langLabel }) : tr("Auto language")} ▾
                </Text>
              </Pressable>
            )}
            <Text
              style={[s.pill, wordCount(input) > MAX_WORDS && { color: colors.danger, borderColor: colors.danger }]}
              testID="word-count"
              accessibilityLabel={`${wordCount(input)} of ${MAX_WORDS} words`}
            >
              {wordCount(input)} / {MAX_WORDS}
            </Text>
            <View style={{ flex: 1 }} />
            {session && remaining !== null ? (
              <View style={s.left} testID="remaining">
                <Text style={s.leftText}>{tr("{v0} QUESTIONS LEFT", { v0: remaining })}</Text>
                <Pressable
                  onPress={() => router.push("/premium")}
                  style={s.leftBuy}
                  accessibilityRole="button"
                  accessibilityLabel="Buy more questions"
                >
                  <Text style={s.leftText}>{tr("Buy more")}</Text>
                </Pressable>
              </View>
            ) : null}
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
          else if (q && modal?.kind === "vikriti" && QUIZ_WORDS.test(q))
            send("Check my vikriti");
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
    pill: {
      color: c.muted,
      fontFamily: font.mono,
      fontSize: 12,
      letterSpacing: 1,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 999,
      paddingVertical: 7,
      paddingHorizontal: 12,
      marginLeft: 8,
    },
    left: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: `${c.accent}aa`,
      backgroundColor: `${c.accent}1f`,
      borderRadius: 999,
      overflow: "hidden",
      marginRight: 10,
    },
    leftText: { color: c.accent, fontFamily: font.mono, fontSize: 11, letterSpacing: 1.2, paddingVertical: 8, paddingHorizontal: 12 },
    leftBuy: { borderLeftWidth: 1, borderLeftColor: `${c.accent}aa` },
    liveText: { color: c.text, fontFamily: font.body, fontSize: 16, lineHeight: 24 },
    starter: {
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
      borderRadius: 999,
      paddingVertical: 9,
      paddingHorizontal: 14,
    },
    starterText: { color: c.text, fontFamily: font.medium, fontSize: 14 },
    hello: {
      color: c.text,
      fontFamily: font.display,
      fontSize: 34,
      lineHeight: 42,
    },
    sub: {
      color: c.muted,
      fontFamily: font.body,
      fontSize: 15,
      lineHeight: 22,
    },
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
    langMenu: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    langOn: { backgroundColor: c.text, borderColor: c.text },
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
