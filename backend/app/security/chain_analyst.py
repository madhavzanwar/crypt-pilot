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
import hashlib
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


_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
_B32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
_B32_GEN = (0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3)


def _base58check_ok(a: str) -> bool:
    n = 0
    for ch in a:
        n = n * 58 + _B58.index(ch)
    raw = n.to_bytes(25, "big") if n.bit_length() <= 200 else b""
    if len(raw) != 25:
        return False
    pad = len(a) - len(a.lstrip("1"))
    if raw[:pad] != b"\0" * pad:  # each leading '1' is a zero byte
        return False
    return hashlib.sha256(hashlib.sha256(raw[:21]).digest()).digest()[:4] == raw[21:]


def _bech32_polymod(values: list[int]) -> int:
    chk = 1
    for v in values:
        top = chk >> 25
        chk = (chk & 0x1FFFFFF) << 5 ^ v
        for i in range(5):
            chk ^= _B32_GEN[i] if (top >> i) & 1 else 0
    return chk


def _bech32_ok(a: str) -> bool:
    """BIP-173 (witness v0, constant 1) / BIP-350 (v1+, bech32m 0x2bc830a3) checksum for a bc1... address."""
    a = a.lower()
    if "1" not in a:
        return False
    hrp, _, data = a.rpartition("1")
    if hrp != "bc" or len(data) < 7 or any(c not in _B32 for c in data):
        return False
    vals = [_B32.index(c) for c in data]
    const = _bech32_polymod([ord(c) >> 5 for c in hrp] + [0] + [ord(c) & 31 for c in hrp] + vals)
    version = vals[0]
    return const == (1 if version == 0 else 0x2BC830A3)


def valid_address(raw: str) -> str | None:
    """The normalised address when it is a Bitcoin address with a valid checksum (or a DEMO- placeholder), else None."""
    a = (raw or "").strip()
    if _DEMO.match(a):
        return a
    if _LEGACY.match(a):
        return a if _base58check_ok(a) else None
    if _BECH32.match(a) and a in (a.lower(), a.upper()):  # mixed case is invalid bech32
        return a if _bech32_ok(a) else None
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


_FAILURE_REASON = {
    "unreachable": f"{OFFLINE_NOTE}: the crypto service could not be reached.",
    "rejected": "The crypto service rejected this address as invalid (check the address for typos). It was not screened.",
    "rate_limited": "The crypto service is rate limiting checks right now. Retry in a minute. This wallet was not screened.",
}
_REJECTED_CODES = {"invalid_address", "secret_input", "bad_address", "rejected"}
_RATE_LIMIT_CODES = {"rate_limited", "too_many_requests"}


def _failure_kind(resp: Any) -> str:
    """Why a wallet got no answer: 'rejected' (HTTP 400), 'rate_limited' (HTTP 429) or 'unreachable' (5xx / network / bad body)."""
    if isinstance(resp, dict):
        code = str(resp.get("error") or resp.get("code") or "").lower()
        http = resp.get("http") if isinstance(resp.get("http"), int) else resp.get("status_code")
        if code in _REJECTED_CODES or http == 400:
            return "rejected"
        if code in _RATE_LIMIT_CODES or http == 429:
            return "rate_limited"
    return "unreachable"


def _offline(address: str, rtt_ms: int, kind: str = "unreachable") -> dict[str, Any]:
    """No answer for this wallet. `status` stays 'offline' (the UI contract); `failure` says why."""
    return {"address": address, "status": "offline", "failure": kind, "verdict": None, "risk_score": None, "hops": None, "ofac": False,
            "reason": _FAILURE_REASON[kind], "engine": None, "engine_label": None,
            "tigergraph": False, "ms": None, "rtt_ms": rtt_ms, "vote": None, "mock": False, "limitations": []}


def summarise(address: str, resp: dict[str, Any] | None, rtt_ms: int = 0) -> dict[str, Any]:
    """One wallet's result in a fixed shape; `vote` is high / medium / low, or None when the agent abstains on it."""
    if not isinstance(resp, dict) or resp.get("status") == "error" or resp.get("verdict") not in ("ALLOW", "WARN", "BLOCK", "UNKNOWN"):
        return _offline(address, rtt_ms, _failure_kind(resp))
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
    """Failure-isolated: anything unexpected from the crypto service becomes an 'offline' step, never a crashed investigation."""
    try:
        return _evidence_step(wallets, lang)
    except Exception:  # noqa: BLE001
        return [], {"error": OFFLINE_NOTE, "findings": 0}


def _evidence_step(wallets: list[str], lang: str = "en") -> tuple[list[dict[str, Any]], dict[str, Any]]:
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
    # Wallets with no real verdict (UNKNOWN, rejected, rate limited, unreachable) are unverified, never "clean".
    extra["unverified"] = unverified_count(results)
    if not answered:
        extra["error"] = OFFLINE_NOTE
    return findings, extra


def unverified_count(results: list[dict[str, Any]]) -> int:
    """Wallets that came back without a verdict that says anything about them (UNKNOWN or no answer)."""
    return sum(1 for r in results if r["verdict"] not in ("ALLOW", "WARN", "BLOCK"))


UNVERIFIED_ACTION = "Treat unverified wallets as unsafe until checked: do not send funds to them yet."


def unverified_caveat(n: int) -> str:
    return (f"{n} wallet{'s' if n != 1 else ''} could not be verified (not in the dataset, rejected or not screened). "
            "That is not an all-clear: no evidence either way.")


# --- Risk Council: one vote ---------------------------------------------------------------------------------------


def council_vote(results: list[dict[str, Any]]) -> dict[str, Any]:
    """The agent's single council vote, in the council's vote shape (plus `abstain` and `chain`)."""
    chain = {"wallets": results}
    voting = [r for r in results if r["vote"]]
    base = {"agent": AGENT_ID, "name": AGENT_NAME, "source": "graph", "round": 1, "chain": chain}
    if not voting:
        offline = [r for r in results if r["status"] == "offline"]
        if len(offline) == len(results):
            kinds = {r.get("failure", "unreachable") for r in offline}
            why = (f"{OFFLINE_NOTE}: the crypto service could not be reached, so it abstains." if kinds == {"unreachable"}
                   else "Abstains: the wallet could not be screened (" + ("rejected as invalid" if kinds == {"rejected"} else "rate limited or rejected") + ").")
            do = UNVERIFIED_ACTION
        else:
            n = len(results) - len(offline)
            why = f"Abstains: {n} wallet{'s' if n != 1 else ''} not in dataset. Not in dataset does not mean safe."
            do = UNVERIFIED_ACTION
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
    same = [r["address"] for r in voting if r["verdict"] == worst["verdict"]]  # every wallet with the worst verdict, not just one
    names = ", ".join(short(a) for a in same[:3]) + (f" and {len(same) - 3} more" if len(same) > 3 else "")
    do = {"BLOCK": f"Do not send funds to {names}", "WARN": f"Verify {names} before paying", "ALLOW": ""}[worst["verdict"]]
    return {**base, "score": score, "level": level, "abstain": False, "why": why[:160], "do": do[:100]}
