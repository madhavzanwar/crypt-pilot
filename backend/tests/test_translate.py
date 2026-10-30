"""UI translation: cache, chunk retry on a count mismatch, and graceful no-key behaviour."""
from app import translate


def _fresh(monkeypatch, tmp_path):
    monkeypatch.setattr(translate, "_cache", {})
    monkeypatch.setattr(translate, "_FILE", tmp_path / "c.json")


def test_translates_once_and_serves_repeats_from_cache(monkeypatch, tmp_path):
    _fresh(monkeypatch, tmp_path)
    calls = []

    def fake(prompt):
        calls.append(prompt)
        return ["हिंदी-a", "हिंदी-b"]

    monkeypatch.setattr(translate, "_call", fake)
    assert translate.translate("hi", ["a", "b"]) == {"a": "हिंदी-a", "b": "हिंदी-b"}
    assert translate.translate("hi", ["b", "a"]) == {"a": "हिंदी-a", "b": "हिंदी-b"}
    assert len(calls) == 1
    assert (tmp_path / "c.json").exists()


def test_count_mismatch_is_retried_in_halves(monkeypatch, tmp_path):
    _fresh(monkeypatch, tmp_path)

    def fake(prompt):  # misbehaves on the big batch only
        import json
        texts = json.loads(prompt.splitlines()[-1])
        return texts[:1] if len(texts) > 1 else [texts[0] + "!"]

    monkeypatch.setattr(translate, "_call", fake)
    assert translate.translate("mr", ["x", "y"]) == {"x": "x!", "y": "y!"}


def test_no_model_leaves_text_untranslated_and_bad_lang_is_empty(monkeypatch, tmp_path):
    _fresh(monkeypatch, tmp_path)
    monkeypatch.setattr(translate, "_call", lambda p: None)
    assert translate.translate("hi", ["a"]) == {}
    assert translate.translate("fr", ["a"]) == {}


def test_cached_pages_never_hit_the_rate_limit(monkeypatch, tmp_path):
    """QA4-2: only calls that need the model count against the limit, so browsing in Hindi never gets a 429."""
    from fastapi.testclient import TestClient

    from app.api import translate_router
    from app.core.ratelimit import RateLimiter
    from app.main import app

    _fresh(monkeypatch, tmp_path)
    monkeypatch.setattr(translate_router, "translate_limiter", RateLimiter(2, 600))
    monkeypatch.setattr(translate, "_call", lambda prompt: ["हि"])
    c = TestClient(app)
    codes = [c.post("/api/translate", json={"lang": "hi", "texts": ["Dashboard"]}).status_code for _ in range(10)]
    assert codes == [200] * 10  # first call reaches the model, the other nine are cache hits
    new = [c.post("/api/translate", json={"lang": "hi", "texts": [f"fresh {i}"]}).status_code for i in range(4)]
    assert new[:1] == [200] and 429 in new  # ever-new strings are still limited
