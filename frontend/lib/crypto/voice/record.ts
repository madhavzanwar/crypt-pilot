/** Helpers for push-to-talk recording (MediaRecorder + AnalyserNode). Pure where possible so they can be tested. */

/** The service accepts webm/ogg/wav/mp4 up to 30 s; stop a little early so a recording never exceeds it. */
export const MAX_RECORD_SECONDS = 29;
/** A press shorter than this is a tap (toggle mode), a longer press is hold-to-talk. */
export const TAP_MS = 350;
/** Recordings shorter than this are treated as accidental. */
export const MIN_RECORD_MS = 400;

const PREFERRED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"] as const;

/** First supported container for MediaRecorder, or undefined to let the browser choose. */
export function pickMimeType(isSupported: (type: string) => boolean): string | undefined {
  return PREFERRED_MIME_TYPES.find((t) => isSupported(t));
}

export function isRecorderSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}

/** 0 -> "0:00", 7 -> "0:07", 65 -> "1:05". */
export function formatTimer(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Turns time-domain analyser data (bytes centred on 128) into `bars` loudness values between 0 and 1,
 * one per equal slice of the buffer (RMS per slice, boosted a little so quiet speech still moves the bars).
 */
export function levelsFromTimeDomain(data: ArrayLike<number>, bars: number): number[] {
  const n = data.length;
  if (bars <= 0) return [];
  if (n === 0) return new Array<number>(bars).fill(0);
  const out: number[] = [];
  for (let b = 0; b < bars; b++) {
    const from = Math.floor((b * n) / bars);
    const to = Math.max(from + 1, Math.floor(((b + 1) * n) / bars));
    let sum = 0;
    for (let i = from; i < to; i++) {
      const v = ((data[i] ?? 128) - 128) / 128;
      sum += v * v;
    }
    out.push(Math.min(1, Math.sqrt(sum / (to - from)) * 3));
  }
  return out;
}
