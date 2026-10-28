"""Chain Analyst: the council specialist that screens crypto wallets against the crypto service's graph.

It is the only council agent that does not read the user's finances: the user lists up to five public wallet addresses
they pay or hold, and each one is checked by the crypto service (`app.crypto_bridge.client.check_wallet`, a TigerGraph
k-hop query, or the NetworkX / replay fallback when TigerGraph is not the engine). Nothing here invents a finding:

* no wallets  -> the agent does not run (callers skip it);
* service unreachable (check_wallet returns None) -> that wallet is "offline" and the agent abstains;
* verdict UNKNOWN -> "not in dataset", an abstention. Absence from the dataset is NOT a safe signal;
* BLOCK -> high risk, WARN -> medium, ALLOW -> low.

TigerGraph is named only when the response says `engine == "tigergraph"`; otherwise the engine that answered is named.
"""
from __future__ import annotations

import asyncio
import concurrent.futures
import re
import time
from typing import Any

from app.crypto_bridge.client import check_wallet

AGENT_ID = "chain_analyst"
AGENT_NAME = "Chain Analyst"
AGENT_JOB = "Screens crypto wallets you pay or hold against a transaction graph"
MAX_WALLETS = 5
OFFLINE_NOTE = "Chain Analyst offline"

# Format check only (the crypto service does the real checksum validation). DEMO-... is the synthetic fixture.
_LEGACY = re.compile(r"^[13][1-9A-HJ-NP-Za-km-z]{25,34}$")
_BECH32 = re.compile(r"^bc1[ac-hj-np-z02-9]{11,87}$", re.IGNORECASE)
_DEMO = re.compile(r"^DEMO-[A-Za-z0-9][A-Za-z0-9-]{1,40}$")

_ENGINES = {"tigergraph": "TigerGraph", "networkx": "NetworkX fallback", "replay": "Recorded replay"}
_SEVERITY = {"BLOCK": "high", "WARN": "medium", "ALLOW": "low", "UNKNOWN": "low"}
# Council levels are low < 25 <= medium < 50 <= high < 75 <= critical; each verdict is kept inside its own band.
_BAND = {"BLOCK": (50, 74, "high"), "WARN": (25, 49, "medium"), "ALLOW": (0, 24, "low")}
_ORDER = {"BLOCK": 3, "WARN": 2, "ALLOW": 1}  # worst verdict among the wallets decides the vote


def short(address: str, head: int = 6, tail: int = 6) -> str:
    return address if len(address) <= head + tail + 1 else f"{address[:head]}…{address[-tail:]}"


def valid_address(raw: str) -> str | None:
    """The normalised address when it looks like a Bitcoin address (or a DEMO- placeholder), else None."""
    a = (raw or "").strip()
    if _DEMO.match(a) or _LEGACY.match(a):
        return a
    if _BECH32.match(a) and a in (a.lower(), a.upper()):  # mixed case is invalid bech32
        return a
    return None


def clean_wallets(raw: list[str] | None) -> tuple[list[str], int]:
    """(wallets to screen, number rejected). Deduplicated, at most MAX_WALLETS; rejected text is never echoed or logged."""
    out: list[str] = []
    rejected = 0
    for item in raw or []:
        a = valid_address(str(item))
        if a is None:
            rejected += 1
            continue
        a = a.lower() if a.lower().startswith("bc1") else a
        if a not in out:
            out.append(a)
    if len(out) > MAX_WALLETS:
        rejected += len(out) - MAX_WALLETS
        out = out[:MAX_WALLETS]
    return out, rejected


