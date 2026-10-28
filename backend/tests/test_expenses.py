"""Quick expenses: price memory, catalog estimates and the endpoints. CLIP is replaced by deterministic fake vectors,
so these tests check our logic (memory first, then estimate, then ask), not the model."""
from __future__ import annotations

import uuid
import zlib

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.expenses_router import router
from app.core import store
from app.expenses import suggest as sg, vision
from app.models import AccountRow, PriceMemoryRow, TransactionRow

app = FastAPI()
app.include_router(router, prefix="/api")
client = TestClient(app)


def _vec(seed: bytes) -> np.ndarray:
    v = np.random.default_rng(zlib.crc32(seed)).normal(size=512)
    return v / np.linalg.norm(v)


@pytest.fixture(autouse=True)
def fake_clip(monkeypatch):
    # b"text:<words>" photos look exactly like that text to "CLIP"; any other bytes are a unique random picture
    monkeypatch.setattr(vision, "embed_texts", lambda texts: np.array([_vec(t.encode()) for t in texts]))
    monkeypatch.setattr(vision, "embed_image", lambda data: _vec(data[5:]) if data.startswith(b"text:") else _vec(data))
    sg._catalog_vectors.cache_clear()


@pytest.fixture
def uid():
    u = "guest-" + uuid.uuid4().hex[:16]
    yield u
    for m in (PriceMemoryRow, TransactionRow, AccountRow):
        store.delete_where(m, user_id=u)


def _suggest(uid, **kw):
    files = {"photo": ("p.jpg", kw.pop("photo"), "image/jpeg")} if "photo" in kw else None
    r = client.post(f"/api/expenses/{uid}/suggest", data=kw, files=files)
    assert r.status_code == 200, r.text
    return r.json()


def _add(uid, item, amount, photo=None):
    files = {"photo": ("p.jpg", photo, "image/jpeg")} if photo else None
    return client.post(f"/api/expenses/{uid}", data={"item": item, "amount": amount}, files=files)


def test_typed_name_gets_a_catalog_estimate_scaled_by_city(uid):
    base = _suggest(uid, name="chai")
    assert (base["item"], base["price"], base["source"], base["category"]) == ("tea", 15, "estimate", "dining")
    assert (base["low"], base["high"]) == (10, 25)
    assert _suggest(uid, name="Chai", city="Mumbai")["price"] == 18


def test_photo_is_recognised_zero_shot_with_alternatives(uid):
    s = _suggest(uid, photo=b"text:a photo of a cup of tea")
    assert s["item"] == "tea" and s["price"] == 15 and s["confidence"] > 0.9 and len(s["alternatives"]) == 2


def test_unrecognised_photo_leaves_price_blank(uid, monkeypatch):
    monkeypatch.setattr(sg, "MIN_CONFIDENCE", 1.1)
    s = _suggest(uid, photo=b"some random picture")
    assert s["price"] is None and s["source"] == "none"


def test_saved_price_is_suggested_next_time_by_photo_and_by_name(uid):
    photo = b"my own chai stall photo"
    assert _add(uid, "tea", 12, photo).status_code == 200
    by_photo = _suggest(uid, photo=photo)
    assert (by_photo["item"], by_photo["price"], by_photo["source"]) == ("tea", 12, "memory")
    assert _suggest(uid, name="chai")["price"] == 12  # alias maps to the same item, memory beats the catalog


def test_unknown_item_is_learned_from_the_first_entry(uid):
    assert _suggest(uid, name="steel glass")["price"] is None
    _add(uid, "Steel Glass", 40)
    s = _suggest(uid, name="steel glass")
    assert (s["price"], s["source"]) == (40, "memory")


def test_usual_price_is_the_median_of_recent_purchases(uid):
    for p in (10, 10, 20):
        _add(uid, "biscuits", p)
    s = _suggest(uid, name="biscuit")
    assert (s["price"], s["low"], s["high"]) == (10, 10, 20)


def test_add_creates_a_negative_transaction_on_a_cash_account(uid):
    r = _add(uid, "Samosa", 15)
    assert r.status_code == 200 and r.json()["category"] == "dining"
    tx = store.query(TransactionRow, user_id=uid)[0]
    assert tx.amount == -15 and tx.merchant == "Samosa"
    assert store.get(AccountRow, tx.account_id).name == "Cash"


def test_validation(uid):
    assert client.post(f"/api/expenses/{uid}/suggest").status_code == 422
    assert _add(uid, "tea", 0).status_code == 422
    assert _add(uid, "  ", 5).status_code == 422


def test_printed_bill_total_wins_over_a_guess(uid, monkeypatch):
    from app.api import expenses_router as er
    monkeypatch.setattr(er, "read_text", lambda data: "RAJU GENERAL STORE\nRice 5kg Rs 320.00\nSub Total Rs 500.00\nTOTAL Rs 1,518.00")
    s = _suggest(uid, photo=b"any bytes")
    assert (s["item"], s["price"], s["source"]) == ("RAJU GENERAL STORE", 1518.0, "receipt")


def test_vision_model_names_an_item_clip_cannot(uid, monkeypatch):
    from app.api import expenses_router as er
    monkeypatch.setattr(sg, "MIN_CONFIDENCE", 1.1)  # CLIP "never" sure
    def named(data):
        monkeypatch.setattr(sg, "MIN_CONFIDENCE", 0.5)  # a typed/named item is not judged by photo confidence
        return "chai"
    monkeypatch.setattr(er.vlm, "name_item", named)
    s = _suggest(uid, photo=b"blurry cup")
    assert (s["item"], s["source"]) == ("tea", "estimate")


def _teach(uid, item, price, photo):
    return client.post(f"/api/expenses/{uid}/teach", data={"item": item, "price": price}, files={"photo": ("p.jpg", photo, "image/jpeg")})


def _snap(uid, photo):
    r = client.post(f"/api/expenses/{uid}/snap", files={"photo": ("p.jpg", photo, "image/jpeg")})
    assert r.status_code == 200, r.text
    return r.json()


def test_teach_links_photo_to_price_without_booking_anything(uid):
    assert _teach(uid, "tea", 15, b"cup-1").status_code == 200
    assert store.query(TransactionRow, user_id=uid) == []
    assert client.get(f"/api/expenses/{uid}/items").json()[0]["item"] == "tea"


def test_snap_of_a_taught_photo_books_it_at_the_taught_price(uid):
    _teach(uid, "tea", 15, b"cup-1")
    out = _snap(uid, b"cup-1")
    assert (out["added"], out["item"], out["amount"]) == (True, "tea", 15)
    assert [t.amount for t in store.query(TransactionRow, user_id=uid)] == [-15]


def test_snap_of_a_new_photo_of_a_taught_item_is_matched_by_the_vision_model(uid, monkeypatch):
    _teach(uid, "tea", 15, b"cup-1")
    monkeypatch.setattr("app.api.expenses_router.vlm.match_item", lambda image, names: "tea" if "tea" in names else None)
    out = _snap(uid, b"another-cup")
    assert (out["added"], out["amount"]) == (True, 15)


def test_snap_of_an_untaught_photo_only_suggests(uid, monkeypatch):
    monkeypatch.setattr("app.api.expenses_router.vlm.match_item", lambda image, names: None)
    out = _snap(uid, b"mystery")
    assert out["added"] is False and "suggestion" in out
    assert store.query(TransactionRow, user_id=uid) == []


def test_forget_removes_a_taught_item(uid):
    _teach(uid, "tea", 15, b"cup-1")
    client.delete(f"/api/expenses/{uid}/items/tea")
    assert client.get(f"/api/expenses/{uid}/items").json() == []
