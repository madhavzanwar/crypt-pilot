import pytest

from app.services.address import (
    InvalidAddressError,
    SecretInputError,
    b58check_encode,
    guard_secret,
    is_valid_address,
    looks_like_secret,
    segwit_encode,
    validate_address,
)

# Public, well-known addresses (genesis coinbase, BIP-173/350 test vectors and common examples).


def test_roundtrip_generated_addresses() -> None:
    assert validate_address(b58check_encode(b"\x00" + bytes(20))).kind == "p2pkh"
    assert validate_address(b58check_encode(b"\x05" + bytes(range(20)))).kind == "p2sh"
    assert validate_address(segwit_encode("bc", 0, bytes(range(20)))).kind == "segwit_v0"
    assert validate_address(segwit_encode("bc", 1, bytes(range(32)))).kind == "taproot"
    assert validate_address(segwit_encode("tb", 0, bytes(20)), network="testnet").network == "testnet"


@pytest.mark.parametrize("addr", ["1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy",
                                  "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
                                  "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0"])
def test_known_valid(addr: str) -> None:
    assert is_valid_address(addr)


def test_bech32_is_case_insensitive_but_not_mixed() -> None:
    a = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"
    assert validate_address(a.upper()).address == a
    assert not is_valid_address(a[:5] + a[5:].upper())


@pytest.mark.parametrize(
    "addr",
    [
        "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb",  # checksum broken
        "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLz",
        "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdx",
        # taproot payload with bech32 (v0) checksum must fail (BIP-350)
        segwit_encode("bc", 0, bytes(range(32)))[:-6] + "qqqqqq",
        "hello",
        "",
        "0x52908400098527886E0F7030069857D2E4169EE7",
        "mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn",  # testnet address on mainnet check
    ],
)
def test_invalid(addr: str) -> None:
    assert not is_valid_address(addr)


def test_wrong_witness_version_checksum_variant() -> None:
    v0 = segwit_encode("bc", 0, bytes(range(20)))
    with pytest.raises(InvalidAddressError):
        # same data, bech32m constant -> must be rejected for v0
        from app.services import address as m

        hrp, data, _ = m.bech32_decode(v0)
        values = m._hrp_expand(hrp) + data
        pm = m._polymod([*values, 0, 0, 0, 0, 0, 0]) ^ m._BECH32M_CONST
        checksum = [(pm >> 5 * (5 - i)) & 31 for i in range(6)]
        bad = hrp + "1" + "".join(m._BECH32_CHARSET[d] for d in data + checksum)
        validate_address(bad)


def test_demo_addresses_only_in_demo_mode() -> None:
    assert not is_valid_address("DEMO-illicit01")
    assert validate_address("DEMO-illicit01", allow_demo=True).kind == "demo"


# ---- secret guard (strings are obviously fake; the 12 words are the BIP-39 "abandon" test vector)
SEED12 = " ".join(["abandon"] * 11 + ["about"])


@pytest.mark.parametrize(
    "text",
    [
        SEED12,
        "my seed is " + SEED12 + " please check",
        " ".join(["zoo"] * 24),
        "0x" + "ab" * 32,
        "0123456789abcdef" * 4,  # synthetic 64-hex shape
        "5" + "J" * 50,  # synthetic WIF shapes (not real keys)
        "K" + "w" * 51,
    ],
)
def test_secret_guard_rejects(text: str) -> None:
    assert looks_like_secret(text)
    with pytest.raises(SecretInputError) as exc:
        guard_secret(text)
    assert text not in str(exc.value)


@pytest.mark.parametrize(
    "text",
    [
        "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
        "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
        "please check this wallet for me today",
        "check wallet one A one z P one",
    ],
)
def test_secret_guard_allows_normal_input(text: str) -> None:
    assert not looks_like_secret(text)


def test_address_field_rejects_any_twelve_words_but_transcripts_do_not() -> None:
    words = "please check the wallet address that my friend sent me yesterday ok"
    assert len(words.split()) == 12
    assert looks_like_secret(words, address_field=True)
    assert not looks_like_secret(words)
