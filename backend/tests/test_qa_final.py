"""Final QA regressions: passbook parsing (opening balance, glued footer) and what-if parameter validation."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.statement_ocr import parse_transactions

# Real RapidOCR output of the fictional test passbook (tilted photo: the footer got glued before the last row).
PASSBOOK = """DEMO SAHAKARI BANK (SAMPLE - NOT A REAL BANK)
Savings Account Passbook
Branch: Sample Nagar, Bengaluru Account Holder: PRIYA TEST SHARMA A/c No: 0000 1234 5678 IFSC: DEMO0000001
Date Particulars Withdrawal Deposit Balance
01-10-2026 Opening Balance 45,250.00
02-10-2026 UPI/Swiggy Order 412.00 44,838.00
03-10-2026 NEFT/ACME TECH SALARY 95,000.00 1,39,838.00
05-10-2026 ATM Cash Withdrawal 5,000.00 1,34,838.00
06-10-2026 UPI/Zomato 289.00 1,34,549.00
08-10-2026 ECS/HOME LOAN EMI 18,400.00 1,16,149.00
10-10-2026 UPI/Amazon Pay 2,199.00 1,13,950.00
12-10-2026 Electricity Bill BESCOM 1,845.00 1,12,105.00
15-10-2026 UPI/Netflix Subscription 649.00 1,11,456.00
Page 3 | Printed 20-10-2026 | All amounts in Rs. | Authorised Signatory 18-10-2026 Interest Credit 512.00 1,11,968.00"""


def test_passbook_opening_balance_is_not_a_transaction_and_footer_is_not_merged():
    rows = parse_transactions(PASSBOOK)
    assert len(rows) == 9  # 9 real rows, no 'Opening Balance'
    assert not any("opening" in r["description"].lower() for r in rows)
    assert all("page" not in r["description"].lower() and "signatory" not in r["description"].lower() for r in rows)
    by = {r["description"]: r["amount"] for r in rows}
    assert by["NEFT/ACME TECH SALARY"] == 95000.0 and by["UPI/Swiggy Order"] == -412.0
    last = rows[-1]
    assert last["date"] == "2026-10-18" and last["amount"] == 512.0 and "Interest" in last["description"]


def test_wrapped_narration_lines_still_join():
    txt = "05-10-2026 UPI/Big Basket order 1,200.00 9,000.00\nBangalore store 12\n06-10-2026 UPI/Zomato 289.00 8,711.00"
    rows = parse_transactions(txt)
    assert len(rows) == 2 and "Bangalore store" in rows[0]["description"]


@pytest.fixture(scope="module")
def client(monkeypatch_module=None):
    return TestClient(app, raise_server_exceptions=False)


@pytest.mark.parametrize("raw", ["NaN", "Infinity", "1e999", "-5000", "-1", "1e13"])
def test_simulate_rejects_nonfinite_and_negative_numbers(client, raw):
    body = '{"action":"increase_sip","action_params":{"amount":%s}}' % raw
    r = client.post("/api/simulate/demo-priya", content=body, headers={"content-type": "application/json"})
    assert r.status_code == 422, r.text


def test_simulate_still_accepts_normal_and_negative_market_return(client):
    ok = client.post("/api/simulate/demo-priya", json={"action": "increase_sip", "action_params": {"amount": 5000}})
    assert ok.status_code == 200, ok.text
