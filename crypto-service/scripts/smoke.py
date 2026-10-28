"""Hit every endpoint of a RUNNING server in order and print PASS/FAIL (plus measured latencies).

Usage: uv run python -m scripts.smoke --base http://localhost:8000 [--runs 5]
Endpoints that depend on optional configuration (payments, voice, crypto) accept their documented
"not configured" status (503) as PASS and say so.
"""

from __future__ import annotations

import argparse
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx

results: list[tuple[str, bool, str]] = []


def step(name: str, fn: Callable[[], tuple[bool, str]]) -> None:
    try:
        ok, note = fn()
    except Exception as exc:  # report and continue
        ok, note = False, f"{type(exc).__name__}: {exc}"
    results.append((name, ok, note))
    print(f"{'PASS' if ok else 'FAIL'}  {name:38s} {note}")


def tiny_webm() -> bytes | None:
    if not shutil.which("ffmpeg"):
        return None
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "a.webm"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
                        "-c:a", "libopus", str(out)], check=True)
        return out.read_bytes()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--runs", type=int, default=5, help="timed /api/check runs per demo wallet (after warm-up)")
    args = ap.parse_args()
    c = httpx.Client(base_url=args.base, timeout=30)
    ctx: dict[str, Any] = {}

    def health() -> tuple[bool, str]:
        b = c.get("/api/health").json()
        ctx["health"] = b
        return b.get("ok") is True, f"engine={b.get('engine')} ok={b.get('engineOk')} model={b.get('modelLoaded')} " \
                                    f"voice={b.get('voiceProvider')} data={b.get('dataSource')}"

    def demo() -> tuple[bool, str]:
        w = c.get("/api/demo-wallets").json()["wallets"]
        ctx["wallets"] = w
        return len(w) > 0, f"{len(w)} wallets: " + ",".join(sorted({x['expected'] for x in w}))

    def credits() -> tuple[bool, str]:
        b = c.get("/api/credits").json()
        return isinstance(b.get("balance"), int), f"balance={b['balance']} packs={len(b['packs'])}"

    def checks() -> tuple[bool, str]:
        wrong = []
        for w in ctx["wallets"]:
            r = c.post("/api/check", json={"address": w["address"], "lang": "en"})
            if r.status_code == 402:
                return False, "out of credits: raise STARTING_CREDITS for smoke tests"
            b = r.json()
            if b.get("verdict") != w["expected"]:
                wrong.append(f"{w['expected']}->{b.get('verdict')}")
        return not wrong, "all verdicts as expected" if not wrong else "mismatch " + ", ".join(wrong)

    def stream() -> tuple[bool, str]:
        w = ctx["wallets"][0]
        with c.stream("POST", "/api/check/stream", json={"address": w["address"], "lang": "hi"}) as r:
            text = "".join(r.iter_text())
        steps = text.count("event: step")
        return steps == 5 and "event: result" in text, f"{steps} steps, result={'event: result' in text}"

    def latency() -> tuple[bool, str]:
        times = []
        for w in ctx["wallets"]:
            for i in range(args.runs):
                lang = "en" if i % 2 == 0 else "hi"
                t0 = time.perf_counter()
                r = c.post("/api/check", json={"address": w["address"], "lang": lang})
                times.append((time.perf_counter() - t0) * 1000)
                if r.status_code != 200:
                    return False, f"status {r.status_code}"
        times.sort()
        p95 = times[max(0, round(0.95 * len(times)) - 1)]
        note = "cache hits included if CACHE_TTL_SECONDS>0"
        return True, f"n={len(times)} median={statistics.median(times):.0f}ms p95={p95:.0f}ms ({note})"

    def bad_input() -> tuple[bool, str]:
        r = c.post("/api/check", json={"address": " ".join(["abandon"] * 11 + ["about"]), "lang": "en"})
        return r.status_code == 400 and r.json() == {"error": "secret_input"}, f"{r.status_code} {r.json()}"

    def benchmark() -> tuple[bool, str]:
        b = c.get("/api/benchmark").json()
        return b.get("status") in ("ok", "not_measured"), f"status={b['status']}"

    def checkout() -> tuple[bool, str]:
        r = c.post("/api/checkout", json={"packId": "starter"})
        return r.status_code in (200, 503, 404), f"{r.status_code} {r.json()}"

    def crypto() -> tuple[bool, str]:
        r = c.post("/api/crypto-invoice", json={"packId": "starter", "coin": "btc"})
        if r.status_code == 200:
            inv = r.json()
            s = c.get(f"/api/crypto-invoice/{inv['invoiceId']}").json()
            return s["status"] in ("waiting", "paid", "expired"), f"invoice status={s['status']}"
        return r.status_code in (503, 404), f"{r.status_code} {r.json()} (not configured)"

    def transcribe() -> tuple[bool, str]:
        audio = tiny_webm()
        if audio is None:
            return True, "skipped (no ffmpeg on this machine)"
        r = c.post("/api/transcribe", files={"audio": ("a.webm", audio, "audio/webm")}, data={"lang": "en"})
        return r.status_code in (200, 503), f"{r.status_code} {r.json()}"

    for name, fn in [("GET /api/health", health), ("GET /api/demo-wallets", demo), ("GET /api/credits", credits),
                     ("POST /api/check (demo wallets)", checks), ("POST /api/check/stream", stream),
                     ("POST /api/check latency", latency), ("POST /api/check secret guard", bad_input),
                     ("GET /api/benchmark", benchmark), ("POST /api/checkout", checkout),
                     ("POST/GET /api/crypto-invoice", crypto), ("POST /api/transcribe", transcribe)]:
        needs_wallets = name.startswith("POST /api/check") and name != "POST /api/check secret guard"
        if needs_wallets and not ctx.get("wallets"):
            results.append((name, False, "no demo wallets"))
            print(f"FAIL  {name:38s} no demo wallets")
            continue
        step(name, fn)
    failed = [n for n, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
