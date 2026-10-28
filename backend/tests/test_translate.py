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
