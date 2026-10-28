import type { CheckResponse, Lang } from "./types";

/** What the UI should offer next. */
export type ErrorAction =
  | "open-credits"
  | "seed-phrase-warning"
  | "fix-address"
  | "use-browser-speech"
  | "retry-later"
  | "check-connection"
  | "none";

export interface UserMessage {
  message: string;
  action: ErrorAction;
}

export interface ApiErrorInit {
  /** HTTP status, or 0 when there was no HTTP response (network failure, abort). */
  status: number;
  /**
   * Backend error code (`no_credits`, `rate_limited`, ...) or one of the client-side codes:
   * `network_error`, `aborted`, `invalid_response`, `stream_ended`.
   */
  code: string;
  /** Set when the backend answered a non-2xx with a full CheckResponse (status "error"). */
  body?: CheckResponse;
  /** Debug detail (never shown to users). */
  detail?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: CheckResponse | undefined;
  readonly detail: string | undefined;

  constructor(init: ApiErrorInit) {
    super(init.code);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.body = init.body;
    this.detail = init.detail;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

type Entry = { en: string; hi: string; action: ErrorAction };

const GENERIC: Entry = {
  en: "Something went wrong. Please try again.",
  hi: "कुछ गड़बड़ हो गई। कृपया फिर से कोशिश करें।",
  action: "none",
};

const MESSAGES: Record<string, Entry> = {
  no_credits: {
    en: "You have no checks left. Add credits to continue.",
    hi: "आपके पास कोई चेक बाकी नहीं है। आगे बढ़ने के लिए क्रेडिट जोड़ें।",
    action: "open-credits",
  },
  secret_input: {
    en: "Never share your seed phrase or private key. Cryptiq only needs a public wallet address.",
    hi: "अपना सीड फ्रेज़ या प्राइवेट की कभी किसी को न बताएँ। Cryptiq को सिर्फ़ वॉलेट का पब्लिक पता चाहिए।",
    action: "seed-phrase-warning",
  },
  invalid_address: {
    en: "That does not look like a valid Bitcoin address. Please check it and try again.",
    hi: "यह सही बिटकॉइन पता नहीं लगता। कृपया जाँचकर फिर से कोशिश करें।",
    action: "fix-address",
  },
  rate_limited: {
    en: "Too many requests. Please wait a minute and try again.",
    hi: "बहुत ज़्यादा अनुरोध हो गए हैं। कृपया एक मिनट रुककर फिर से कोशिश करें।",
    action: "retry-later",
  },
  voice_unavailable: {
    en: "Voice input is not available right now. You can use your browser's speech recognition instead.",
    hi: "अभी आवाज़ से इनपुट उपलब्ध नहीं है। आप अपने ब्राउज़र की आवाज़ पहचान इस्तेमाल कर सकते हैं।",
    action: "use-browser-speech",
  },
  empty_audio: {
    en: "No audio was recorded. Please try again.",
    hi: "कोई आवाज़ रिकॉर्ड नहीं हुई। कृपया फिर से कोशिश करें।",
    action: "none",
  },
  request_too_large: {
    en: "That request is too large.",
    hi: "यह अनुरोध बहुत बड़ा है।",
    action: "none",
  },
  audio_too_large: {
    en: "The recording is too large. Please keep it under 5 MB.",
    hi: "रिकॉर्डिंग बहुत बड़ी है। कृपया इसे 5 MB से कम रखें।",
    action: "none",
  },
  audio_too_long: {
    en: "The recording is too long. Please keep it under 30 seconds.",
    hi: "रिकॉर्डिंग बहुत लंबी है। कृपया इसे 30 सेकंड से कम रखें।",
    action: "none",
  },
  unsupported_audio_type: {
    en: "This audio format is not supported.",
    hi: "यह ऑडियो फ़ॉर्मेट काम नहीं करता।",
    action: "none",
  },
  audio_unreadable: {
    en: "We could not read that recording. Please try again.",
    hi: "हम यह रिकॉर्डिंग पढ़ नहीं पाए। कृपया फिर से कोशिश करें।",
    action: "none",
  },
  invalid_request: {
    en: "Something in the request was not valid. Please check it and try again.",
    hi: "अनुरोध में कुछ सही नहीं है। कृपया जाँचकर फिर से कोशिश करें।",
    action: "none",
  },
  internal_error: {
    en: "Something went wrong on our side. Please try again in a moment.",
    hi: "हमारी तरफ़ से कुछ गड़बड़ हो गई। कृपया थोड़ी देर बाद फिर से कोशिश करें।",
    action: "none",
  },
  try_again: {
    en: "We are busy for a moment. Please try again in a few seconds.",
    hi: "अभी थोड़ी भीड़ है। कृपया कुछ सेकंड बाद फिर से कोशिश करें।",
    action: "retry-later",
  },
  benchmark_running: {
    en: "A benchmark is already running. Please wait for it to finish.",
    hi: "बेंचमार्क पहले से चल रहा है। कृपया उसके पूरा होने का इंतज़ार करें।",
    action: "retry-later",
  },
  graph_unavailable: {
    en: "The graph service is not responding. You were not charged. Please try again soon.",
    hi: "ग्राफ सेवा जवाब नहीं दे रही है। आपके क्रेडिट नहीं कटे। कृपया थोड़ी देर बाद फिर से कोशिश करें।",
    action: "retry-later",
  },
  model_not_trained: {
    en: "The risk model is not ready yet. Please try again later.",
    hi: "जोखिम मॉडल अभी तैयार नहीं है। कृपया बाद में कोशिश करें।",
    action: "retry-later",
  },
  llm_unavailable: {
    en: "The explanation service is not available right now. Please try again later.",
    hi: "समझाने वाली सेवा अभी उपलब्ध नहीं है। कृपया बाद में कोशिश करें।",
    action: "retry-later",
  },
  crypto_unavailable: {
    en: "Crypto payments are not available right now. Please try again later.",
    hi: "अभी क्रिप्टो से भुगतान नहीं हो सकता। कृपया बाद में कोशिश करें।",
    action: "retry-later",
  },
  payments_unavailable: {
    en: "Payments are not available right now. Please try again later.",
    hi: "अभी भुगतान नहीं हो सकता। कृपया बाद में कोशिश करें।",
    action: "retry-later",
  },
  service_not_ready: {
    en: "The service is starting up. Please try again in a moment.",
    hi: "सेवा अभी शुरू हो रही है। कृपया थोड़ी देर बाद कोशिश करें।",
    action: "retry-later",
  },
  unknown_pack: {
    en: "That credit pack is not available.",
    hi: "यह क्रेडिट पैक उपलब्ध नहीं है।",
    action: "none",
  },
  not_found: { en: "We could not find that.", hi: "यह नहीं मिला।", action: "none" },
  forbidden: {
    en: "You are not allowed to do that.",
    hi: "आपको ऐसा करने की अनुमति नहीं है।",
    action: "none",
  },
  benchmark_too_big: {
    en: "That benchmark size is too big. Please try a smaller number.",
    hi: "बेंचमार्क का आकार बहुत बड़ा है। कृपया कोई छोटी संख्या चुनें।",
    action: "none",
  },
  network_error: {
    en: "Could not reach Cryptiq. Please check your internet connection and try again.",
    hi: "Cryptiq तक नहीं पहुँच सके। कृपया अपना इंटरनेट जाँचें और फिर से कोशिश करें।",
    action: "check-connection",
  },
  invalid_response: {
    en: "We got an unexpected reply from the server. Please try again.",
    hi: "सर्वर से अजीब-सा जवाब मिला। कृपया फिर से कोशिश करें।",
    action: "retry-later",
  },
  stream_ended: {
    en: "The connection closed before the check finished. Please try again.",
    hi: "जाँच पूरी होने से पहले कनेक्शन बंद हो गया। कृपया फिर से कोशिश करें।",
    action: "retry-later",
  },
  aborted: { en: "Cancelled.", hi: "रद्द किया गया।", action: "none" },
};

/** Codes carry free text in some cases (`invalid request: address`, `sample_size_above_cap_50`). */
function normalizeCode(code: string): string {
  if (code.startsWith("invalid request")) return "invalid_request";
  if (code.startsWith("sample_size_above_cap") || code === "token_budget_exceeded") return "benchmark_too_big";
  if (code === "audio_conversion_timeout") return "audio_unreadable";
  return code;
}

/** Used when the code is unknown: fall back on the HTTP status. */
const BY_STATUS: Record<number, string> = {
  402: "no_credits",
  413: "request_too_large",
  415: "unsupported_audio_type",
  422: "invalid_request",
  429: "rate_limited",
  500: "internal_error",
  502: "payments_unavailable",
  503: "service_not_ready",
};

const lookup = (key: string): Entry | undefined => (Object.hasOwn(MESSAGES, key) ? MESSAGES[key] : undefined);

/** Friendly EN/HI text plus an action hint for any thrown value (ApiError or not). */
export function messageFor(error: unknown, lang: Lang): UserMessage {
  let entry = GENERIC;
  if (error instanceof ApiError) {
    const code = normalizeCode(error.code);
    const fallback = BY_STATUS[error.status];
    entry = lookup(code) ?? (fallback ? lookup(fallback) : undefined) ?? GENERIC;
  }
  return { message: entry[lang], action: entry.action };
}
