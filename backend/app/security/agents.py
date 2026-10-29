"""Evidence Council: nine agents that examine a user's real ledger and hand findings to each other.

Six are deterministic checks over TransactionRow data (every finding links the transactions behind it); each gets an AI
second opinion from its own NVIDIA model (ai_agents.py) that also sees the earlier agents' findings. The Web Checker
looks up the riskiest merchants on the live web, the Risk Scorer combines everything (agents that flag the same merchant
corroborate each other), and the Verdict Writer explains it with the NVIDIA model (with a backup NVIDIA model). Nothing here invents numbers.
"""
from __future__ import annotations

import difflib
import json
import re
import time
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

import pandas as pd
from pydantic import BaseModel

from app.analytics.anomalies import detect_anomalies
from app.analytics.recurring import detect_recurring, find_redundant_subscriptions, normalize_merchant
from app import telemetry
from app.core import store
from app.security import ai_agents, chain_analyst
from app.models import AccountRow, InvestigationRow, TransactionRow

DEMO_TAG = "demo-threat"
NON_SPEND = {"transfer", "credit_card_payment", "income"}
LOOKBACK_DAYS = 120
_BRANDS = ["amazon", "netflix", "swiggy", "zomato", "uber", "flipkart", "paytm", "phonepe", "spotify", "hotstar", "google", "myntra"]
_LEET = str.maketrans({"0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "@": "a", "$": "s"})

AGENTS = [
    ("data_guardian", "Data Guardian", "Checks the ledger itself for broken or missing data"),
    ("duplicate_detector", "Duplicate Detector", "Finds the same payment charged twice"),
    ("fraud_hunter", "Fraud Hunter", "Flags amounts far outside your normal spending"),
    ("merchant_verifier", "Merchant Verifier", "Spots look-alike and unknown merchant names"),
    ("subscription_sleuth", "Subscription Sleuth", "Tracks recurring charges, price hikes and overlaps"),
    ("pattern_analyst", "Pattern Analyst", "Looks for bursts and suspicious payment shapes"),
    ("web_checker", "Web Checker", "Looks up the riskiest merchants on the live web (Tavily)"),
    ("risk_scorer", "Risk Scorer", "Combines every finding into one risk score"),
    ("verdict_writer", "Verdict Writer", "Explains what is wrong and what to do (AI)"),
]


def _finding(agent: str, severity: str, title: str, detail: str, rows: list[TransactionRow], merchant: str | None = None) -> dict:
    return {
        "agent": agent, "severity": severity, "title": title, "detail": detail,
        "merchant": merchant or (rows[0].merchant if rows else None),
        "amount": round(sum(-r.amount for r in rows if r.amount < 0), 2),
        "txn_ids": [r.id for r in rows],
    }


def _spend(rows):
    return [r for r in rows if r.amount < 0 and r.category not in NON_SPEND]


def _df(rows) -> pd.DataFrame:
    return pd.DataFrame([{"id": r.id, "date": r.date, "amount": r.amount, "merchant": r.merchant, "category": r.category} for r in rows])


def data_guardian(rows, accounts) -> list[dict]:
    out, ids = [], {a.id for a in accounts}
    today = date.today()
    for label, bad in [
        ("with no merchant name", [r for r in rows if not r.merchant.strip()]),
        ("dated in the future", [r for r in rows if r.date > today]),
        ("with a zero amount", [r for r in rows if r.amount == 0]),
        ("pointing to an account that no longer exists", [r for r in rows if r.account_id not in ids]) if accounts else ("", []),
    ]:
        if bad:
            out.append(_finding("data_guardian", "low", f"{len(bad)} transaction(s) {label}", "Bad data can hide real problems or distort every chart. Review or remove these rows.", bad[:10]))
    return out


def duplicate_detector(rows, _a) -> list[dict]:
    groups = defaultdict(list)
    for r in _spend(rows):
        if not r.is_recurring:
            groups[(r.merchant.lower(), r.amount)].append(r)
    out = []
    for g in groups.values():
        if len(g) >= 4:  # a burst, reported by the Pattern Analyst
            continue
        g.sort(key=lambda r: r.date)
        for a, b in zip(g, g[1:]):
            if (b.date - a.date).days <= 2:
                out.append(_finding("duplicate_detector", "high" if -a.amount >= 1000 else "medium",
                                    f"Possible double charge at {a.merchant}",
                                    f"₹{-a.amount:,.0f} was charged on {a.date} and again on {b.date}. If you only bought once, ask for a refund.", [a, b]))
    return out


def fraud_hunter(rows, _a) -> list[dict]:
    by_id, cutoff = {r.id: r for r in rows}, date.today() - timedelta(days=LOOKBACK_DAYS)
    out = []
    for fact in detect_anomalies(_df(_spend(rows))):
        hit = [by_id[i] for i in fact.source_txn_ids if i in by_id and by_id[i].date >= cutoff]
        if hit:
            big = max(-r.amount for r in hit)
            if big < 5000:  # routine variation in everyday spend is not a security finding
                continue
            out.append(_finding("fraud_hunter", "high" if big >= 10000 else "medium", f"Unusual payment to {hit[0].merchant}", fact.text, hit))
    return out


def merchant_verifier(rows, _a) -> list[dict]:
    out, seen = [], set()
    for r in _spend(rows):
        if r.merchant in seen:
            continue
        for tok in re.findall(r"[a-z0-9@$]+", r.merchant.lower()):
            n = re.sub(r"[^a-z]", "", tok.translate(_LEET))
            brand = next((b for b in _BRANDS if (n == b and tok != b) or (n != b and len(n) > 4 and difflib.SequenceMatcher(None, n, b).ratio() >= 0.85)), None)
            if brand:
                seen.add(r.merchant)
                out.append(_finding("merchant_verifier", "high", f"'{r.merchant}' looks like a fake {brand.title()}",
                                    f"The name imitates {brand.title()} but is spelled differently. Look-alike merchants are a common phishing trick: do not pay again until you verify it.",
                                    [x for x in rows if x.merchant == r.merchant]))
                break
    return out


def subscription_sleuth(rows, _a) -> list[dict]:
    spend = _spend(rows)
    out = []
    if len(spend) >= 3:
        recurring = detect_recurring(_df(spend))
        for r in find_redundant_subscriptions(recurring):
            out.append(_finding("subscription_sleuth", "low", f"Overlapping subscription: {r.merchant}",
                                f"₹{r.amount:,.0f} {r.frequency.value}. You pay for more than one service of the same kind, so consider keeping one.", [], r.merchant))
    series = defaultdict(list)
    for r in spend:
        if r.is_recurring:
            series[normalize_merchant(r.merchant)].append(r)
    for s in series.values():
        s.sort(key=lambda r: r.date)
        if len(s) >= 2 and -s[-1].amount >= -s[0].amount * 1.1:
            out.append(_finding("subscription_sleuth", "medium", f"Price rise at {s[-1].merchant}",
                                f"The charge went from ₹{-s[0].amount:,.0f} to ₹{-s[-1].amount:,.0f}. Check whether you agreed to this.", [s[0], s[-1]]))
    return out


def pattern_analyst(rows, _a) -> list[dict]:
    out, days = [], defaultdict(list)
    for r in _spend(rows):
        days[r.date].append(r)
    for d, g in days.items():
        if len(g) >= 4 and d >= date.today() - timedelta(days=LOOKBACK_DAYS) and len({x.merchant for x in g}) == 1:
            out.append(_finding("pattern_analyst", "high", f"{len(g)} rapid payments to {g[0].merchant} on {d}",
                                f"{len(g)} separate charges to the same merchant in one day (₹{sum(-x.amount for x in g):,.0f} in total) is a classic card-testing or draining pattern.", g))
    seen = defaultdict(int)
    for r in _spend(rows):
        seen[r.merchant] += 1
    for r in _spend(rows):
        if -r.amount >= 5000 and r.amount % 1000 == 0 and seen[r.merchant] == 1 and r.date >= date.today() - timedelta(days=LOOKBACK_DAYS):
            out.append(_finding("pattern_analyst", "medium", f"Large round payment to a one-time merchant: {r.merchant}",
                                f"₹{-r.amount:,.0f} on {r.date} to a merchant you have never paid before. Confirm you made this payment.", [r]))
    return out


CHECKS = {"data_guardian": data_guardian, "duplicate_detector": duplicate_detector, "fraud_hunter": fraud_hunter,
          "merchant_verifier": merchant_verifier, "subscription_sleuth": subscription_sleuth, "pattern_analyst": pattern_analyst}
_WEIGHT = {"high": 20, "medium": 8, "low": 3}


def cross_check(findings: list[dict]) -> None:
    """Agents' hand-off: two agents flagging the same merchant corroborate each other, so the finding is escalated."""
    by_merchant = defaultdict(list)
    for f in findings:
        if f["merchant"]:
            by_merchant[f["merchant"].lower()].append(f)
    for group in by_merchant.values():
        agents_here = {f["agent"] for f in group}
        if len(agents_here) < 2:
            continue
        for f in group:
            f["corroborated_by"] = sorted(agents_here - {f["agent"]})
            if f["severity"] == "medium":
                f["severity"] = "high"


def risk_score(findings: list[dict]) -> int:
    """Severity weights; corroborated findings count 1.25x, ones the reviewing AI doubts count half.

    Findings from different agents that point at the same transactions are one problem seen twice
    (e.g. a double-charged EMI flagged by both the duplicate detector and the fraud hunter), so they
    count once, at the heaviest weight, with the corroboration uplift.
    """
    def weight(f: dict, corroborated: bool) -> float:
        return _WEIGHT[f["severity"]] * (1.25 if corroborated else 1) * (0.5 if f.get("ai", {}).get("verdict") == "doubt" else 1)

    total, groups = 0.0, defaultdict(list)
    for f in findings:
        ids = frozenset(f.get("txn_ids") or ())
        if ids:
            groups[ids].append(f)
        else:
            total += weight(f, bool(f.get("corroborated_by")))
    for group in groups.values():
        agents_here = {f["agent"] for f in group}
        total += max(weight(f, bool(f.get("corroborated_by")) or len(agents_here) > 1) for f in group)
    return min(100, round(total))


def risk_level(score: int) -> str:
    return "high" if score >= 50 else "medium" if score >= 20 else "low"


def run_checks(rows, accounts) -> dict[str, list[dict]]:
    """No-AI pass over the ledger; used by the graph and the fraud simulator too."""
    return {k: fn(rows, accounts) for k, fn in CHECKS.items()}


class _Verdict(BaseModel):
    headline: str
    what_is_wrong: str
    what_to_do: list[str]


_VERDICT_SYSTEM = (
    "You are the Verdict Writer of a personal-finance security team. You get verified findings (JSON) from other agents. "
    "Explain in plain language what is wrong and what the user should do. Use only the amounts and merchants in the findings; never invent any. "
    'Return JSON: {"headline": one sentence, "what_is_wrong": 2-4 sentences, "what_to_do": 3-5 short action strings}.'
)


def _brief(f: dict) -> dict:
    """One finding as short JSON for the Verdict Writer: what, how bad, and what the other agents concluded."""
    out = {"a": f["agent"], "s": f["severity"][0], "t": f["title"][:70], "amt": round(f["amount"])}
    if f.get("corroborated_by"):
        out["also"] = f["corroborated_by"]
    if f.get("ai"):
        out["ai"] = f["ai"]["verdict"]
    if f.get("web"):
        out["web"] = f["web"].get("verdict")
    return out


def write_verdict(findings: list[dict], score: int, run: str | None = None) -> tuple[dict | None, str | None, str | None]:
    """(verdict, source, error). The Verdict Writer's NVIDIA model, then its backup, otherwise (None, None, reason)."""
    top = sorted(findings, key=lambda f: -_WEIGHT[f["severity"]])[:12]
    brief = {"score": score, "n": len(findings), "f": [_brief(f) for f in top]}
    errors = []
    if ai_agents._key()[0]:
        try:
            data, model, _ = ai_agents.ask_json("verdict_writer", brief, 380, run=run, system=_VERDICT_SYSTEM, check=_Verdict.model_validate)
            return _Verdict.model_validate(data).model_dump(), model, None
        except Exception as exc:  # noqa: BLE001
            errors.append(f"AI: {'busy' if '429' in str(exc) or '529' in str(exc) else 'unavailable'}")
    return None, None, "; ".join(errors) + ". The findings above are real; only the written explanation is missing."


def verdict_for(findings: list[dict], score: int, run: str | None = None) -> tuple[dict | None, str | None, str | None]:
    if findings:
        return write_verdict(findings, score, run)
    return {"headline": "No security problems found.", "what_is_wrong": "All checks came back clean on your current data.", "what_to_do": ["Re-run after your next sync."]}, "rules", None


def scored(findings: list[dict]) -> list[dict]:
    """Findings that count as problems. Informational ones (Chain Analyst: a wallet that is ALLOW or not in the dataset)
    are shown in the report but never raise the score or reach the Verdict Writer."""
    return [f for f in findings if not f.get("info")]


def save_report(user_id: str, run: str, rows: list, findings: list[dict], score: int, summaries: list[dict], verdict, source, error, extra: dict | None = None) -> dict:
    report = {
        "created_at": datetime.now(timezone.utc).isoformat(), "risk_score": score, "risk_level": risk_level(score),
        "transactions_checked": len(rows), "agents": summaries, "findings": findings,
        "run": run, "verdict": verdict, "verdict_source": source, "verdict_error": error,
        "demo_threats_present": any(DEMO_TAG in (r.tags or "") for r in rows),
        **(extra or {}),
    }
    store.put(InvestigationRow(user_id=user_id, risk_score=score, report=json.dumps(report, default=str)))
    return report


def investigate(user_id: str, pace: float = 0.35, wallets: list[str] | None = None, lang: str = "en"):
    """Generator of progress events; the last one is the saved report.

    With `wallets` (cleaned by chain_analyst.clean_wallets) the Chain Analyst joins as a tenth stage, just before the Risk
    Scorer. Without wallets it does not run and the nine agents behave exactly as before."""
    rows, accounts = store.query(TransactionRow, user_id=user_id), store.query(AccountRow, user_id=user_id)
    all_findings, summaries = [], {}
    run, score = uuid.uuid4().hex[:8], 0
    wallets = list(wallets or [])
    stages = list(AGENTS)
    if wallets:
        stages.insert(next(i for i, a in enumerate(stages) if a[0] == "risk_scorer"), (chain_analyst.AGENT_ID, chain_analyst.AGENT_NAME, chain_analyst.AGENT_JOB))
    telemetry.record(kind="run", run=run, user=user_id, transactions=len(rows), parts=len(stages), via="stream")
    for key, name, _ in stages:
        yield {"type": "agent", "agent": key, "status": "running"}
        t0 = time.time()
        if key == "web_checker":
            cross_check(all_findings)  # so the web lookup targets merchants two agents agree on
            _, extra = ai_agents.web_evidence(all_findings, run)
            res = []
        elif key == "risk_scorer":
            cross_check(all_findings)
            score, extra = ai_agents.calibrate(risk_score(scored(all_findings)), scored(all_findings), run)
            res, extra = [], {**extra, "score": score}
        elif key == chain_analyst.AGENT_ID:
            res, extra = chain_analyst.evidence_step(wallets, lang)
            all_findings += res
        elif key == "verdict_writer":
            verdict, source, error = verdict_for(scored(all_findings), score, run)
            res, extra = [], {"source": source, "error": error}
        else:
            res, extra = CHECKS[key](rows, accounts), {}
            if key in ai_agents.MODELS:
                res, extra = ai_agents.review(key, res, rows, all_findings, run)
            all_findings += res
        time.sleep(pace)
        summaries[key] = {"agent": key, "name": name, "findings": len(res), "ms": int((time.time() - t0) * 1000), **extra}  # extra may override `findings`
        telemetry.record(kind="stage", run=run, agent=key, step="agent", ms=summaries[key]["ms"], findings=len(res))
        yield {"type": "agent", "agent": key, "status": "done", **summaries[key]}
    report = save_report(user_id, run, rows, all_findings, score, list(summaries.values()), verdict, source, error,
                         {"wallets_screened": wallets} if wallets else None)
    yield {"type": "report", "report": report}


def latest_report(user_id: str) -> dict | None:
    saved = sorted(store.query(InvestigationRow, user_id=user_id), key=lambda r: r.created_at, reverse=True)
    return json.loads(saved[0].report) if saved else None


def plant_demo_threats(user_id: str) -> int:
    """Add clearly tagged fake suspicious transactions so the agents have something to find."""
    accounts = store.query(AccountRow, user_id=user_id)
    if not accounts:
        raise ValueError("Connect a data source first")
    acc, today = accounts[0].id, date.today()
    spec = [  # (days ago, amount, merchant, category)
        (3, -2499, "Swiggy", "dining"), (2, -2499, "Swiggy", "dining"),
        (6, -3999, "AMAZ0N PAY", "shopping"),
        (9, -45000, "Quickcash Global Ltd", "shopping"),
        *[(4, -199, "PixelGift Store", "shopping")] * 5,
    ]
    rows = [TransactionRow(id=f"{DEMO_TAG}-{user_id}-{i}", user_id=user_id, account_id=acc, date=today - timedelta(days=d), amount=a, merchant=m,
                           category=c, tags=json.dumps([DEMO_TAG]), description="Demo suspicious activity") for i, (d, a, m, c) in enumerate(spec)]
    store.put(*rows)
    return len(rows)


def clear_demo_threats(user_id: str) -> int:
    rows = [r for r in store.query(TransactionRow, user_id=user_id) if DEMO_TAG in (r.tags or "")]
    for r in rows:
        store.delete(TransactionRow, r.id)
    return len(rows)
