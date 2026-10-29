"""BUG-047: groundedness validator gaps."""

from __future__ import annotations

import pytest

from app.services.explain.templates import LIMITATION_EN, LIMITATION_HI
from app.services.explain.validator import validate

EV = {"verdict": "WARN", "status": "ok", "maxHop": 3, "labelHits": {"ofac": False, "ransomwhere": False},
      "hopsToNearestIllicit": 2, "datasetLabel": None, "riskScore": 55}
GOOD_EN = f"This wallet is 2 hops from a flagged wallet and scored 55, so the verdict is WARN. {LIMITATION_EN}"
GOOD_HI = f"यह वॉलेट एक चिह्नित वॉलेट से 2 हॉप दूर है और इसका स्कोर 55 है, इसलिए निर्णय WARN है। {LIMITATION_HI}"


def test_good_texts_pass() -> None:
    assert validate(GOOD_EN, EV, "en") == []
    assert validate(GOOD_HI, EV, "hi") == []


@pytest.mark.parametrize("bad", [
    "It sits in the 99th percentile of connectivity",
    "About ninety-nine wallets are linked",
    "Scored in the top twenty percent",
    "Linked to six flagged wallets",
    "Seen by the Treasury list",
    "Matches the SDN list",
    "Looks like an extortion payment",
    "This wallet is all clear",
    "This wallet is not risky",
    "Flagged by O​FAC",
])
def test_english_gaps_are_rejected(bad: str) -> None:
    assert validate(f"{bad}, verdict WARN. {LIMITATION_EN}", EV, "en"), bad


def test_wrong_script_is_rejected() -> None:
    assert any("not Hindi" in p for p in validate(GOOD_EN, EV, "hi"))
    assert any("not English" in p for p in validate(GOOD_HI, EV, "en"))
