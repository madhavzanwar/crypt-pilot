"""Risk Council: seven agents with different personas vote on how risky a user's finances are.

Cost design: the agents never see raw transactions. They all get one compact facts JSON (about 250 tokens: short keys,
no nulls, rounded numbers, findings capped), answer with a score and one short reason (max 90 tokens), and only the
agents far from the median get a second, even shorter turn to reconsider after hearing the opposing argument. Level and
verdict are computed in code, not by a model. Results are cached on the facts hash. With no API key (or a failed call)
each agent falls back to a deterministic rule for its persona, so the council always convenes.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import statistics
import time
from collections.abc import AsyncIterator

import httpx

from app import telemetry
from app.core import store
from app.core.config import get_settings
from app.ingest.snapshot import build_dashboard_snapshot
from app.models import AccountRow, TransactionRow
from app.security import agents

URL = "https://integrate.api.nvidia.com/v1/chat/completions"
_SPREAD = 25  # an agent this many points from the median gets a second turn
_TTL = 600.0
_cache: dict[str, tuple[float, dict]] = {}


def _clamp(x: float) -> int:
    return int(max(0, min(100, round(x))))


def level(score: float) -> str:
    return "low" if score < 25 else "medium" if score < 50 else "high" if score < 75 else "critical"


# --- Facts: one small JSON for everybody -----------------------------------------------------------------------

_SEV = {"high": 3, "medium": 2, "low": 1}


def compact_facts(user_id: str) -> dict:
    rows, accounts = store.query(TransactionRow, user_id=user_id), store.query(AccountRow, user_id=user_id)
    checks = agents.run_checks(rows, accounts)
    findings = sorted((f for v in checks.values() for f in v), key=lambda f: -_SEV[f["severity"]])
    snap = build_dashboard_snapshot(user_id)
    inc = snap.monthly_income or 0
    debt_min = sum(d.minimum_payment for d in snap.debts)
    facts = {
        "inc": round(inc), "exp": round(snap.monthly_expenses), "sr": round(snap.savings_rate * 100), "nw": round(snap.net_worth),
        "debt": round(sum(d.principal for d in snap.debts)),
        "dti": round(debt_min / inc * 100) if inc else None,
        "rec": round(sum(abs(r.amount) for r in snap.recurring_obligations) / inc * 100) if inc else None,
        "hs": round(snap.health_score.overall),
        "sub": {s.name[:14]: round(s.score) for s in snap.health_score.sub_scores},
        "anchor": agents.risk_score(findings),
        "f": [[f["agent"][:5], f["severity"][0], f["title"][:48], round(f["amount"])] for f in findings[:10]],
        "nf": len(findings),
    }
    return {k: v for k, v in facts.items() if v not in (None, [], {})}


def facts_json(facts: dict) -> str:
    return json.dumps(facts, separators=(",", ":"), ensure_ascii=False)


# --- Personas ----------------------------------------------------------------------------------------------------


def _fraud_part(f: dict) -> float:
    return sum({"h": 22, "m": 9, "l": 3}[x[1]] for x in f.get("f", []) if x[0] in ("fraud", "patte", "merch"))


PERSONAS = [
    # id, name, stance (kept to one line: it is sent on every call), rule used when no model is available
    ("auditor", "Strict Auditor", "You are a strict auditor. Unexplained or unusual items matter; you rate risk higher when findings exist.",
     lambda f: f.get("anchor", 0) + (12 if any(x[1] == "h" for x in f.get("f", [])) else 0)),
    ("liquidity", "Cash-Flow Realist", "You judge liquidity: savings rate, fixed costs as a share of income, and months of runway.",
     lambda f: 50 - f.get("sr", 0) * 1.5 + max(0, f.get("rec", 0) - 50) * 1.2),
    ("debt", "Debt Hawk", "You judge leverage: debt-to-income, total debt versus net worth, and interest burden.",
     lambda f: f.get("dti", 0) * 1.6 + (15 if f.get("nw", 0) < 0 else 0)),
    ("fraud", "Fraud Sentinel", "You are paranoid about fraud, duplicate charges, lookalike merchants and odd transfers.",
     lambda f: _fraud_part(f)),
    ("habits", "Behavioural Coach", "You judge habits: recurring subscriptions and impulse spending. You forgive one-off events.",
     lambda f: 100 - f.get("hs", 50)),
    ("optimist", "Growth Optimist", "You are the devil's advocate: you push back on alarmism and only call it risky when the danger is real.",
     lambda f: 0.6 * f.get("anchor", 0) + (100 - f.get("hs", 50)) * 0.2 - f.get("sr", 0) * 0.5),
    ("peer", "Peer Benchmarker", "You compare against typical urban Indian households: savings rate near 20%, debt-to-income under 35%.",
     lambda f: (20 - f.get("sr", 0)) * 1.5 + (f.get("dti", 0) - 30) * 1.0 + 25),
]

_RULES = (' Reply with JSON only: {"score": 0-100 risk (0 safe, 100 dire), "why": under 20 words, "do": one action under 12 words}. '
          "Use only the numbers given. Keys: inc/exp monthly income/spend, sr savings rate %, nw net worth, dti debt-to-income %, "
          "rec fixed-cost % of income, hs health score, anchor rule-based risk, f findings [agent, severity, title, amount].")
_REVISE = ' Reply with JSON only: {"score": 0-100, "why": under 15 words}.'


# --- Model calls -------------------------------------------------------------------------------------------------


async def _ask(client: httpx.AsyncClient, system: str, user: str, max_tokens: int) -> tuple[dict, int]:
    s = get_settings()
    t = telemetry.Timer()
    try:
        r = await client.post(
            URL, headers={"Authorization": f"Bearer {s.nvidia_chat_api_key}"}, timeout=25,
            json={"model": s.nvidia_council_model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                  "response_format": {"type": "json_object"}, "temperature": 0.4, "max_tokens": max_tokens,
                  "chat_template_kwargs": {"enable_thinking": False}})
        r.raise_for_status()
    except Exception as exc:
        telemetry.record(kind="call", provider="nvidia", key="NVIDIA_CHAT_API_KEY", model=s.nvidia_council_model, agent="risk_council", ok=False, ms=t.ms, error=type(exc).__name__)
        raise
    data = r.json()
    tokens = int(data.get("usage", {}).get("total_tokens", 0))
    telemetry.record(kind="call", provider="nvidia", key="NVIDIA_CHAT_API_KEY", model=s.nvidia_council_model, agent="risk_council", ok=True, ms=t.ms, tokens=tokens)
    return json.loads(data["choices"][0]["message"]["content"]), tokens


def _vote(pid: str, name: str, score: float, why: str, do: str, source: str, rnd: int) -> dict:
    sc = _clamp(score)
    return {"agent": pid, "name": name, "score": sc, "level": level(sc), "why": why[:160], "do": do[:100], "source": source, "round": rnd}


async def _first_vote(client, facts_s: str, facts: dict, persona, use_model: bool) -> tuple[dict, int]:
    pid, name, stance, rule = persona
    if use_model:
        try:
            out, tokens = await _ask(client, stance + _RULES, facts_s, 90)
            return _vote(pid, name, float(out["score"]), str(out.get("why", "")), str(out.get("do", "")), "model", 1), tokens
        except Exception:  # noqa: BLE001 - one slow or failing agent must not stop the council
            pass
    return _vote(pid, name, rule(facts), "Rule-based view (model unavailable).", "", "rules", 1), 0


async def _revise(client, facts_s: str, persona, mine: dict, median: float, opposing: dict, use_model: bool) -> tuple[dict, int]:
    pid, name, stance, _ = persona
    if use_model and mine["source"] == "model":
        user = f'{facts_s}\nYou said {mine["score"]}. Council median {round(median)}. {opposing["name"]} argues {opposing["score"]}: "{opposing["why"]}". Reconsider.'
        try:
            out, tokens = await _ask(client, stance + _REVISE, user, 70)
            return _vote(pid, name, float(out["score"]), str(out.get("why", mine["why"])), mine["do"], "model", 2), tokens
        except Exception:  # noqa: BLE001
            pass
    return mine, 0


def tally(votes: list[dict]) -> dict:
    scores = [v["score"] for v in votes]
    med = statistics.median(scores)
    counts: dict[str, int] = {}
    for v in votes:
        counts[v["level"]] = counts.get(v["level"], 0) + 1
    verdict = level(med)
    actions = []
    for v in sorted(votes, key=lambda v: abs(v["score"] - med)):
        if v["do"] and v["do"].lower() not in (a.lower() for a in actions):
            actions.append(v["do"])
    return {"score": round(med), "level": verdict, "counts": counts, "votes": votes,
            "dissent": [{"agent": v["agent"], "name": v["name"], "level": v["level"], "why": v["why"]} for v in votes if v["level"] != verdict],
            "actions": actions[:3]}


async def convene(user_id: str) -> AsyncIterator[dict]:
    """Progress events: facts, vote (as each agent finishes), debate, then the final verdict."""
    facts = await asyncio.to_thread(compact_facts, user_id)
    facts_s = facts_json(facts)
    s = get_settings()
    use_model = bool(s.nvidia_chat_api_key)
    key = hashlib.sha1(f"{facts_s}|{s.nvidia_council_model}|{use_model}".encode()).hexdigest()
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < _TTL:
        yield {"type": "verdict", "cached": True, **hit[1]}
        return
    yield {"type": "facts", "facts": facts, "approx_tokens": len(facts_s) // 3}

    tokens = 0
    async with httpx.AsyncClient() as client:
        tasks = [asyncio.create_task(_first_vote(client, facts_s, facts, p, use_model)) for p in PERSONAS]
        votes: list[dict] = []
        for done in asyncio.as_completed(tasks):
            vote, used = await done
            tokens += used
            votes.append(vote)
            yield {"type": "vote", "vote": vote}

        med = statistics.median(v["score"] for v in votes)
        outliers = [v for v in votes if abs(v["score"] - med) > _SPREAD]
        if outliers and use_model:
            yield {"type": "debate", "median": round(med), "agents": [v["agent"] for v in outliers]}
            by_id = {p[0]: p for p in PERSONAS}
            second = []
            for v in outliers:  # the strongest opposing view is the vote furthest from this agent on the other side of the median
                opp = max((o for o in votes if (o["score"] - med) * (v["score"] - med) < 0), key=lambda o: abs(o["score"] - v["score"]), default=None) \
                    or min(votes, key=lambda o: abs(o["score"] - med))
                second.append(asyncio.create_task(_revise(client, facts_s, by_id[v["agent"]], v, med, opp, use_model)))
            revised = {}
            for done in asyncio.as_completed(second):
                vote, used = await done
                tokens += used
                revised[vote["agent"]] = vote
                if vote["round"] == 2:
                    yield {"type": "vote", "vote": vote}
            votes = [revised.get(v["agent"], v) for v in votes]

    result = {**tally(votes), "anchor": facts.get("anchor", 0), "tokens": tokens, "approx_input_tokens": len(facts_s) // 3, "debated": bool(outliers and use_model)}
    _cache[key] = (time.monotonic(), result)
    yield {"type": "verdict", "cached": False, **result}
