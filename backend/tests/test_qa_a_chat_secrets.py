"""QA3-1/QA3-2: /api/chat refuses seed phrases and private keys (also in history, also split) and never echoes them."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
SEED12 = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
HEX64 = "e9873d79c6d87dc0fb6a5778633389f4453213303da61f20bd67fc233aa33262"
WIF = "5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ"
XPRV = ("xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi")


def post(message, history=None):
    return client.post("/api/chat", json={"message": message, "user_id": "demo-priya", "history": history or []})


@pytest.mark.parametrize("text", [
    SEED12,
    " ".join(["abandon"] * 11 + ["about"]).upper(),
    "my phrase is " + SEED12,
    "-".join(SEED12.split()),
    " ".join(f"{i + 1}. {w}" for i, w in enumerate(SEED12.split())),
    HEX64, "0x" + HEX64, WIF, XPRV,
    "e9873d79 c6d87dc0 fb6a5778 633389f4 453213303da61f20bd67fc233aa33262",
    "5HueCGU8rMjxEXxiPuD5-BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ",
])
def test_secret_in_message_is_refused_and_not_echoed(text):
    r = post(text)
    assert r.status_code == 400, r.text
    d = r.json()
    assert d["error"] == "secret_input" and "seed phrase" in d["detail"]
    assert text not in r.text and "abandon" not in r.text and "query" not in d


def test_secret_in_history_is_refused():
    r = post("what do you think?", [{"role": "user", "content": SEED12}, {"role": "assistant", "content": "ok"}])
    assert r.status_code == 400 and r.json()["error"] == "secret_input"


def test_key_split_across_two_messages_is_caught_by_history():
    first, second = HEX64[:32], HEX64[32:]
    assert post(first).status_code == 200  # half a key is just 32 hex characters
    r = post(second, [{"role": "user", "content": first}, {"role": "assistant", "content": "I did not understand."}])
    assert r.status_code == 400 and r.json()["error"] == "secret_input" and second not in r.text


def test_normal_questions_still_work():
    r = post("How much did I spend on dining last month?", [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}])
    assert r.status_code == 200 and r.json()["narrative"]
    assert post("Is my transaction 2026-10-01 for 4999 rupees fine?").status_code == 200
