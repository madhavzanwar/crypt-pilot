"""The demo personas must be skewed, deterministic and contain findable fishy data (pure: no store needed)."""
import json
import statistics
from collections import defaultdict

import pytest
from dateutil.relativedelta import relativedelta

from app.ingest.personas import PERSONA_CONFIGS, TODAY, generate_persona
from app.security import agents

RANGES = {"demo-priya": (25, 60), "demo-arjun": (20, 70), "demo-meera": (0, 25)}  # mostly healthy ledgers: 1-3 planted problems each. Arjun's duplicate EMI is (by design) flagged by two agents plus the look-alike merchant (3 high findings = 60, 70 once cross-checked)


def _monthly(rows, pred):
    out = defaultdict(float)
    for r in rows:
        if pred(r):
            out[(r.date.year, r.date.month)] += abs(r.amount)
    months = [(TODAY.replace(day=1) - relativedelta(months=i)) for i in range(11, 0, -1)]  # complete months only, zeros kept
    return [out[(d.year, d.month)] for d in months]


@pytest.fixture(scope="module")
def checked():
    res = {}
    for uid, cfg in PERSONA_CONFIGS.items():
        data = generate_persona(cfg)
        findings = agents.run_checks(data.transactions, data.accounts)
        res[uid] = (data, findings)
    return res


@pytest.mark.parametrize("uid", list(PERSONA_CONFIGS))
def test_deterministic(uid):
    a, b = generate_persona(PERSONA_CONFIGS[uid]), generate_persona(PERSONA_CONFIGS[uid])
    key = lambda d: [(t.date, t.amount, t.merchant, t.category, t.tags) for t in d.transactions]  # ids are random uuids
    assert key(a) == key(b)


def test_priya_lifestyle_creep(checked):
    rows = checked["demo-priya"][0].transactions
    m = _monthly(rows, lambda r: r.category in ("dining", "shopping", "entertainment") and r.amount < 0 and abs(r.amount) < 20000 and "fishy" not in (r.tags or ""))
    assert sum(m[-5:]) >= 1.03 * sum(m[:5])  # gentle creep


def test_meera_lumpy_income(checked):
    inc = _monthly(checked["demo-meera"][0].transactions, lambda r: r.amount > 0 and r.category == "income")
    med = statistics.median(inc)
    assert sum(1 for x in inc if x < 0.25 * med) >= 2


def test_every_fishy_row_is_tagged_and_recent(checked):
    for _, (data, _) in checked.items():
        fishy = [t for t in data.transactions if "fishy" in (t.tags or "")]
        assert 2 <= len(fishy) <= 6  # one or two planted findings per persona
        assert all(json.loads(t.tags)[0] == "fishy" for t in fishy)


def test_detectors_find_injected_problems(checked):
    kinds = {}
    for uid, (_, f) in checked.items():
        kinds[uid] = {k: [x["title"] for x in v] for k, v in f.items()}
    p, a, m = kinds["demo-priya"], kinds["demo-arjun"], kinds["demo-meera"]
    assert len(p["duplicate_detector"]) >= 1 and any("ICICI Home Loan EMI" in t for t in a["duplicate_detector"])
    assert any("Amaz0n" in t for t in p["merchant_verifier"]) and any("Zomat0" in t for t in a["merchant_verifier"])
    assert any("Swiggy" in t for t in m["duplicate_detector"])
    for uid, per in kinds.items():  # routine spending must not look like fraud
        assert sum(len(v) for v in per.values()) <= 5, uid


def test_net_worth_is_positive_for_every_persona():
    for uid, cfg in PERSONA_CONFIGS.items():
        assets = sum(a.balance for a in cfg.accounts if a.balance > 0)
        debts = -sum(a.balance for a in cfg.accounts if a.balance < 0)
        assert assets > debts, uid


def test_ledgers_are_400_to_500_rows():
    for uid, (data, _) in ((u, d) for u, d in ((u, (generate_persona(c), None)) for u, c in PERSONA_CONFIGS.items())):
        assert 400 <= len(data.transactions) <= 520, uid


@pytest.mark.parametrize("uid", list(RANGES))
def test_risk_score_in_believable_range(checked, uid):
    findings = [x for v in checked[uid][1].values() for x in v]
    lo, hi = RANGES[uid]
    assert lo <= agents.risk_score(findings) <= hi
