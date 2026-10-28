"""Web Intel proxy: missing key is a clean 503, and the key goes in the header, never the body."""
import pytest
from fastapi import HTTPException

from app.api import web_router


def test_no_key_is_503(monkeypatch):
    monkeypatch.setattr(web_router, "get_settings", lambda: type("S", (), {"tavily_api_key": ""})())
    with pytest.raises(HTTPException) as e:
        web_router.search(web_router.Search(query="hello"))
    assert e.value.status_code == 503


def test_key_sent_as_bearer_header(monkeypatch):
    seen = {}
    monkeypatch.setattr(web_router, "get_settings", lambda: type("S", (), {"tavily_api_key": "k"})())
    def fake(url, headers, json, timeout):
        seen.update(url=url, headers=headers, json=json)
        return type("R", (), {"status_code": 200, "json": lambda self: {"results": []}})()
    monkeypatch.setattr(web_router.httpx, "post", fake)
    web_router.crawl(web_router.Url(url="https://example.com"))
    assert seen["headers"]["Authorization"] == "Bearer k" and "k" not in str(seen["json"]) and seen["url"].endswith("/crawl")
