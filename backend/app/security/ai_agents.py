"""Evidence Council AI layer. Every agent has its own job (a role prompt that is the only thing it is asked), its own
model (+ a backup), and sees only the slice of data that job needs. The rules stay the source of facts; a model adds a
verdict note, flags a scam-like merchant, sanity-checks the score, or reads web results.

Token discipline: rules run first and the model is skipped when there is nothing to judge; prompts carry short JSON
(not prose, not raw transactions); outputs are tiny fixed-schema JSON with a tight max_tokens; thinking mode is off;
identical requests are answered from a 10-minute cache. Every call is logged to app.telemetry for the Agent Ops page."""
from __future__ import annotations

import hashlib
import json
import os
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

import httpx

from app import telemetry
from app.core.config import get_settings
from app.schemas import TxnCategory

URL = "https://integrate.api.nvidia.com/v1/chat/completions"
MODELS = {  # primary model per agent (env-overridable)
    "data_guardian": os.getenv("EVIDENCE_DATA_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b"),
    "duplicate_detector": os.getenv("EVIDENCE_DUPLICATE_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b"),
    "fraud_hunter": os.getenv("EVIDENCE_FRAUD_MODEL", "nvidia/nemotron-3-super-120b-a12b"),
    "merchant_verifier": os.getenv("EVIDENCE_MERCHANT_MODEL", "nvidia/nemotron-3.5-content-safety"),
    "subscription_sleuth": os.getenv("EVIDENCE_SUBSCRIPTION_MODEL", "z-ai/glm-5.3-flash"),
    "pattern_analyst": os.getenv("EVIDENCE_PATTERN_MODEL", "openai/gpt-oss-20b"),
    "web_checker": os.getenv("EVIDENCE_WEB_MODEL", "z-ai/glm-5.3-flash"),
    "risk_scorer": os.getenv("EVIDENCE_SCORER_MODEL", "openai/gpt-oss-20b"),
    "verdict_writer": os.getenv("EVIDENCE_VERDICT_MODEL", "nvidia/nemotron-3-super-120b-a12b"),
}
BACKUPS = {  # tried when the primary is busy or times out
    "data_guardian": "z-ai/glm-5.3-flash",
    "duplicate_detector": "z-ai/glm-5.3-flash",
    "fraud_hunter": "openai/gpt-oss-20b",
    "merchant_verifier": None,  # no other safety classifier is reachable; on failure the rule findings stand
    "subscription_sleuth": "nvidia/nemotron-3.5-lightning-30b-a3b",
    "pattern_analyst": "nvidia/nemotron-3-super-120b-a12b",
    "web_checker": "nvidia/nemotron-3.5-lightning-30b-a3b",
    "risk_scorer": "z-ai/glm-5.3-flash",
    "verdict_writer": "openai/gpt-oss-20b",
}
_JUDGE = ('Reply JSON only: {"r":[{"i":<index>,"v":"confirm"|"doubt","n":"<=14 words"}]}. Use only the given facts. '
          '"others" are findings other agents already made; a match on the same merchant makes a finding more likely real.')
ROLES = {  # the job each agent is hired for: this is what makes one kind of model behave as a different specialist
    "duplicate_detector": "You verify double-charge candidates. confirm = an accidental duplicate; doubt = a normal repeat purchase (two items, a top-up, an EMI). " + _JUDGE,
    "fraud_hunter": "You judge unusually large payments. confirm = looks like fraud or a scam; doubt = a plausible big purchase for that merchant type. " + _JUDGE,
    "subscription_sleuth": "You judge subscription findings. confirm = an unwanted price rise or wasteful overlap; doubt = a normal plan change. " + _JUDGE,
    "pattern_analyst": "You judge payment shapes. confirm = card-testing, draining or a suspicious one-off transfer; doubt = ordinary behaviour. " + _JUDGE,
    "data_guardian": 'You audit data quality. You get [merchant, category] pairs; list only the ones whose category is clearly wrong. Reply JSON only: {"bad":[{"m":"merchant","fix":"category"}]}. Categories: ' + ", ".join(c.value for c in TxnCategory) + ".",
    "web_checker": 'You read web search results about a merchant. v = "scam" only if the sources report fraud or regulator warnings; "legit" if it is a known real business; else "unclear". Reply JSON only: {"v":"scam"|"legit"|"unclear","n":"<=20 words citing what the sources say"}',
    "risk_scorer": 'You calibrate a 0-100 personal-finance risk score from counts. adj is -10..10: raise it if findings are corroborated or the web says scam, lower it if the AI doubts most findings. Reply JSON only: {"adj":<int>,"why":"<=14 words"}',
}
_THINKERS = ("gpt-oss", "glm")  # reasoning models spend max_tokens on hidden thinking: without headroom they return ""
_cache: dict[str, tuple[float, dict]] = {}
_TTL = 600.0


