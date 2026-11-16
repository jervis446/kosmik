import { HI } from "./i18n-hi";
import { answerLang } from "./lang";

/** Screen labels follow the answer language: Hindi when हिंदी is picked, English otherwise. */
export const uiLang = (): "hi" | "en" => (answerLang() === "hi" ? "hi" : "en");

/**
 * A screen label in the person's language. The English text is the key; a missing Hindi entry
 * falls back to English. `{name}` placeholders are filled from `vars`.
 */
export function tr(en: string, vars?: Record<string, string | number>): string {
  let s = uiLang() === "hi" ? (HI[en] ?? en) : en;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