def _reason(verdict: str, r: dict[str, Any], engine: str | None) -> str:
    """One plain-language line built from the structured fields (the explanation text is not reused)."""
    if verdict == "UNKNOWN":
        return "Not in dataset: there is no graph evidence about this wallet either way, so this is not a safe signal."
    bits: list[str] = []
    if (r.get("labelHits") or {}).get("ofac"):
        bits.append("listed on the OFAC sanctions list")
    if (r.get("labelHits") or {}).get("ransomwhere"):
        bits.append("listed in the Ransomwhere database")
    hops = r.get("hopsToNearestIllicit")
    if r.get("datasetLabel") == "illicit" or hops == 0:
        bits.append("labelled illicit in the dataset")
    elif isinstance(hops, int):
        bits.append(f"{hops} hop{'s' if hops != 1 else ''} from the nearest illicit wallet")
    elif verdict == "ALLOW":
        bits.append("no illicit wallet found nearby")
    for t in (r.get("topReasons") or [])[:1]:
        t = str(t).strip()
        if t and (engine == "tigergraph" or "tigergraph" not in t.lower()) and t.lower() not in " ".join(bits).lower():
            bits.append(t.rstrip("."))
    text = "; ".join(bits) or "no further detail from the graph"
    return (text[0].upper() + text[1:] + ".")[:220]


def _offline(address: str, rtt_ms: int) -> dict[str, Any]:
    return {"address": address, "status": "offline", "verdict": None, "risk_score": None, "hops": None, "ofac": False,
            "reason": f"{OFFLINE_NOTE}: the crypto service could not be reached.", "engine": None, "engine_label": None,
            "tigergraph": False, "ms": None, "rtt_ms": rtt_ms, "vote": None, "mock": False, "limitations": []}


def summarise(address: str, resp: dict[str, Any] | None, rtt_ms: int = 0) -> dict[str, Any]:
    """One wallet's result in a fixed shape; `vote` is high / medium / low, or None when the agent abstains on it."""
    if not isinstance(resp, dict) or resp.get("status") == "error" or resp.get("verdict") not in ("ALLOW", "WARN", "BLOCK", "UNKNOWN"):
        return _offline(address, rtt_ms)
    verdict = resp["verdict"]
    engine = resp.get("engine") if resp.get("engine") in _ENGINES else None
    tg = resp.get("tigergraph") if isinstance(resp.get("tigergraph"), dict) else {}
    ms = tg.get("ms")
    score = resp.get("riskScore")
    return {
        "address": address,
        "status": "not_in_dataset" if verdict == "UNKNOWN" else "ok",
        "verdict": verdict,
        "risk_score": int(score) if isinstance(score, (int, float)) else None,
        "hops": resp.get("hopsToNearestIllicit") if isinstance(resp.get("hopsToNearestIllicit"), int) else None,
        "ofac": bool((resp.get("labelHits") or {}).get("ofac")),
        "reason": _reason(verdict, resp, engine),
        "engine": engine,
        "engine_label": _ENGINES.get(engine) if engine else "Graph service",
        "tigergraph": engine == "tigergraph",
        "ms": int(ms) if isinstance(ms, (int, float)) else None,
        "rtt_ms": rtt_ms,
        "vote": _BAND[verdict][2] if verdict in _BAND else None,
        "mock": bool(resp.get("isMock")),
        "dataset_label": resp.get("datasetLabel"),
        "limitations": [str(x) for x in (resp.get("limitations") or [])[:2]],
    }


async def _one(address: str, lang: str) -> dict[str, Any]:
    t0 = time.monotonic()
    try:
        resp = await check_wallet(address, lang)
    except Exception:  # noqa: BLE001 - check_wallet promises not to raise; one wallet must never stop the council
        resp = None
    return summarise(address, resp, int((time.monotonic() - t0) * 1000))


async def screen_wallets(wallets: list[str], lang: str = "en") -> list[dict[str, Any]]:
    """One result per wallet, in input order, all checked in parallel."""
    return list(await asyncio.gather(*(_one(a, lang) for a in wallets)))


