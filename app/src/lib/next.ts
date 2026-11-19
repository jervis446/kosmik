/**
 * Where to go after signing in, when a page sent the person to sign in first (for example
 * /connect from Claude or ChatGPT). Kept for this tab only; read once.
 */
const KEY = "kosmik/after-sign-in";

export function setNext(path: string) {
  try {
    globalThis.sessionStorage?.setItem(KEY, path);
  } catch {
    // storage unavailable: they land on the chat instead
  }
}

/** The saved page (only a path on this site), cleared as it's read. */
export function takeNext(): string | null {
  try {
    const path = globalThis.sessionStorage?.getItem(KEY) ?? null;
    globalThis.sessionStorage?.removeItem(KEY);
    return path && path.startsWith("/") && !path.startsWith("//") ? path : null;
  } catch {
    return null;
  }
}
