import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

import type { Lang } from "./api";

/** The answer language the person picked, kept across chats and visits. undefined means Auto. */
const KEY = "kosmik/lang";
let current: Lang | undefined;
const listeners = new Set<() => void>();
const valid = (v: unknown): v is Lang => v === "en" || v === "hi" || v === "hinglish";

AsyncStorage.getItem(KEY)
  .then((v) => {
    if (valid(v)) {
      current = v;
      listeners.forEach((l) => l());
    }
  })
  .catch(() => {});

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
