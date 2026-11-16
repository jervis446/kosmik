/** Calls to the Kosmik API. The web app is served by the API, so the base URL is usually empty. */
import { reportError, track } from "./analytics";
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
        reading?: string;
        arcana?: "major" | "minor";
        number?: number;
        suit?: string;
      }[];
      advice?: string;
    }
  | { type: "tarot-pick"; count: 1 | 3; question: string }
  | { type: "palm"; lines: { name: string; reading: string }[] }
  | {
      type: "chart";
      lagna: string | null;
      moon: string;
      nakshatra: string;
      dasha?: string | null;
      rows: {
        graha: string;
        rashi: string;
        house: string | null;
        retrograde: boolean;
      }[];
    }
  | {
      type: "herb";
      key: string;
      name: string;
      english: string;
      botanical: string;
      rasa: string[];
      guna: string[];
      virya: string;
      vipaka: string;
      pacify: string[];
      aggravate: string[];
      description: string;
      caution: boolean;
      link: string;
      synonyms?: string[];
      parts?: string[];
    }
  | {
      type: "herb-compare";
      herbs: {
        key: string;
        name: string;
        english: string;
        botanical: string;
        rasa: string[];
        guna: string[];
        virya: string;
        vipaka: string;
        pacify: string[];
        aggravate: string[];
        parts: string[];
      }[];
    }
  | {
      type: "ritu";
      ritu: string;
      sanskrit: string;
      months: string;
      ayana: string;
      strength: string;
      rasa: string;
      doshas: string;
      favour: string[];
      avoid: string[];
      routine: string[];
      next: string;
    }
  | {
      type: "vikriti";
      vata: number;
      pitta: number;
      kapha: number;
      aggravated: string[];
      agni: string;
      takenAt: number;
      prakriti: string | null;
    }
  | {
      type: "herb-list";
      title: string;
      total: number;
      herbs: { key: string; name: string; english: string; virya: string }[];
    }
  | {
      type: "zodiac";
      sun: { sign: string; glyph: string; degree: string; vibe: string };
      moon: { sign: string; glyph: string; degree: string; vibe: string };
      rising: {
        sign: string;
        glyph: string;
        degree: string;
        vibe: string;
      } | null;
      planets: { graha: string; sign: string; glyph: string; degree: string }[];
      siderealSun: string;
      cusp: string | null;
      solarReturn: string;
    }
  | { type: "ayur-intake"; questions: string[] }
  | {
      type: "ayur-plan";
      shloka?: { sanskrit: string; source: string; meaning: string } | null;
      assessment: {
        doshas: string;
        agni: string;
        nidana: string[];
        notes: string;
      } | null;
      favour: string[];
      avoid: string[];
      lifestyle: string[];
      remedies: { name: string; how: string }[];
      formulations: {
        name: string;
        dose: string;
        anupana: string;
        when: string;
      }[];
      yoga: string[];
      redFlags: string[];
    }
  | { type: "behind"; points: string[] }
  | { type: "followups"; questions: string[] }
  | {
      type: "prakriti";
      vata: number;
      pitta: number;
      kapha: number;
      label: string;
      takenAt: number;
    }
  | {
      type: "notice";
      kind:
        | "helpline"
        | "needs-chart"
        | "needs-details"
        | "needs-palm"
        | "needs-prakriti"
        | "needs-vikriti"
        | "coming-soon"
        | "limit"
        | "sign-in"
        | "busy"
        | "retake"
        | "use-ayurveda";
      text: string;
      /** For "use-ayurveda": the question to ask again in an Ayurveda chat. */
      question?: string;
    };

export type AskResult = {
  conversationId: string | null;
  messageId: string | null;
  layer: Layer;
  lang: Lang;
  blocks: Block[];
  remaining: number | null;
  kind?: ChatKind;
};

