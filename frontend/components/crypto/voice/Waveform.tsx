"use client";

import { useEffect, useRef } from "react";
import { levelsFromTimeDomain } from "@/lib/crypto/voice/record";
import { cn } from "@/lib/utils";

/**
 * Live loudness bars. With an AnalyserNode they follow the microphone; without one (browser speech
 * recognition, before the level meter attaches) they show a calm "listening" pulse. Updates the DOM
 * directly, so there is no React render per frame.
 */
export function Waveform({
  analyser,
  bars = 7,
  reduceMotion = false,
  className,
  barClassName = "bg-lime",
}: {
  analyser: AnalyserNode | null;
  bars?: number;
  reduceMotion?: boolean;
  className?: string;
  barClassName?: string;
}) {
  const refs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    let raf = 0;
    const data = analyser ? new Uint8Array(analyser.fftSize) : null;
    const tick = (time: number) => {
      let levels: number[];
      if (analyser && data) {
        analyser.getByteTimeDomainData(data);
        levels = levelsFromTimeDomain(data, bars);
      } else {
        levels = Array.from({ length: bars }, (_, i) => (reduceMotion ? 0.45 : 0.3 + 0.35 * Math.abs(Math.sin(time / 240 + i * 0.9))));
      }
      refs.current.forEach((el, i) => {
        if (el) el.style.transform = `scaleY(${Math.max(0.14, levels[i] ?? 0).toFixed(3)})`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [analyser, bars, reduceMotion]);

  return (
    <span aria-hidden className={cn("flex h-4 items-center gap-[3px]", className)}>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className={cn("h-full w-[3px] origin-center rounded-full", barClassName)}
          style={{ transform: "scaleY(0.14)" }}
        />
      ))}
    </span>
  );
}