def _key() -> tuple[str, str]:
    """(secret, env-var name). The name is what telemetry records; the secret never leaves this module."""
    if os.getenv("NVIDIA_EVIDENCE_API_KEY"):
        return os.environ["NVIDIA_EVIDENCE_API_KEY"], "NVIDIA_EVIDENCE_API_KEY"
    return get_settings().nvidia_api_key, "NVIDIA_API_KEY"


def _post(model: str, messages: list[dict], max_tokens: int, extra: dict | None = None, *, agent: str = "", run: str | None = None) -> str:
    secret, label = _key()
    if any(k in model for k in _THINKERS):
        max_tokens = max(max_tokens * 5, 500)
    t = telemetry.Timer()
    try:
        r = httpx.post(URL, headers={"Authorization": f"Bearer {secret}"}, timeout=12,
                       json={"model": model, "messages": messages, "temperature": 0.2, "max_tokens": max_tokens, **(extra or {})})
        r.raise_for_status()
        body = r.json()
    except Exception as exc:
        telemetry.record(kind="call", provider="nvidia", key=label, model=model, agent=agent, run=run, ok=False, ms=t.ms,
                         error=str(getattr(getattr(exc, "response", None), "status_code", type(exc).__name__)))
        raise
    telemetry.record(kind="call", provider="nvidia", key=label, model=model, agent=agent, run=run, ok=True, ms=t.ms, tokens=(body.get("usage") or {}).get("total_tokens"))
    return body["choices"][0]["message"]["content"] or ""


def _parse(content: str) -> dict:
    return json.loads(content[content.index("{"):content.rindex("}") + 1])


def ask_json(agent: str, payload: dict, max_tokens: int, *, run: str | None = None, system: str | None = None, check=None) -> tuple[dict, str, bool]:
    """(parsed JSON, model that answered, used_backup). Tries the primary then the backup, logs each hop, caches the answer."""
    system = system or ROLES[agent]
    user = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    msgs = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    extra = {"response_format": {"type": "json_object"}, "chat_template_kwargs": {"enable_thinking": False}}
    chain = tuple(m for m in (MODELS[agent], BACKUPS[agent]) if m)
    ck = hashlib.sha1(f"{agent}|{system}|{user}".encode()).hexdigest()
    hit = _cache.get(ck)
    if hit and time.time() - hit[0] < _TTL:
        telemetry.record(kind="cache", agent=agent, run=run, model=hit[1]["model"])
        return hit[1]["data"], hit[1]["model"], hit[1]["backup"]
    last: Exception | None = None
    for n, model in enumerate(chain):
        try:
            data = _parse(_post(model, msgs, max_tokens, extra, agent=agent, run=run))
            if check:
                check(data)  # an answer in the wrong shape counts as a failure, so the backup model gets its turn
        except Exception as exc:  # noqa: BLE001 - busy, timeout or unparseable: next model in the chain
            last = exc
            if n + 1 < len(chain):
                telemetry.record(kind="fallback", agent=agent, run=run, model=model, to=chain[n + 1], reason=str(exc)[:80])
            continue
        _cache[ck] = (time.time(), {"data": data, "model": model, "backup": n > 0})
        return data, model, n > 0
    raise last or RuntimeError("no model")