/** Kosmik chats (astrology, tarot, palm, Gita) and Ayurveda chats are kept apart. */
export type ChatKind = "kosmik" | "ayurveda";
export type ConversationSummary = {
  id: string;
  title: string;
  kind?: ChatKind;
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

export type PlanId = "week" | "month";
/** Report packs, sold the same way as Premium. */
export type PackId = "r1" | "r3" | "r10";
export type ReportGroup = "love" | "money" | "work" | "self" | "ayurveda";
export type ReportSummary = {
  key: string;
  group: ReportGroup;
  icon: string;
  title: string;
  tagline: string;
  about: string;
  badge?: "new" | "trending";
  ayurveda?: boolean;
  /** Divisional charts read with the birth chart, e.g. [10] for D10. */
  vargas?: number[];
  owned?: boolean;
  createdAt?: number | null;
};
export type WrittenReport = {
  headline: string;
  summary: string;
  sections: { heading: string; body: string }[];
  timing: { when: string; what: string }[];
  remedies: { title: string; how: string }[];
  strengths: string[];
  watch: string[];
  followUps: string[];
  lang: Lang;
  createdAt: number;
};
export type ReportsList = {
  credits: number;
  packs: { id: PackId; name: string; amountPaise: number; credits: number }[];
  groups: { key: ReportGroup; title: string }[];
  reports: ReportSummary[];
};
export type Plan = {
  id: PlanId;
  name: string;
  amountPaise: number;
  days: number;
};
export type Me = {
  /** The name from your birth details, if you gave one. */
  name?: string | null;
  /** Report credits left. */
  reportCredits?: number;
  /** Your verified WhatsApp number, masked. */
  phone: string | null;
  /** True until you verify a WhatsApp number (when Kosmik requires one). */
  phoneRequired: boolean;
  /** WhatsApp codes can be sent. */
  phoneAvailable: boolean;
  /** Can read the error log at /admin. */
  admin?: boolean;
  premiumUntil: number | null;
  usage: { used: number; limit: number | null };
  paymentsEnabled: boolean;
  plans: Plan[];
};
export type PaymentState = {
  status: "pending" | "paid" | "failed" | "expired" | "cancelled";
  plan: PlanId;
  premiumUntil: number | null;
};

export type AdminErrors = {
  groups: {
    fingerprint: string;
    source: "client" | "server";
    kind: string;
    message: string;
    detail: string | null;
    path: string | null;
    count: number;
    first_at: number;
    last_at: number;
  }[];
  days: { day: string; source: string; count: number }[];
};

export type Snapshot = {
  name: string | null;
  lines: {
    kind: "mind" | "work" | "presence";
    title: string;
    tag: string;
    text: string;
  }[];
  dasha: string | null;
  western?: {
    sun: string;
    moon: string;
    rising: string | null;
    solarReturn: string;
    cusp: string | null;
  };
};

export type Hand = "left" | "right";
export type Vikriti = {
  vata: number;
  pitta: number;
  kapha: number;
  agni: string;
  agniLabel: string;
  aggravated: string[];
  takenAt: number;
};
export type Prakriti = {
  vata: number;
  pitta: number;
  kapha: number;
  label: string;
  takenAt: number;
};
export type Gender = "female" | "male" | "other";
export type BirthDetails = {
  name: string | null;
  gender?: Gender | null;
  birthDate: string;
  birthTime: string | null;
  place: string;
  lat: number;
  lon: number;
  tzOffsetMin: number;
};
/** One Premium purchase, as listed on Payments & invoices. */
export type Purchase = {
  id: string;
  plan: PlanId | PackId;
  amountPaise: number;
  days: number;
  credits?: number;
  status: "paid" | "pending" | "failed";
  utr: string | null;
  createdAt: number;
  paidAt: number | null;
};
export type Place = {
  name: string;
  lat: number;
  lon: number;
  country: string;
  tzOffsetMin: number | null;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Called when the server says a verified WhatsApp number is needed first. */
let phoneNeeded: (() => void) | null = null;
export const onPhoneRequired = (fn: (() => void) | null) => {
  phoneNeeded = fn;
};

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
  } catch (e) {
    reportError(
      "network",
      `${init.method ?? "GET"} ${path.split("?")[0]}: ${(e as Error).message}`,
    );
    throw new ApiError(
      "You seem to be offline. Check your connection and try again.",
      0,
    );
  }
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  };
  if (res.status === 403 && body.code === "phone-required") phoneNeeded?.();
  if (res.status >= 500)
    reportError(
      "api",
      `${init.method ?? "GET"} ${path.split("?")[0]} ${res.status}: ${body.error ?? ""}`,
    );
  if (!res.ok)
    throw new ApiError(
      body.error ?? "Something went wrong. Please try again.",
      res.status,
    );
  return body as T;
}

/**
 * Asks, showing the answer as it is written: onText gets the text so far, and the finished
 * answer is returned. Falls back to a plain request where the response can't be streamed.
 */
