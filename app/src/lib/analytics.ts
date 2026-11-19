/**
 * Analytics and error reports, web only.
 *
 * - Page views and events go to GoatCounter (free, no cookies, no personal data): the page path
 *   (chat ids removed) and event names like "ask/ai" or "phone/verified". Never question text,
 *   numbers, names or birth details. GoatCounter skips localhost by itself.
 * - Errors (crashes, failed requests) go to Kosmik's own error log (POST /api/log), readable by the
 *   owner at /admin. Technical details only; the server scrubs anything that looks personal.
 * - PostHog (product analytics for the alpha), only when EXPO_PUBLIC_POSTHOG_KEY is set at build time
 *   and never on localhost: the same page views and events, linked to the signed-in account (user ID
 *   and email) so the owner can follow each person's path, plus full session recordings (what's on
 *   screen and what's typed, owner's call for the alpha, 2026-11-19). Sign-in and WhatsApp codes
 *   (autocomplete="one-time-code") and passwords are always hidden.
 */
import { posthog } from "posthog-js";
import { Platform } from "react-native";

const BASE = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
/** GoatCounter site code: dashboard at https://<code>.goatcounter.com */
export const GOATCOUNTER_CODE =
  process.env.EXPO_PUBLIC_GOATCOUNTER_CODE ?? "kosmikasanoha";
const RELEASE = process.env.EXPO_PUBLIC_RELEASE ?? "web";
/** PostHog project key (public, starts "phc_") and region host. No key: PostHog stays off. */
const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? "";
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

type GC = {
  count: (o: { path: string; title?: string; event?: boolean }) => void;
};
type Win = typeof globalThis & { goatcounter?: GC & { no_onload?: boolean } };

const web = Platform.OS === "web" && typeof document !== "undefined";
const queue: { path: string; title?: string; event?: boolean }[] = [];
let started = false;
let ph = false;

const localHost = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

/** Recordings show what people type, except one-time sign-in and WhatsApp codes. */
function hideCodes(text: string, element?: HTMLElement): string {
  return element?.getAttribute("autocomplete") === "one-time-code" ? "*".repeat(text.length) : text;
}

/** PostHog for the alpha: full recordings, codes hidden. Shared settings with the landing page (public/ph.js). */
function startPostHog() {
  if (!POSTHOG_KEY || localHost()) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: "identified_only",
    capture_pageview: false, // pageView() sends them, with chat ids removed
    capture_pageleave: true,
    autocapture: true,
    session_recording: {
      maskAllInputs: false,
      maskInputOptions: { password: true },
      maskInputFn: hideCodes,
    },
  });
  posthog.register({ app: "kosmik-web", release: RELEASE });
  ph = true;
}

/** Links what this browser does to the signed-in account; null on sign-out. */
export function identifyUser(user: { id: string; email?: string | null } | null) {
  if (!ph) return;
  if (!user) {
    posthog.reset();
    return;
  }
  if (posthog.get_distinct_id() !== user.id) posthog.identify(user.id, user.email ? { email: user.email } : {});
}

function gc(): GC | null {
  const g = (globalThis as Win).goatcounter;
  return g && typeof g.count === "function" ? g : null;
}

function flush() {
  const g = gc();
  if (!g) return;
  while (queue.length) g.count(queue.shift()!);
}

/** Loads GoatCounter and the error handlers once. */
export function startAnalytics() {
  if (!web || started) return;
  started = true;
  try {
    startPostHog();
  } catch {
    // analytics must never break the app
  }
  (globalThis as Win).goatcounter = { no_onload: true } as Win["goatcounter"];
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://gc.zgo.at/count.js";
  s.dataset.goatcounter = `https://${GOATCOUNTER_CODE}.goatcounter.com/count`;
  s.onload = flush;
  document.head.appendChild(s);

  window.addEventListener("error", (e) =>
    reportError("window", e.message || "Script error", e.error?.stack),
  );
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as { message?: string; stack?: string } | undefined;
    reportError("promise", r?.message ?? String(e.reason), r?.stack);
  });
}

const send = (o: { path: string; title?: string; event?: boolean }) => {
  if (!web) return;
  queue.push(o);
  flush();
};

/** A page view. Chat ids are removed, so every chat counts as /chat/:id. */
export function pageView(path: string) {
  const clean = path.replace(/\/chat\/[^/]+/, "/chat/:id");
  send({ path: clean });
  if (ph) posthog.capture("$pageview", { $current_url: location.origin + clean, path: clean });
}

/** An action, e.g. track("ask/ai") or track("phone/verified"). */
export function track(name: string) {
  send({ path: name, title: name, event: true });
  if (ph) posthog.capture(name);
}

const reported = new Map<string, number>();

/** Sends an error to Kosmik's error log (at most three times per message per visit). */
export function reportError(
  kind: string,
  message: string,
  detail?: string | null,
) {
  if (!web) return;
  const key = `${kind}:${message}`;
  const n = reported.get(key) ?? 0;
  if (n >= 3) return;
  reported.set(key, n + 1);
  track(`error/${kind}`);
  try {
    void fetch(`${BASE}/api/log`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        kind,
        message: String(message).slice(0, 500),
        detail: detail ? String(detail).slice(0, 2000) : null,
        path: location.pathname.replace(/\/chat\/[^/]+/, "/chat/:id"),
        release: RELEASE,
      }),
    }).catch(() => {});
  } catch {
    // reporting must never break the app
  }
}
