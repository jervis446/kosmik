# Reports: kundali, fuller readings, PDF and report follow-ups

Owner's request (2026-11-18): add the kundali to reports, make every report as detailed as the
AstroSage samples they shared, give a downloadable PDF in Kosmik's own look (not the samples' look),
and let people ask follow-up questions that use their report.

## Decided
- **PDF: print page (free).** A "Download PDF" button opens a print view of the report in Kosmik's
  light theme; the browser's Save as PDF makes the file. No server PDF, no paid Cloudflare plan.
  Hindi prints correctly because the browser shapes the text.
- **Kundali section, calculated, not AI.** Every chart report (all but Prakriti) starts with:
  - North Indian diamond charts: Lagna (D1) and Navamsa (D9). Without a birth time, the Moon chart.
  - Birth details and panchang: date, time, place, weekday, sunrise, sunset, tithi and paksha,
    yoga, karana, ayanamsa.
  - Avkahada: lagna and lord, rashi and lord, nakshatra and pada and lord, varna, vashya, yoni,
    gana, nadi, balance of dasha at birth.
  - Planets: sign, degree, nakshatra, pada, house, dignity, retrograde.
  - Vimshottari: every mahadasha with its antardashas; the running ones marked.
  - Manglik (from lagna and Moon) and the lifetime Sade Sati / dhaiya periods with phases.
  It is calculated when the report is written and kept with it (old reports get it from the saved
  birth details when opened).
- **Fuller readings.** The AI also writes, for this report's topic: one reading per dasha period
  (the running mahadasha's antardashas and the next mahadashas), one per slow transit now
  (Saturn, Jupiter, Rahu, Ketu), and Manglik / Sade Sati notes. Given the full dasha table and
  Sade Sati periods as facts.
- **Follow-ups use the report.** Asking from a report starts a Kosmik chat tagged with that report
  (new nullable `conversations.report_key`). Every answer in that chat is given the report's
  content, and its questions go to the chart reading, not to Shanti (unless pain or scripture).
- **Left out of the samples:** Lal Kitab (fear and harm lines), lucky stones and gemstones,
  fear-based Manglik remedies (tree or pot marriage): they break Kosmik's no-fear, no-gemstone rules.
  Ashtakavarga and the chalit table are later, if asked for.

## Approaches considered (PDF)
1. Print page (picked): free, perfect Hindi, sharp charts; one extra tap on phones.
2. Worker PDF via Cloudflare Browser Rendering: one-tap file, needs Workers Paid.
3. pdf-lib in the Worker: free one-tap, but breaks Devanagari conjuncts. Rejected.

## Constraints
Plain, minimal UI that works at 375px in light and dark (the print view is always light).
No secrets, no new paid services. `npm install --ignore-scripts` if anything is added (nothing is
planned: react-native-svg is already in the app).
