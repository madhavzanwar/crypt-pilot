"""CLIP image/text embeddings (ONNX via fastembed: no torch, runs on CPU). Models download on first use (~600 MB)."""
from __future__ import annotations

import io
import os
from functools import lru_cache
from pathlib import Path

import numpy as np

from app.core.paths import writable_dir

_CACHE = os.getenv("FINPILOT_MODEL_CACHE") or str(writable_dir(Path(__file__).resolve().parents[2] / ".model_cache"))
VISION, TEXT = "Qdrant/clip-ViT-B-32-vision", "Qdrant/clip-ViT-B-32-text"


def _unit(a: np.ndarray) -> np.ndarray:
    return a / np.linalg.norm(a, axis=-1, keepdims=True)


@lru_cache
def _image_model():
    from fastembed import ImageEmbedding

    return ImageEmbedding(VISION, cache_dir=_CACHE)


@lru_cache
def _text_model():
    from fastembed import TextEmbedding

    return TextEmbedding(TEXT, cache_dir=_CACHE)


def embed_image(data: bytes) -> np.ndarray:
    from PIL import Image

    img = Image.open(io.BytesIO(data)).convert("RGB")
    return _unit(np.array(list(_image_model().embed([img])))[0])


def embed_texts(texts: list[str]) -> np.ndarray:
    return _unit(np.array(list(_text_model().embed(texts))))
