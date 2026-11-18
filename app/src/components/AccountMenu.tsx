import { router } from "expo-router";
import { useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { track } from "../lib/analytics";
import type { BirthDetails } from "../lib/api";
import { clearMe, refreshMe, useMe } from "../lib/me";
import { useAuth } from "../lib/auth";
import { tr } from "../lib/i18n";
import { OPERATOR } from "../lib/legal";
import { useShell } from "../lib/shell";
import { type Colors, font, useTheme } from "../lib/theme";
import { BirthDetailsModal } from "./BirthDetailsModal";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
/** "7 NOV 2026 · 04:45 AM · ETAWAH" */
export function birthLine(d: BirthDetails): string {
  const [y, m, day] = d.birthDate.split("-").map(Number);
  const parts = [`${day} ${MONTHS[m - 1]} ${y}`];
  if (d.birthTime) {
    const [h, min] = d.birthTime.split(":").map(Number);
    parts.push(`${String(h % 12 || 12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`);
  }
  parts.push(d.place.split(",")[0].toUpperCase());
  return parts.join(" · ");
}

/** Who you are, what you have left, and everything account-related, opened from the sidebar. */
export function AccountMenu({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const { session, signOut } = useAuth();
  const shell = useShell();
  const me = useMe();
  const [edited, setDetails] = useState<BirthDetails | null | undefined>();
  const details = edited !== undefined ? edited : me?.details;
  const [help, setHelp] = useState(false);
  const [editing, setEditing] = useState(false);
  const [now] = useState(() => Date.now());


  const go = (path: "/premium" | "/payments" | "/account" | "/help" | "/privacy" | "/terms" | "/reports" | "/admin") => {
    onClose();
    shell.closeDrawer();
    router.push(path);
  };
  const name = details?.name || session?.user.email?.split("@")[0] || "";
  const premium = !!me?.premiumUntil && me.premiumUntil > now;
  const left = me?.usage.limit != null ? Math.max(0, me.usage.limit - me.usage.used) : null;
  const wa = OPERATOR.phone.replace(/\D/g, "");

  return (
    <>
      <Pressable
        style={[StyleSheet.absoluteFill, Platform.OS === "web" && ({ position: "fixed" } as object)]}
        onPress={onClose}
        accessibilityLabel="Close account menu"
      />
      <View style={[s.pop, shell.wide ? { width: 380, right: undefined } : null]} testID="account-menu" accessibilityRole="menu">
        <View style={s.who}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{(name[0] ?? "?").toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.name} numberOfLines={1}>
              {name}
            </Text>
            <Text style={s.mono} numberOfLines={1}>
              {me?.phone ?? session?.user.email ?? ""}
            </Text>
          </View>
        </View>
        {details ? (
          <Pressable onPress={() => setEditing(true)} style={s.birth} accessibilityRole="button" accessibilityLabel="Edit birth details">
            <Text style={s.mono} numberOfLines={1}>
              ✦ {birthLine(details)}
            </Text>
          </Pressable>
        ) : null}

        <View style={[s.box, { borderColor: `${colors.primary}66`, backgroundColor: `${colors.primary}14` }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.mono}>{tr("QUESTIONS")}</Text>
            <Text style={s.big} testID="menu-questions">
              {me === null ? "…" : premium ? tr("{v0} left today", { v0: left ?? 0 }) : tr("{v0} questions left", { v0: left ?? 0 })}
            </Text>
          </View>
          <Pressable onPress={() => go("/premium")} style={s.buy} accessibilityRole="button">
            <Text style={s.buyText}>{premium ? tr("Add days") : tr("Buy questions")}</Text>
          </Pressable>
        </View>
        <View style={s.box}>
          <View style={{ flex: 1 }}>
            <Text style={s.mono}>{tr("REPORTS")}</Text>
            <Text style={s.big} numberOfLines={1} testID="menu-reports">
              {me === null ? "…" : tr("{v0} available", { v0: me.reportCredits ?? 0 })}
            </Text>
          </View>
          <Pressable onPress={() => go("/reports")} style={s.outline} accessibilityRole="button">
            <Text style={s.outlineText}>{tr("Buy reports")}</Text>
          </Pressable>
        </View>

        <View style={s.list}>
          <Item label={tr("My birth details")} glyph="▦" onPress={() => setEditing(true)} s={s} />
          <Item label={tr("Payments & invoices")} glyph="₹" onPress={() => go("/payments")} s={s} />
          <Item label={tr("Account & privacy")} glyph="⚙" onPress={() => go("/account")} s={s} />
          {me?.admin ? <Item label="Admin · payments to check" glyph="✓" onPress={() => go("/admin")} s={s} /> : null}
          <Item label={tr("Help")} glyph="?" onPress={() => setHelp((h) => !h)} open={help} s={s} />
          {help ? (
            <View style={shell.wide ? [s.pop, s.flyout] : s.help} testID="help-menu">
              {shell.wide ? <Text style={[s.mono, { paddingHorizontal: 6, paddingBottom: 4 }]}>{tr("HELP")}</Text> : null}
              <Item label={tr("FAQs")} glyph="◌" onPress={() => go("/help")} s={s} small />
              <Item
                label={tr("WhatsApp us")}
                hint={OPERATOR.phone}
                glyph="✆"
                onPress={() => {
                  track("help/whatsapp");
                  Linking.openURL(`https://wa.me/${wa}`);
                }}
                s={s}
                small
              />
              <Item label={tr("Email us")} hint={OPERATOR.email} glyph="✉" onPress={() => Linking.openURL(`mailto:${OPERATOR.email}`)} s={s} small />
              <Item label={tr("Privacy Policy")} glyph="⌂" onPress={() => go("/privacy")} s={s} small />
              <Item label={tr("Terms and Conditions")} glyph="§" onPress={() => go("/terms")} s={s} small />
              <Item label={tr("Refund Policy")} glyph="↺" onPress={() => go("/help")} s={s} small />
              <Item label={tr("Disclaimer")} glyph="ⓘ" onPress={() => go("/help")} s={s} small />
            </View>
          ) : null}
        </View>
        <Pressable
          onPress={async () => {
            onClose();
            clearMe();
            await signOut();
            router.replace("/");
          }}
          style={s.signOut}
          accessibilityRole="button"
        >
          <Text style={s.itemGlyph}>⇥</Text>
          <Text style={s.itemText}>{tr("Sign out")}</Text>
        </Pressable>
      </View>
      {editing ? (
        <BirthDetailsModal
          visible
          initial={details ?? null}
          onClose={() => setEditing(false)}
          onSaved={(d) => {
            setDetails(d);
            setEditing(false);
            if (session) void refreshMe(session.user.id);
          }}
        />
      ) : null}
    </>
  );
}

function Item({
  label,
  hint,
  glyph,
  onPress,
  open,
  small,
  s,
}: {
  label: string;
  hint?: string;
  glyph: string;
  onPress: () => void;
  open?: boolean;
  small?: boolean;
  s: ReturnType<typeof styles>;
}) {
  return (
    <Pressable onPress={onPress} style={[s.item, small && { paddingVertical: 8 }]} accessibilityRole="menuitem" accessibilityLabel={label}>
      <Text style={s.itemGlyph}>{glyph}</Text>
      <Text style={[s.itemText, small && { fontSize: 14 }]} numberOfLines={1}>
        {label}
      </Text>
      {hint ? (
        <Text style={s.hint} numberOfLines={1}>
          {hint}
        </Text>
      ) : (
        <Text style={s.chev}>{open === undefined ? "›" : open ? "⌄" : "›"}</Text>
      )}
    </Pressable>
  );
}

const styles = (c: Colors) =>
  StyleSheet.create({
    pop: {
      position: "absolute",
      left: 10,
      right: 10,
      bottom: 64,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface2,
      padding: 12,
      gap: 10,
      shadowColor: "#000",
      shadowOpacity: 0.45,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
      zIndex: 20,
    },
    who: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 4, paddingTop: 4 },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: `${c.primary}33`,
      borderWidth: 1,
      borderColor: `${c.primary}88`,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { color: c.text, fontFamily: font.semibold, fontSize: 17 },
    name: { color: c.text, fontFamily: font.display, fontSize: 20 },
    mono: { color: c.muted, fontFamily: font.mono, fontSize: 11, letterSpacing: 1.4 },
    birth: { borderWidth: 1, borderColor: c.line, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12 },
    box: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 14,
      padding: 12,
    },
    big: { color: c.text, fontFamily: font.medium, fontSize: 18, marginTop: 4 },
    buy: { backgroundColor: c.primary, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14 },
    buyText: { color: c.onPrimary, fontFamily: font.semibold, fontSize: 13 },
    outline: { borderWidth: 1, borderColor: c.line, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
    outlineText: { color: c.text, fontFamily: font.semibold, fontSize: 13 },
    list: { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 4 },
    item: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 10 },
    itemGlyph: { color: c.muted, fontSize: 15, width: 18, textAlign: "center" },
    itemText: { flex: 1, color: c.text, fontFamily: font.medium, fontSize: 15 },
    chev: { color: c.muted, fontSize: 16 },
    hint: { color: c.muted, fontFamily: font.mono, fontSize: 11, maxWidth: 160 },
    help: { marginLeft: 14, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: c.line },
    flyout: { left: 392, right: undefined, bottom: 0, width: 360, gap: 0 },
    signOut: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: c.line },
  });
