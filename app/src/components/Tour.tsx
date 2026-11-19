import { router } from "expo-router";
import { useState } from "react";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { tr } from "../lib/i18n";
import { useShell } from "../lib/shell";
import { type Colors, font, useTheme } from "../lib/theme";

/** The guide to using Kosmik with Claude or ChatGPT, on the website. */
export const MCP_GUIDE = "https://kosmik.asanoha.co.in/mcp.html";
/** Remembered once someone has seen the walkthrough, so it opens on its own only once. */
export const TOURED = "kosmik-toured";

type Shell = ReturnType<typeof useShell>;
type Card = {
  glyph: string;
  colour?: string;
  title: string;
  body: string;
  /** What "Try it" does; the last card's button just closes. */
  tryIt?: { label: string; go: (shell: Shell) => void };
};

const CARDS: Card[] = [
  {
    glyph: "✦",
    title: "Welcome to Kosmik",
    body: "Here’s everything Kosmik can do, in a few quick cards. Tap Next to go through them, or Try it on anything you want to use now.",
  },
  {
    glyph: "✦",
    title: "Ask Kosmik",
    body: "Ask anything about your life: your kundli, dashas and transits, a tarot draw or a palm reading. You get a straight answer first, then the why, with real dates from your own chart.",
    tryIt: { label: "Ask Kosmik", go: (s) => s.newChat() },
  },
  {
    glyph: "❀",
    colour: "#3FB68B",
    title: "Ask Ayurveda",
    body: "Describe how you feel and get Ayurveda guidance for your body: your prakriti (Vata, Pitta, Kapha), food, routine and herbs. For anything serious, a doctor comes first.",
    tryIt: { label: "Ask Ayurveda", go: (s) => s.newChat("ayurveda") },
  },
  {
    glyph: "☾",
    colour: "#8E7CF0",
    title: "Talk to Shanti",
    body: "Going through something hard? Shanti listens and answers with what the Bhagavad Gita and other Hindu texts teach, quoting each verse with its chapter and number.",
    tryIt: { label: "Talk to Shanti", go: (s) => s.newChat("shanti") },
  },
  {
    glyph: "📖",
    title: "In-depth reports",
    body: "Career, marriage, money and more: long reports written from your chart, with dated periods and practical remedies. Save them as PDF. Reports are part of Premium.",
    tryIt: { label: "See reports", go: () => router.push("/reports") },
  },
  {
    glyph: "☰",
    title: "Your chats, details and language",
    body: "Your chats are saved in the menu. Change your birth details any time from your account. Pick English, हिंदी or Hinglish under the message box, and Kosmik answers in it.",
    tryIt: { label: "Open my account", go: () => router.push("/account") },
  },
  {
    glyph: "₹",
    title: "Free and Premium",
    body: "A free account gets 11 questions a week. Premium gives 10 questions a day and unlocks reports, from ₹51 for 7 days. It never renews on its own.",
    tryIt: { label: "See Premium", go: () => router.push("/premium") },
  },
  {
    glyph: "⌘",
    title: "Use Kosmik with Claude or ChatGPT",
    body: "Add Kosmik to Claude or ChatGPT and ask there too: they read your exact chart, dashas and transits from Kosmik. It doesn’t use your Kosmik questions: 11 lookups a day free, 51 on Premium.",
    tryIt: { label: "How to add it", go: () => Linking.openURL(MCP_GUIDE) },
  },
];

/** A walkthrough of every feature, one card at a time. */
export function Tour({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const shell = useShell();
  const [i, setI] = useState(0);
  const card = CARDS[i];
  const last = i === CARDS.length - 1;
  const tint = card.colour ?? colors.highlight;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card} accessibilityViewIsModal testID="tour">
          <View style={s.topRow}>
            <Text style={s.count}>
              {tr("{v0} of {v1}", { v0: i + 1, v1: CARDS.length })}
            </Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={tr("Skip")} hitSlop={10}>
              <Text style={s.skip}>{last ? tr("Close") : tr("Skip")}</Text>
            </Pressable>
          </View>

          <View style={[s.glyphWrap, { borderColor: tint, backgroundColor: `${tint}22` }]}>
            <Text style={[s.glyph, { color: tint }]}>{card.glyph}</Text>
          </View>
          <Text style={s.title} accessibilityRole="header">
            {tr(card.title)}
          </Text>
          <Text style={s.body}>{tr(card.body)}</Text>

          {card.tryIt ? (
            <Pressable
              onPress={() => {
                onClose();
                card.tryIt!.go(shell);
              }}
              style={({ pressed }) => [s.tryBtn, { borderColor: tint }, pressed && { backgroundColor: `${tint}22` }]}
              accessibilityRole="button"
            >
              <Text style={[s.tryText, { color: tint }]}>{tr("Try it")}: {tr(card.tryIt.label)} →</Text>
            </Pressable>
          ) : null}

          <View style={s.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {CARDS.map((c, n) => (
              <Pressable key={c.title} onPress={() => setI(n)} hitSlop={6}>
                <View style={[s.dot, n === i && { backgroundColor: colors.primary, width: 18 }]} />
              </Pressable>
            ))}
          </View>

          <View style={s.navRow}>
            {i > 0 ? (
              <Pressable onPress={() => setI(i - 1)} style={s.backBtn} accessibilityRole="button">
                <Text style={s.backText}>{tr("Back")}</Text>
              </Pressable>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <Pressable
              onPress={() => (last ? onClose() : setI(i + 1))}
              style={({ pressed }) => [s.nextBtn, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
            >
              <Text style={s.nextText}>{last ? tr("Start using Kosmik") : tr("Next")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = (c: Colors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(4,2,8,0.72)",
      justifyContent: "center",
      padding: 14,
    },
    card: {
      backgroundColor: c.bg,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: c.line,
      width: "100%",
      maxWidth: 460,
      alignSelf: "center",
      padding: 22,
      gap: 14,
    },
    topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    count: { color: c.muted, fontFamily: font.semibold, fontSize: 12, letterSpacing: 1 },
    skip: { color: c.muted, fontFamily: font.semibold, fontSize: 14 },
    glyphWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    glyph: { fontSize: 28 },
    title: { color: c.text, fontFamily: font.display, fontSize: 26, lineHeight: 32 },
    body: { color: c.muted, fontFamily: font.body, fontSize: 15, lineHeight: 23 },
    tryBtn: {
      alignSelf: "flex-start",
      maxWidth: "100%",
      borderWidth: 1,
      borderRadius: 999,
      paddingVertical: 9,
      paddingHorizontal: 16,
    },
    tryText: { fontFamily: font.semibold, fontSize: 14 },
    dots: { flexDirection: "row", gap: 6, justifyContent: "center", flexWrap: "wrap", paddingTop: 4 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.line },
    navRow: { flexDirection: "row", gap: 10, alignItems: "center" },
    backBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: 999, borderWidth: 1, borderColor: c.line },
    backText: { color: c.text, fontFamily: font.semibold, fontSize: 15 },
    nextBtn: { flex: 2, paddingVertical: 12, alignItems: "center", borderRadius: 999, backgroundColor: c.primary },
    nextText: { color: c.onPrimary, fontFamily: font.bold, fontSize: 15 },
  });
