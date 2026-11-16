import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

import type { Lang } from "./api";

/** The answer language the person picked, kept across chats and visits. undefined means Auto. */
const KEY = "kosmik/lang";
let current: Lang | undefined;
let ready = false;
const listeners = new Set<() => void>();
const valid = (v: unknown): v is Lang => v === "en" || v === "hi" || v === "hinglish";

AsyncStorage.getItem(KEY)
  .then((v) => {
    if (valid(v)) current = v;
  })
  .catch(() => {})
  .finally(() => {
    ready = true;
    listeners.forEach((l) => l());
  });

/** The answer language right now, outside React (undefined means Auto). */
export const answerLang = () => current;

/** Whether the saved choice has been read, so the first screen shows in the right language. */
export function useLangReady(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => ready,
    () => ready,
  );
}

export function setAnswerLang(lang: Lang | undefined) {
  current = lang;
  listeners.forEach((l) => l());
  (lang ? AsyncStorage.setItem(KEY, lang) : AsyncStorage.removeItem(KEY)).catch(() => {});
}

export function useAnswerLang(): [Lang | undefined, (l: Lang | undefined) => void] {
  const lang = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
  return [lang, setAnswerLang];
}
