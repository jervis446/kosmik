import { router } from "expo-router";
import { useRef, useState } from "react";
import {
  Image,
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
import { MODES, type ModeKey } from "../lib/modes";
import { pickPalmPhoto } from "../lib/palm";
import { useShell } from "../lib/shell";
import { type Colors, font, useTheme } from "../lib/theme";
import { Blocks } from "./Blocks";
import { Thinking } from "./Thinking";

export type Turn =
  | { id: string; role: "user"; text: string; photo?: string }
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
  initialMode = "gita",
}: {
  initialTurns?: Turn[];
  initialConversationId?: string | null;
  initialMode?: ModeKey;
}) {
  const { colors } = useTheme();
  const { session } = useAuth();
  const shell = useShell();
  const s = styles(colors);
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId,
  );
  const [mode, setMode] = useState<ModeKey>(initialMode);
  const [input, setInput] = useState("");
  const [inputHeight, setInputHeight] = useState(24);
  const [lang, setLang] = useState<Lang | undefined>(undefined);
  const [busy, setBusy] = useState<"ask" | "palm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [photoMenu, setPhotoMenu] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);

  const received = (r: AskResult) => {
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
    setBusy("ask");
    setTurns((t) => [...t, { id: nextId(), role: "user", text: q }]);
    try {
      received(await api.ask(q, lang, conversationId));
    } catch (e) {
      setError(message(e));
      setInput(q);
      setTurns((t) => t.slice(0, -1));
    } finally {
      setBusy(null);
    }
  };

  const sendPalm = async (source: "library" | "camera") => {
    setPhotoMenu(false);
    if (busy) return;
    setError(null);
    let photo;
    try {
      photo = await pickPalmPhoto(source);
    } catch (e) {
      setError(message(e));
      return;
    }
    if (!photo) return;
    setBusy("palm");
    setTurns((t) => [
      ...t,
      { id: nextId(), role: "user", text: "Read my palm", photo: photo.uri },
    ]);
    try {
      received(await api.palm(photo.base64, photo.mime, lang, conversationId));
    } catch (e) {
      setError(message(e));
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
  const active = MODES.find((m) => m.key === mode) ?? MODES[0];
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
                Ask about the Gita, your rashi, a graha or nakshatra, draw tarot
                cards, or read your palm.
              </Text>
            </View>
            <View style={s.tabs} accessibilityRole="tablist">
              {MODES.map((m) => (
                <Pressable
                  key={m.key}
                  onPress={() => setMode(m.key)}
                  style={[s.tab, mode === m.key && s.tabOn]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: mode === m.key }}
                >
                  <Text
                    style={[
                      s.tabGlyph,
                      mode === m.key && { color: colors.onPrimary },
                    ]}
                  >
                    {m.glyph}
                  </Text>
                  <Text
                    style={[
                      s.tabText,
                      mode === m.key && { color: colors.onPrimary },
                    ]}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.sub}>{active.blurb}</Text>
            {active.key === "palm" ? (
              <View style={s.palmCard}>
                <Text style={s.palmTitle}>Read your palm</Text>
                <Text style={s.sub}>
                  Use your dominant hand, open and flat, in good light, with the
                  lines filling most of the photo. The photo is read once and
                  never stored.
                </Text>
                <View
                  style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}
                >
                  <Pressable
                    onPress={() => sendPalm("library")}
                    style={s.primaryBtn}
                    accessibilityRole="button"
                  >
                    <Text style={s.primaryBtnText}>Upload a palm photo</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => sendPalm("camera")}
                    style={s.ghostBtn}
                    accessibilityRole="button"
                  >
                    <Text style={s.ghostBtnText}>Take a photo</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={s.starters}>
                {active.starters.map((q) => (
                  <Pressable
                    key={q}
                    style={s.starter}
                    onPress={() => send(q)}
                    accessibilityRole="button"
                  >
                    <Text style={s.starterText}>{q}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {turns.map((t) =>
          t.role === "user" ? (
            <View key={t.id} style={s.userBubble}>
              {t.photo ? (
                <Image
                  source={{ uri: t.photo }}
                  style={s.photo}
                  accessibilityLabel="Your palm photo"
                />
              ) : null}
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
                  onRetake={() => sendPalm("library")}
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
        {photoMenu ? (
          <View style={s.menu}>
            <Pressable
              onPress={() => sendPalm("library")}
              style={s.menuItem}
              accessibilityRole="button"
            >
              <Text style={s.menuText}>✋ Upload a palm photo</Text>
            </Pressable>
            <Pressable
              onPress={() => sendPalm("camera")}
              style={s.menuItem}
              accessibilityRole="button"
            >
              <Text style={s.menuText}>📷 Take a palm photo</Text>
            </Pressable>
          </View>
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
              onPress={() => setPhotoMenu((v) => !v)}
              style={s.tool}
              accessibilityRole="button"
              accessibilityLabel="Add a palm photo"
            >
              <Text style={s.toolText}>＋</Text>
            </Pressable>
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
    tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    tab: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
      borderRadius: 999,
      paddingHorizontal: 14,
      minHeight: 40,
    },
    tabOn: { backgroundColor: c.primary, borderColor: c.primary },
    tabGlyph: { color: c.accent, fontFamily: font.verse, fontSize: 15 },
    tabText: { color: c.text, fontFamily: font.semibold, fontSize: 14 },
    starters: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    starter: {
      flexBasis: 220,
      flexGrow: 1,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 14,
      minHeight: 56,
      justifyContent: "center",
    },
    starterText: { color: c.text, fontFamily: font.medium, fontSize: 15 },
    palmCard: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 20,
      padding: 18,
      gap: 12,
    },
    palmTitle: { color: c.text, fontFamily: font.bold, fontSize: 18 },
    primaryBtn: {
      backgroundColor: c.primary,
      borderRadius: 999,
      paddingHorizontal: 18,
      minHeight: 46,
      justifyContent: "center",
    },
    primaryBtnText: { color: c.onPrimary, fontFamily: font.bold, fontSize: 15 },
    ghostBtn: {
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 999,
      paddingHorizontal: 18,
      minHeight: 46,
      justifyContent: "center",
    },
    ghostBtnText: { color: c.text, fontFamily: font.bold, fontSize: 15 },
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
    photo: { width: 180, height: 180, borderRadius: 14, maxWidth: "100%" },
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
    menu: {
      alignSelf: "flex-start",
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 14,
      padding: 4,
    },
    menuItem: {
      paddingHorizontal: 14,
      minHeight: 44,
      justifyContent: "center",
      borderRadius: 10,
    },
    menuText: { color: c.text, fontFamily: font.semibold, fontSize: 15 },
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
    tool: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1,
      borderColor: c.line,
      alignItems: "center",
      justifyContent: "center",
    },
    toolText: { color: c.text, fontSize: 20, lineHeight: 22 },
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
