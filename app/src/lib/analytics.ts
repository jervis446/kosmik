/**
 * Analytics and error reports, web only.
 *
 * - Page views and events go to GoatCounter (free, no cookies, no personal data): the page path
 *   (chat ids removed) and event names like "ask/ai" or "phone/verified". Never question text,
 *   numbers, names or birth details. GoatCounter skips localhost by itself.
 * - Errors (crashes, failed requests) go to Kosmik's own error log (POST /api/log), readable by the
 *   owner at /admin. Technical details only; the server scrubs anything that looks personal.
 */
import { Platform } from "react-native";

const BASE = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
/** GoatCounter site code: dashboard at https://<code>.goatcounter.com */
export const GOATCOUNTER_CODE =
  process.env.EXPO_PUBLIC_GOATCOUNTER_CODE ?? "kosmikasanoha";
const RELEASE = process.env.EXPO_PUBLIC_RELEASE ?? "web";

type GC = {
  count: (o: { path: string; title?: string; event?: boolean }) => void;
};
type Win = typeof globalThis & { goatcounter?: GC & { no_onload?: boolean } };

const web = Platform.OS === "web" && typeof document !== "undefined";
const queue: { path: string; title?: string; event?: boolean }[] = [];
let started = false;

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
  send({ path: path.replace(/\/chat\/[^/]+/, "/chat/:id") });
}

/** An action, e.g. track("ask/ai") or track("phone/verified"). */
export function track(name: string) {
  send({ path: name, title: name, event: true });
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
