"""OCR-1: a server without rapidocr answers 503 with a friendly message, never a bare 500."""
from __future__ import annotations

import io
import sys

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import ocr
from app.main import app

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture()
def no_rapidocr(monkeypatch):
    monkeypatch.setitem(sys.modules, "rapidocr", None)
    ocr._engine.cache_clear()
    yield
    ocr._engine.cache_clear()


def _jpg() -> bytes:
    b = io.BytesIO()
    Image.new("RGB", (40, 40), "white").save(b, "JPEG")
    return b.getvalue()


def test_read_text_raises_ocr_unavailable(no_rapidocr):
    with pytest.raises(ocr.OcrUnavailable):
        ocr.read_text(_jpg())


@pytest.mark.parametrize("path", ["/api/documents/demo-priya", "/api/ocr/extract/demo-priya"])
def test_image_upload_is_503_not_500(no_rapidocr, path):
    r = client.post(path, files={"file": ("bill.jpg", _jpg(), "image/jpeg")})
    assert r.status_code == 503, r.text
    assert "not available on this server" in r.json()["detail"]


def test_text_upload_still_works(no_rapidocr):
    r = client.post("/api/ocr/extract/demo-priya", files={"file": ("s.txt", b"01/10/2026 Coffee 120.00", "text/plain")})
    assert r.status_code != 503