def _safety(model: str, text: str, run: str | None) -> bool:
    for attempt in (0, 1):
        try:
            out = _post(model, [{"role": "user", "content": text}], 60, {"chat_template_kwargs": {"request_categories": "/categories", "enable_thinking": False}}, agent="merchant_verifier", run=run)
            return "unsafe" in out.lower().split("safety categories")[0]
        except httpx.HTTPStatusError as exc:
            if attempt or exc.response.status_code != 429:
                raise
            time.sleep(1.2)  # the classifier rate-limits bursts: one pause, one retry
    return False


def _rules_only(extra: dict) -> dict:
    """A rule-based run names no model: showing one would claim an AI looked at it."""
    return {**{k: v for k, v in extra.items() if k != "model"}, "mode": "rules"}


def review(agent: str, findings: list[dict], rows, board: list[dict] = (), run: str | None = None) -> tuple[list[dict], dict]:
    """(findings with an `ai` note, summary fields). Never raises: any failure keeps the rule result."""
    extra = {"model": MODELS[agent], "ai": "off"}
    if not _key()[0]:
        return findings, _rules_only(extra)
    try:
        if agent == "merchant_verifier":
            return _merchant_safety(findings, rows, run, extra)
        if agent == "data_guardian":
            return _data_audit(findings, rows, run, extra)
        if not findings:  # nothing to judge: spend no tokens
            return findings, extra
        brief = [{"i": i, "t": f["title"], "d": f["detail"][:100], "a": f["amount"]} for i, f in enumerate(findings[:12])]
        data, model, backup = ask_json(agent, {"f": brief, "others": [[f["agent"], f["title"][:50]] for f in board[:8]]}, 60 + 45 * len(brief), run=run)
        for item in data["r"]:
            if 0 <= item["i"] < len(findings) and item["v"] in ("confirm", "doubt"):
                findings[item["i"]]["ai"] = {"model": model, "verdict": item["v"], "note": str(item.get("n", ""))[:120]}
        return findings, {"model": model, "ai": "ok", "backup": backup}
    except Exception as exc:  # noqa: BLE001
        return findings, {**extra, "ai": "error", "ai_error": "busy" if "429" in str(exc) or "529" in str(exc) else "unavailable"}


def _merchant_safety(findings, rows, run, extra):
    flagged = {f["merchant"] for f in findings}
    seen = {r.merchant: r for r in rows if r.amount < 0 and r.merchant not in flagged}
    names = list(seen)[:10]  # bounded: each name is one call
    for n, model in enumerate(m for m in (MODELS["merchant_verifier"], BACKUPS["merchant_verifier"]) if m):
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:  # the classifier answers 429 on bursts
                bad = [nm for nm, unsafe in zip(names, pool.map(lambda nm: _safety(model, f"Payment to '{nm}'. {seen[nm].description or ''}", run), names)) if unsafe]
        except Exception as exc:  # noqa: BLE001
            if BACKUPS["merchant_verifier"] and n == 0:
                telemetry.record(kind="fallback", agent="merchant_verifier", run=run, model=model, to=BACKUPS["merchant_verifier"], reason=str(exc)[:80])
            continue
        for nm in bad:
            r = seen[nm]
            findings.append({"agent": "merchant_verifier", "severity": "medium", "title": f"AI safety model flagged '{nm}'",
                             "detail": "The content-safety model rated this merchant name or description as unsafe. Verify the merchant before paying again.",
                             "merchant": nm, "amount": round(-r.amount, 2), "txn_ids": [r.id], "ai": {"model": model, "verdict": "confirm", "note": "flagged unsafe"}})
        return findings, {"model": model, "ai": "ok", "backup": n > 0}
    return findings, {**extra, "ai": "error", "ai_error": "unavailable"}


def _cat(r) -> str:
    return r.category.value if hasattr(r.category, "value") else str(r.category)


