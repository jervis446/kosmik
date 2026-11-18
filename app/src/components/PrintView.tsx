import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { ReportPage } from "../lib/api";
import { tr } from "../lib/i18n";
import { font, lightColors as c } from "../lib/theme";
import { Logo } from "./Logo";
import { ReportBody } from "./ReportBody";
/** A4 width at 96 dpi, less the page margins: the PDF lays out like this page. */
const PAGE = 720;

/** Print rules: hide the toolbar, let the page run onto as many sheets as it needs, keep cards whole. */
const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
@media print {
  html, body, #root, div:has(#print-scroll), #print-scroll, #print-scroll > div {
    height: auto !important; max-height: none !important; overflow: visible !important;
  }
  #print-toolbar { display: none !important; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: ${c.bg} !important; }
  [data-avoid] { break-inside: avoid; page-break-inside: avoid; }
}`;

/** The report as a printable page in Kosmik's day theme: the browser's "Save as PDF" makes the file. */
export function PrintView({ data, error, backTo, autoPrint = true }: { data: ReportPage | null; error: string | null; backTo: string; autoPrint?: boolean }) {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const style = document.createElement("style");
    style.textContent = PRINT_CSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  const name = data?.kundali?.basics.find(([l]) => l === "Name")?.[1];
  useEffect(() => {
    if (!data || Platform.OS !== "web" || typeof document === "undefined") return;
    document.title = ["Kosmik", tr(data.spec.title), name && name !== "—" ? name : null].filter(Boolean).join(" · ");
    if (!autoPrint) return;
    // Give the fonts and charts a moment to settle, then open the print dialog ("Save as PDF").
    const t = setTimeout(() => window.print(), 900);
    return () => clearTimeout(t);
  }, [data, name, autoPrint]);

  const print = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") window.print();
  };

  return (
    <ScrollView nativeID="print-scroll" style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={s.page}>
      <View nativeID="print-toolbar" style={s.toolbar}>
        <Text style={s.hint}>{tr("Choose “Save as PDF” as the printer to download your report.")}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace(backTo))} style={s.ghost} accessibilityRole="button">
            <Text style={s.ghostText}>← {tr("Back")}</Text>
          </Pressable>
          <Pressable onPress={print} style={s.cta} accessibilityRole="button" testID="save-pdf" disabled={!data}>
            <Text style={s.ctaText}>{tr("Save as PDF")}</Text>
          </Pressable>
        </View>
      </View>

      {error ? <Text style={s.error}>{error}</Text> : null}
      {!data && !error ? <ActivityIndicator color={c.primary} style={{ marginTop: 40 }} /> : null}

      {data?.report ? (
        <>
          <View style={s.header}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Logo size={30} />
              <Text style={s.brand}>Kosmik</Text>
            </View>
            <Text style={s.eyebrow}>{tr(data.spec.ayurveda ? "AYURVEDA READING" : "PREMIUM VEDIC READING")}</Text>
            <Text style={s.title}>
              {data.spec.icon} {tr(data.spec.title)}
            </Text>
            <Text style={s.meta}>
              {[name && name !== "—" ? name : null, new Date(data.report.createdAt).toLocaleDateString(data.report.lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "long", year: "numeric" })]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            <View style={s.rule} />
          </View>
          <ReportBody report={data.report} kundali={data.kundali} colors={c} width={PAGE} print />
          <View style={s.footer}>
            <Text style={s.small}>
              {tr("Written for you by Kosmik from your own birth chart. Astrology is a guide for reflection, not a certainty: take important decisions with care and, where it matters, with a qualified professional.")}
            </Text>
            <Text style={s.small}>kosmik.asanoha.co.in · Asanoha LLP</Text>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 24, gap: 18, maxWidth: PAGE + 48, width: "100%", alignSelf: "center" },
  toolbar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface2 },
  hint: { color: c.muted, fontFamily: font.body, fontSize: 13, flexShrink: 1 },
  cta: { backgroundColor: c.primary, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16 },
  ctaText: { color: c.onPrimary, fontFamily: font.semibold, fontSize: 14 },
  ghost: { borderWidth: 1, borderColor: c.line, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: c.surface },
  ghostText: { color: c.text, fontFamily: font.medium, fontSize: 13 },
  error: { color: c.danger, fontFamily: font.medium, fontSize: 15 },
  header: { gap: 8, paddingTop: 4 },
  brand: { color: c.primary, fontFamily: font.display, fontSize: 22 },
  eyebrow: { color: c.muted, fontFamily: font.mono, fontSize: 11, letterSpacing: 2.5, marginTop: 8 },
  title: { color: c.text, fontFamily: font.display, fontSize: 32, lineHeight: 40 },
  meta: { color: c.muted, fontFamily: font.medium, fontSize: 14 },
  rule: { height: 2, width: 80, backgroundColor: c.accent, marginTop: 6 },
  footer: { gap: 6, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.line },
  small: { color: c.muted, fontFamily: font.body, fontSize: 11, lineHeight: 16 },
});
