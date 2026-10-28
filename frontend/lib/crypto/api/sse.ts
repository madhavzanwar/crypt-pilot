import {
  buildUrl,
  failureFromResponse,
  resolveFetch,
  transportError,
  type ApiClientOptions,
} from "./client";
import { ApiError } from "./errors";
import { checkResponseSchema, stepEventSchema, streamErrorEventSchema } from "./schemas";
import type { CheckResponse, Lang, StepEvent } from "./types";

// ---------------------------------------------------------------- parser

export interface SseMessage {
  event: string;
  data: string;
  id?: string;
}

export interface SseParser {
  /** Feed decoded text; chunks may split lines, `\r\n` pairs and events anywhere. */
  push(chunk: string): void;
  /** Call at end of stream. Flushes a final event that lacked its blank line. */
  end(): void;
}

/** Minimal SSE parser following the WHATWG rules (CR, LF and CRLF line ends, multi-line data, comments). */
export function createSseParser(onMessage: (m: SseMessage) => void): SseParser {
  let buf = "";
  let started = false;
  let event = "";
  let id: string | undefined;
  let data: string[] = [];

  const dispatch = () => {
    if (data.length > 0) {
      const m: SseMessage = { event: event || "message", data: data.join("\n") };
      if (id !== undefined) m.id = id;
      data = [];
      event = "";
      onMessage(m);
    }
    event = "";
  };

  const line = (l: string) => {
    if (l === "") return dispatch();
    if (l.startsWith(":")) return; // comment / keep-alive ping
    const i = l.indexOf(":");
    const field = i < 0 ? l : l.slice(0, i);
    let value = i < 0 ? "" : l.slice(i + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
    else if (field === "id" && !value.includes("\0")) id = value;
  };

  return {
    push(chunk) {
      buf += chunk;
      if (!started && buf.length > 0) {
        started = true;
        if (buf.startsWith("﻿")) buf = buf.slice(1);
      }
      let start = 0;
      for (let i = 0; i < buf.length; i++) {
        const c = buf[i];
        if (c !== "\n" && c !== "\r") continue;
        if (c === "\r" && i === buf.length - 1) break; // maybe the first half of "\r\n"
        const text = buf.slice(start, i);
        if (c === "\r" && buf[i + 1] === "\n") i++;
        start = i + 1;
        line(text);
      }
      buf = buf.slice(start);
    },
    end() {
      if (buf.endsWith("\r")) buf = buf.slice(0, -1);
      if (buf !== "") line(buf);
      buf = "";
      dispatch();
    },
  };
}

// ---------------------------------------------------------------- streamCheck

export interface StreamHandlers {
  onStep?: (step: StepEvent) => void;
  onResult?: (result: CheckResponse) => void;
  /** Called for every failure before the returned promise rejects with the same error. */
  onError?: (error: ApiError) => void;
}

/**
 * POST /api/check/stream with fetch + ReadableStream (EventSource cannot POST a body or be tuned for
 * cookies). Resolves with the CheckResponse of the `result` event and rejects with an ApiError for
 * `event: error`, HTTP errors (400/402/429...), a `result` whose status is "error" (the error carries
 * that CheckResponse as `body`, like `client.check`), network failure, abort, or a stream that ends
 * without `result` or `error` (code `stream_ended`).
 */
export async function streamCheck(
  options: ApiClientOptions,
  address: string,
  lang: Lang,
  handlers: StreamHandlers = {},
  signal?: AbortSignal,
): Promise<CheckResponse> {
  const fail = (error: ApiError): never => {
    handlers.onError?.(error);
    throw error;
  };

  let res: Response;
  try {
    res = await resolveFetch(options)(buildUrl(options.baseUrl, "/api/check/stream"), {
      method: "POST",
      credentials: "include",
      signal,
      headers: { accept: "text/event-stream", "content-type": "application/json" },
      body: JSON.stringify({ address, lang }),
    });
  } catch (e) {
    return fail(transportError(e, signal));
  }
  if (!res.ok) return fail(await failureFromResponse(res, signal));
  if (!res.body) return fail(new ApiError({ status: res.status, code: "invalid_response", detail: "no body" }));

  // assigned inside the parser callback (the cast stops TS narrowing it to `undefined`)
  let outcome = undefined as { result: CheckResponse } | { error: ApiError } | undefined;

  const onMessage = (m: SseMessage) => {
    if (outcome) return;
    const json = parseJson(m.data);
    if (m.event === "step") {
      const step = stepEventSchema.safeParse(json);
      if (step.success) handlers.onStep?.(step.data);
    } else if (m.event === "result") {
      const r = checkResponseSchema.safeParse(json);
      if (!r.success) {
        outcome = { error: new ApiError({ status: res.status, code: "invalid_response", detail: r.error.message }) };
      } else if (r.data.status === "error") {
        outcome = { error: new ApiError({ status: 503, code: r.data.error ?? "service_not_ready", body: r.data }) };
      } else {
        outcome = { result: r.data };
      }
    } else if (m.event === "error") {
      const e = streamErrorEventSchema.safeParse(json);
      outcome = {
        error: new ApiError({
          status: e.success ? e.data.status : 500,
          code: e.success ? e.data.error : "invalid_response",
        }),
      };
    }
  };

  const parser = createSseParser(onMessage);
  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  try {
    while (!outcome) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (e) {
        return fail(transportError(e, signal));
      }
      if (chunk.done) {
        parser.push(decoder.decode());
        parser.end();
        break;
      }
      parser.push(decoder.decode(chunk.value, { stream: true }));
    }
  } finally {
    reader.cancel().catch(() => undefined); // result/error seen, or a handler threw: stop downloading
  }

  if (!outcome) return fail(new ApiError({ status: res.status, code: "stream_ended" }));
  if ("error" in outcome) return fail(outcome.error);
  handlers.onResult?.(outcome.result);
  return outcome.result;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