def run_sync(coro):
    """Run a coroutine from sync code (the evidence investigation is a sync generator in a worker thread)."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


# --- Evidence Council: findings in the council's native format -------------------------------------------------------


def _engine_tag(r: dict[str, Any]) -> str:
    if r["status"] == "offline":
        return OFFLINE_NOTE
    ms = f" in {r['ms']} ms" if r.get("ms") is not None else ""
    return f"{r['engine_label']}{ms}"


def wallet_finding(r: dict[str, Any]) -> dict[str, Any] | None:
    """One finding per wallet the service answered about. `info` marks findings that are not a problem (ALLOW, UNKNOWN):
    they are shown but never counted in the risk score."""
    if r["status"] == "offline":
        return None
    v = r["verdict"]
    score = f", risk {r['risk_score']}/100" if r["risk_score"] is not None else ""
    if v == "UNKNOWN":
        title = f"Wallet {short(r['address'])}: not in dataset"
    else:
        title = f"Wallet {short(r['address'])}: {v}{score}"
    detail = f"{r['reason']} Answered by {_engine_tag(r)}."
    return {
        "agent": AGENT_ID, "severity": _SEVERITY[v], "title": title, "detail": detail,
        "merchant": None, "amount": 0.0, "txn_ids": [],
        "info": v in ("ALLOW", "UNKNOWN"),
        "chain": {k: r[k] for k in ("address", "verdict", "risk_score", "hops", "ofac", "reason", "engine", "engine_label", "tigergraph", "ms", "rtt_ms", "mock", "limitations")},
    }


def evidence_step(wallets: list[str], lang: str = "en") -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """(findings, summary fields) for the Evidence Council's Chain Analyst stage."""
    results = run_sync(screen_wallets(wallets, lang))
    findings = [f for f in (wallet_finding(r) for r in results) if f]
    answered = [r for r in results if r["status"] != "offline"]
    engines = sorted({r["engine"] for r in answered if r["engine"]})
    extra: dict[str, Any] = {
        "findings": sum(1 for f in findings if not f["info"]),  # problems only: this drives the red/green node
        "wallets": len(wallets), "screened": len(answered),
        "engine": engines[0] if len(engines) == 1 else ("mixed" if engines else None),
        "tigergraph": bool(answered) and all(r["tigergraph"] for r in answered),
        "graph_ms": max((r["ms"] for r in answered if r["ms"] is not None), default=None),
        "ai": "off",
    }
    if not answered:
        extra["error"] = OFFLINE_NOTE
    return findings, extra


# --- Risk Council: one vote ---------------------------------------------------------------------------------------


def council_vote(results: list[dict[str, Any]]) -> dict[str, Any]:
    """The agent's single council vote, in the council's vote shape (plus `abstain` and `chain`)."""
    chain = {"wallets": results}
    voting = [r for r in results if r["vote"]]
    base = {"agent": AGENT_ID, "name": AGENT_NAME, "source": "graph", "round": 1, "chain": chain}
    if not voting:
        offline = [r for r in results if r["status"] == "offline"]
        if len(offline) == len(results):
            why, do = f"{OFFLINE_NOTE}: the crypto service could not be reached, so it abstains.", ""
        else:
            n = len(results) - len(offline)
            why = f"Abstains: {n} wallet{'s' if n != 1 else ''} not in dataset. Not in dataset does not mean safe."
            do = "Treat unknown wallets with caution."
        return {**base, "score": 0, "level": "abstain", "abstain": True, "why": why[:160], "do": do}
    worst = max(voting, key=lambda r: (_ORDER[r["verdict"]], r["risk_score"] or 0))
    lo, hi, level = _BAND[worst["verdict"]]
    raw = worst["risk_score"] if worst["risk_score"] is not None else (lo + hi) // 2
    score = max(lo, min(hi, int(raw)))
    extra = len(results) - 1
    head = f"{short(worst['address'])} {worst['verdict']}: {worst['reason']}"
    tail = ""
    if extra:
        unknown = sum(1 for r in results if r is not worst and r["status"] == "not_in_dataset")
        off = sum(1 for r in results if r is not worst and r["status"] == "offline")
        bits = [f"{extra} other wallet{'s' if extra != 1 else ''} screened"]
        if unknown:
            bits.append(f"{unknown} not in dataset")
        if off:
            bits.append(f"{off} offline")
        tail = f" ({', '.join(bits)})"
    room = 160 - len(tail)  # the vote line is capped at 160 characters: shorten the reason, never the wallet count
    why = (head if len(head) <= room else head[: room - 1].rstrip() + "…") + tail
    do = {"BLOCK": f"Do not send funds to {short(worst['address'])}", "WARN": f"Verify {short(worst['address'])} before paying", "ALLOW": ""}[worst["verdict"]]
    return {**base, "score": score, "level": level, "abstain": False, "why": why[:160], "do": do[:100]}
