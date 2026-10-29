"""BUG-046: secret-guard bypasses."""

from __future__ import annotations

import pytest

from app.services.address import looks_like_secret

W = "abandon ability able about above absent absorb abstract absurd abuse access accident".split()
HEX = "ab" * 32


@pytest.mark.parametrize("text", [
    "​".join(W),                                   # ZWSP as the separator
    "‎".join(W), "‮".join(W), "⁡".join(W),  # LRM, RLO, invisible function application
    " ".join(f"{i} {w}" for i, w in enumerate(W, 1)),   # "1 abandon 2 ability"
    " ".join(f"{i}-{w}" for i, w in enumerate(W, 1)),   # "1-word"
    " ".join(f"#{i} {w}" for i, w in enumerate(W, 1)),  # "#1 word"
    "/".join(W), "|".join(W), "_".join(W), ":".join(W),
    " ".join(W).replace("a", "а"),                      # Cyrillic а
    " ".join(HEX[i:i + 2] for i in range(0, 64, 2)),    # space-separated hex byte pairs
    ":".join(HEX[i:i + 2] for i in range(0, 64, 2)),
    "5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ",  # WIF
    "5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1 jvhTVqvbTLvyTJ",  # WIF with one space
])
def test_secret_variants_are_caught(text: str) -> None:
    assert looks_like_secret(text, address_field=True), repr(text[:40])
    assert looks_like_secret(text), repr(text[:40])


def test_word_split_by_zero_width_is_still_caught() -> None:
    assert looks_like_secret(" ".join(w[:2] + "​" + w[2:] for w in W))


@pytest.mark.parametrize("text", [
    "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
    "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx", "DEMO-notindataset", "abandon ability able",
    "hello world 12 34",
])
def test_normal_addresses_and_short_text_pass(text: str) -> None:
    assert not looks_like_secret(text, address_field=True)
