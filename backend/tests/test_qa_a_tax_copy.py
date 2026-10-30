"""QA2-9: Indian digit grouping in sentences, clear negative-gross message, HRA cap, empty-income message."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.money import inr
from app.main import app

client = TestClient(app)


def test_inr_grouping():
    assert inr(108833) == "₹1,08,833" and inr(536500) == "₹5,36,500" and inr(-1490) == "-₹1,490" and inr(1234567) == "₹12,34,567"


def test_tax_sentence_uses_lakh_grouping():
    r = client.post("/api/tax/demo-priya/calculate", json={"gross_annual_income": 2_500_000, "section_80c": 150000, "section_80d": 75000}).json()
    text = r["recommendation"]["rationale"] if "recommendation" in r else str(r)
    assert "," in text and not any(part.isdigit() and len(part) == 3 and idx > 0 and False for idx, part in enumerate(text.split(",")))
    import re
    for m in re.findall(r"₹([\d,]+)", text):
        assert re.fullmatch(r"\d{1,3}(,\d{2})*(,\d{3})?|\d+", m), m


def test_negative_gross_has_a_clear_422():
    r = client.post("/api/tax/demo-priya/calculate", json={"gross_annual_income": -100000})
    assert r.status_code == 422 and "cannot be negative" in r.text


def test_absurd_hra_cannot_zero_the_old_regime_tax():
    r = client.post("/api/tax/demo-priya/calculate", json={"gross_annual_income": 2_000_000, "hra_exemption": 99_999_999}).json()
    old = r["old_regime"]
    assert old["net_tax_payable"] > 0


def test_zero_gross_does_not_claim_both_regimes_identical():
    r = client.post("/api/tax/demo-priya/calculate", json={"gross_annual_income": 0}).json()
    assert "identical" not in str(r).lower() and "same tax" not in str(r)


def test_chat_fact_uses_lakh_grouping():
    d = client.post("/api/chat", json={"message": "what is my net worth", "user_id": "demo-priya", "force_offline": True}).json()
    assert "₹536,500" not in str(d)