async function askStreamed(
  payload: Record<string, unknown>,
  onText: (text: string) => void,
): Promise<AskResult> {
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/ask`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ...payload, stream: true }),
    });
  } catch (e) {
    reportError("network", `POST /api/ask: ${(e as Error).message}`);
    throw new ApiError("You seem to be offline. Check your connection and try again.", 0);
  }
  const streamed = res.ok && res.body && (res.headers.get("content-type") ?? "").includes("ndjson");
  if (!streamed) {
    const body = (await res.json().catch(() => ({}))) as AskResult & { error?: string; code?: string };
    if (res.status === 403 && body.code === "phone-required") phoneNeeded?.();
    if (res.status >= 500) reportError("api", `POST /api/ask ${res.status}: ${body.error ?? ""}`);
    if (!res.ok) throw new ApiError(body.error ?? "Something went wrong. Please try again.", res.status);
    return body;
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line) as { text?: string; result?: AskResult; error?: string; status?: number };
      if (msg.text) onText(msg.text);
      if (msg.result) return msg.result;
      if (msg.error) {
        if ((msg.status ?? 500) >= 500) reportError("api", `POST /api/ask stream: ${msg.error}`);
        throw new ApiError(msg.error, msg.status ?? 500);
      }
    }
    if (done) break;
  }
  throw new ApiError("Something went wrong. Please try again.", 500);
}

export const api = {
  /** Like ask, with the answer shown as it is written. */
  askLive: (
    question: string,
    lang: Lang | undefined,
    conversationId: string | null,
    onText: (text: string) => void,
    tarot?: { count: 1 | 3 },
    mode?: ChatKind | null,
  ) => askStreamed({ question, lang, conversationId, tarot, mode: mode ?? undefined }, onText),
  ask: (
    question: string,
    lang: Lang | undefined,
    conversationId: string | null,
    tarot?: { count: 1 | 3 },
    mode?: ChatKind | null,
  ) =>
    call<AskResult>("/api/ask", {
      method: "POST",
      body: JSON.stringify({ question, lang, conversationId, tarot, mode: mode ?? undefined }),
    }),
  profile: () =>
    call<{
      details: BirthDetails | null;
      palms: Record<Hand, number | null>;
      prakriti: Prakriti | null;
      vikriti: Vikriti | null;
    }>("/api/profile"),
  saveVikriti: (answers: ("v" | "p" | "k" | "n")[]) =>
    call<{ vikriti: Vikriti }>("/api/vikriti", {
      method: "PUT",
      body: JSON.stringify({ answers }),
    }),
  startPhone: (phone: string) =>
    call<{ phone: string }>("/api/phone/start", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),
  verifyPhone: (code: string) =>
    call<{ phone: string }>("/api/phone/verify", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  snapshot: () => call<Snapshot>("/api/snapshot"),
  savePrakriti: (answers: ("v" | "p" | "k")[]) =>
    call<{ prakriti: Prakriti }>("/api/prakriti", {
      method: "PUT",
      body: JSON.stringify({ answers }),
    }),
  saveProfile: (details: BirthDetails) =>
    call<{ details: BirthDetails }>("/api/profile", {
      method: "PUT",
      body: JSON.stringify({ ...details, consent: true }),
    }),
  payments: () => call<{ payments: Purchase[] }>("/api/payments"),
  deleteProfile: () =>
    call<{ deleted: boolean }>("/api/profile", { method: "DELETE" }),
  palmPhoto: (hand: Hand) =>
    call<{ hand: Hand; mime: string; data: string }>(`/api/palm-photo/${hand}`),
  savePalmPhoto: (hand: Hand, image: string, mime: string) =>
    call<{ saved: boolean }>(`/api/palm-photo/${hand}`, {
      method: "PUT",
      body: JSON.stringify({ image, mime, consent: true }),
    }),
  deletePalmPhoto: (hand: Hand) =>
    call<{ deleted: boolean }>(`/api/palm-photo/${hand}`, { method: "DELETE" }),
  places: (q: string) =>
    call<{ places: Place[] }>(`/api/places?q=${encodeURIComponent(q)}`),
  conversations: () =>
    call<{ conversations: ConversationSummary[] }>("/api/conversations"),
  conversation: (id: string) =>
    call<{ id: string; title: string; kind?: ChatKind; messages: StoredMessage[] }>(
      `/api/conversations/${id}`,
    ),
  deleteConversation: (id: string) =>
    call<{ deleted: boolean }>(`/api/conversations/${id}`, {
      method: "DELETE",
    }),
  me: () => call<Me>("/api/me"),
  reports: () => call<ReportsList>("/api/reports"),
  report: (key: string) =>
    call<{ spec: ReportSummary; credits: number; report: WrittenReport | null }>(`/api/reports/${key}`),
  unlockReport: (key: string, lang: Lang) =>
    call<{ spec: ReportSummary; credits: number; report: WrittenReport | null }>(`/api/reports/${key}`, {
      method: "POST",
      body: JSON.stringify({ lang }),
    }),
  pay: (plan: PlanId | PackId, test = false) =>
    call<{ orderId: string; checkoutUrl: string }>("/api/pay", {
      method: "POST",
      body: JSON.stringify(test ? { plan, test } : { plan }),
    }).then((r) => {
      track(`premium/checkout-${plan}`);
      return r;
    }),
  adminErrors: () => call<AdminErrors>("/api/admin/errors"),
  payment: (id: string) => call<PaymentState>(`/api/pay/${id}`),
  feedback: (messageId: string, value: 1 | -1) =>
    call<{ saved: boolean }>("/api/feedback", {
      method: "POST",
      body: JSON.stringify({ messageId, value }),
    }),
};