def _data_audit(findings, rows, run, extra):
    """Data Guardian's AI job: spot merchants filed under a clearly wrong category (top merchants only, one tiny call)."""
    top = Counter((r.merchant, _cat(r)) for r in rows if r.amount < 0).most_common(25)
    if not top:
        return findings, extra
    data, model, backup = ask_json("data_guardian", {"pairs": [list(k) for k, _ in top]}, 320, run=run)
    by_name = {r.merchant: r for r in rows}
    for item in data.get("bad", [])[:5]:
        r = by_name.get(item.get("m"))
        if r:
            findings.append({"agent": "data_guardian", "severity": "low", "title": f"'{r.merchant}' may be filed under the wrong category",
                             "detail": f"It is recorded as {_cat(r)} but looks like {item.get('fix')}. Wrong categories distort your budgets.",
                             "merchant": r.merchant, "amount": 0.0, "txn_ids": [r.id], "ai": {"model": model, "verdict": "confirm", "note": f"looks like {item.get('fix')}"}})
    return findings, {"model": model, "ai": "ok", "backup": backup}


def web_evidence(findings: list[dict], run: str | None = None) -> tuple[list[dict], dict]:
    """Web Checker: Tavily searches the riskiest merchants, then its model turns the sources into a scam/legit/unclear call."""
    from app.api.web_router import _call
    extra = {"model": MODELS["web_checker"], "ai": "off"}
    if not get_settings().tavily_api_key:
        return findings, _rules_only(extra)
    merchants = list(dict.fromkeys(f["merchant"] for f in sorted(findings, key=lambda f: (f["severity"] != "high", not f.get("corroborated_by"))) if f["merchant"] and f["severity"] != "low"))[:3]
    extra["ai"] = "ok"

    def one(m: str):
        try:
            r = _call("search", {"query": f"Is {m} a legitimate business or a scam? reviews complaints", "search_depth": "basic", "include_answer": True, "max_results": 3}, agent="web_checker", run=run)
        except Exception:  # noqa: BLE001 - rate limit or network: skip this merchant
            return m, None, None
        results = r.get("results") or []
        web = {"answer": (r.get("answer") or "")[:260], "url": (results[:1] or [{}])[0].get("url", ""), "verdict": "unclear"}
        used = None
        try:  # the model reads a trimmed digest, not the pages
            data, model, backup = ask_json("web_checker", {"m": m, "answer": web["answer"][:300], "snips": [x.get("content", "")[:160] for x in results[:3]]}, 90, run=run)
            if data.get("v") in ("scam", "legit", "unclear"):
                web.update(verdict=data["v"], answer=str(data.get("n") or web["answer"])[:260])
            used = (model, backup)
        except Exception:  # noqa: BLE001 - keep Tavily's own answer
            pass
        return m, web, used

    with ThreadPoolExecutor(max_workers=3) as pool:  # the merchants are independent
        for m, web, used in pool.map(one, merchants):
            if web is None:
                extra["ai"] = "error"
                continue
            if used:
                extra.update(model=used[0], backup=used[1])
            for f in findings:
                if f["merchant"] == m:
                    f["web"] = web
    return findings, extra


def calibrate(base: int, findings: list[dict], run: str | None = None) -> tuple[int, dict]:
    """Risk Scorer's AI job: nudge the rule score by at most +-10 from corroboration, AI doubts and web verdicts."""
    extra = {"model": MODELS["risk_scorer"], "ai": "off", "base": base}
    if not findings or not _key()[0]:
        return base, _rules_only(extra)
    sev = Counter(f["severity"] for f in findings)
    payload = {"base": base, "h": sev["high"], "m": sev["medium"], "l": sev["low"], "corr": sum(bool(f.get("corroborated_by")) for f in findings),
               "doubt": sum(f.get("ai", {}).get("verdict") == "doubt" for f in findings),
               "web_scam": sorted({f["merchant"] for f in findings if f.get("web", {}).get("verdict") == "scam"})[:5]}
    try:
        data, model, backup = ask_json("risk_scorer", payload, 70, run=run)
        adj = max(-10, min(10, int(data["adj"])))
        return max(0, min(100, base + adj)), {"model": model, "ai": "ok", "backup": backup, "base": base, "adjust": adj, "why": str(data.get("why", ""))[:100]}
    except Exception:  # noqa: BLE001
        return base, {**extra, "ai": "error"}
