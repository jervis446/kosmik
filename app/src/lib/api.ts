/** Calls to the Kosmik API. The web app is served by the API, so the base URL is usually empty. */
import { supabase } from "./supabase";

const BASE = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

export type Lang = "en" | "hi" | "hinglish";
export type Layer = "direct" | "exact" | "semantic" | "ai" | "safety" | "limit";

export type Block =
  | { type: "text"; text: string }
  | {
      type: "verse";
      ref: string;
      sanskrit: string;
      iast: string;
      translation: string;
      translator: string;
    }
  | {
      type: "meaning";
      kind: string;
      key: string;
      title: string;
      body: string;
      reviewed: boolean;
    }
  | {
      type: "tarot";
      cards: {
        key: string;
        name: string;
        reversed: boolean;
        position: string;
        meaning: string;
      }[];
    }
  | {
      type: "notice";
      kind:
        | "helpline"
        | "needs-chart"
        | "coming-soon"
        | "limit"
        | "sign-in"
        | "busy";
      text: string;
    };

export type AskResult = {
  conversationId: string | null;
  messageId: string | null;
  layer: Layer;
  lang: Lang;
  blocks: Block[];
  remaining: number | null;
};

export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: number;
};
export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks: Block[] | null;
  layer: Layer | null;
  feedback: 1 | -1 | null;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(
      "You seem to be offline. Check your connection and try again.",
      0,
    );
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok)
    throw new ApiError(
      body.error ?? "Something went wrong. Please try again.",
      res.status,
    );
  return body as T;
}

export const api = {
  ask: (
    question: string,
    lang: Lang | undefined,
    conversationId: string | null,
  ) =>
    call<AskResult>("/api/ask", {
      method: "POST",
      body: JSON.stringify({ question, lang, conversationId }),
    }),
  conversations: () =>
    call<{ conversations: ConversationSummary[] }>("/api/conversations"),
  conversation: (id: string) =>
    call<{ id: string; title: string; messages: StoredMessage[] }>(
      `/api/conversations/${id}`,
    ),
  deleteConversation: (id: string) =>
    call<{ deleted: boolean }>(`/api/conversations/${id}`, {
      method: "DELETE",
    }),
  feedback: (messageId: string, value: 1 | -1) =>
    call<{ saved: boolean }>("/api/feedback", {
      method: "POST",
      body: JSON.stringify({ messageId, value }),
    }),
};
