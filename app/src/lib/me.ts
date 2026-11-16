import { useEffect, useSyncExternalStore } from "react";

import { api, type Me } from "./api";
import { useAuth } from "./auth";

/**
 * Your account info (name, questions left, credits, admin), shared by every screen and kept in
 * the browser, so the sidebar shows your name straight away instead of after a request. It is
 * refreshed in the background whenever a screen asks for it.
 */
const KEY = "kosmik/me";
type Cached = { uid: string; me: Me };

let cached: Cached | null = (() => {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null;
  }
})();
const listeners = new Set<() => void>();
let inflight: Promise<Me | null> | null = null;
let fetchedAt = 0;

function set(next: Cached | null) {
  cached = next;
  try {
    if (next) globalThis.localStorage?.setItem(KEY, JSON.stringify(next));
    else globalThis.localStorage?.removeItem(KEY);
  } catch {
    // storage unavailable: the in-memory copy still works
  }
  listeners.forEach((l) => l());
}

/** Fetches the latest account info (one request at a time) and shares it. */
export function refreshMe(uid: string): Promise<Me | null> {
  if (inflight) return inflight;
  inflight = api
    .me()
    .then((me) => {
      fetchedAt = Date.now();
      set({ uid, me });
      return me;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Forget it on sign-out, so the next person doesn't see it. */
export const clearMe = () => set(null);

/** The signed-in person's account info: the saved copy at once, refreshed in the background. */
export function useMe(): Me | null {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => cached,
    () => cached,
  );
  useEffect(() => {
    // At most one refresh every few seconds, however many screens ask.
    if (uid && Date.now() - fetchedAt > 5000) void refreshMe(uid);
  }, [uid]);
  return uid && value?.uid === uid ? value.me : null;
}
