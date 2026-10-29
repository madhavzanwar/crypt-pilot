"""Round 2 pipeline fixes: BUG-006 (language-independent cache), 048 (replay cached), 087, 089."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.services.graph.base import GraphEngineError
from tests.test_api_check import credits, demo, make_client  # noqa: F401


def _post(c: Any, addr: str, lang: str) -> Any:
    return c.post("/api/check", json={"address": addr, "lang": lang})


def test_language_switch_is_free_and_text_follows_language(make_client: Any, demo: dict[str, str]) -> None:  # noqa: F811
    c = make_client(starting_credits=3)
    en = _post(c, demo["BLOCK"], "en").json()
    assert en["creditsRemaining"] == 2 and en["cached"] is False
    hi = _post(c, demo["BLOCK"], "hi").json()
    assert hi["creditsRemaining"] == 2 and hi["cached"] is True  # no second charge
    assert hi["topReasons"] != en["topReasons"]  # reasons are in Hindi now
    assert hi["explanation"] == en["explanation"]  # both languages travel in every response
    assert hi["reportHash"] == en["reportHash"]
    en2 = _post(c, demo["BLOCK"], "en").json()
    assert en2["topReasons"] == en["topReasons"] and en2["creditsRemaining"] == 2


def test_hindi_first_then_english(make_client: Any, demo: dict[str, str]) -> None:  # noqa: F811
    c = make_client(starting_credits=3)
    hi = _post(c, demo["WARN"], "hi").json()
    en = _post(c, demo["WARN"], "en").json()
    assert en["cached"] is True and en["creditsRemaining"] == hi["creditsRemaining"]
    assert en["topReasons"] != hi["topReasons"]


def test_zero_credits_still_serves_free_answers(make_client: Any, demo: dict[str, str]) -> None:  # noqa: F811
    c = make_client(starting_credits=1)
    assert _post(c, demo["ALLOW"], "en").json()["creditsRemaining"] == 0
    cached = _post(c, demo["ALLOW"], "hi")
    assert cached.status_code == 200 and cached.json()["cached"] is True  # cached answer at 0 credits
    unknown = _post(c, "DEMO-notindataset", "en")
    assert unknown.status_code == 200 and unknown.json()["verdict"] == "UNKNOWN"
    ofac = _post(c, "DEMO-sanctioned1", "en")
    assert ofac.status_code == 200 and ofac.json()["verdict"] == "BLOCK"
    assert _post(c, demo["BLOCK"], "en").status_code == 402  # a billable, uncached answer still needs a credit


def test_charge_loser_leaves_nothing_in_cache(make_client: Any, demo: dict[str, str]) -> None:  # noqa: F811
    c = make_client(starting_credits=1)
    p = c.app.state.cryptiq.pipeline
    real_balance = p._balance
    calls = {"n": 0}

    def racy(sid: str) -> int:  # the pre-explain check sees a credit, then another request spends it
        calls["n"] += 1
        return 1 if calls["n"] == 1 else real_balance(sid)

    p._balance = racy
    from app.services.billing import ledger
    orig = p._persist

    def spend_then_persist(*a: Any, **kw: Any) -> Any:
        with p.db.session() as s:
            ledger.try_charge(s, a[0].session_id, "other")
        return orig(*a, **kw)

    p._persist = spend_then_persist
    r = _post(c, demo["BLOCK"], "en")
    assert r.status_code == 402
    assert p.cache.get(demo["BLOCK"]) is None


def test_replay_fallback_is_cached_and_charged_once(make_client: Any, demo: dict[str, str],  # noqa: F811
                                                    trained: tuple[Path, Path], tmp_path: Path) -> None:
    from app.services.graph.replay import ReplayStore

    c = make_client(artifacts_dir=trained[1], starting_credits=3)
    p = c.app.state.cryptiq.pipeline
    real = _post(c, demo["BLOCK"], "en").json()
    store = ReplayStore(tmp_path / "replay")
    body = {k: v for k, v in real.items() if k != "creditsRemaining"}
    store.put(demo["BLOCK"], "en", "2026-10-28T00:00:00+00:00", body)
    p.replay = store
    p.cache = type(p.cache)(600)

    def boom(*_: Any) -> None:
        raise GraphEngineError("down")

    p.engine.khop_exposure = boom
    before = real["creditsRemaining"]
    outs = [_post(c, demo["BLOCK"], "en").json() for _ in range(3)]
    assert [o["engine"] for o in outs] == ["replay"] * 3
    assert [o["creditsRemaining"] for o in outs] == [before - 1] * 3  # charged once
    assert [o["cached"] for o in outs] == [False, True, True]
