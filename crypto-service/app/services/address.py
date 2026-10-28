"""Bitcoin address validation (real checksums) and the secret-input guard.

- Legacy (P2PKH) and P2SH: base58check, version byte checked per network.
- SegWit: bech32 (BIP-173, witness v0) and bech32m (BIP-350, witness v1+).
- Secret guard: seed phrases (BIP-39 words) and private keys (hex / WIF / xprv) are
  rejected and their content is never logged.

The bech32 functions follow the BIP-173/BIP-350 specifications (reference algorithm, MIT).
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal

Network = Literal["mainnet", "testnet"]
AddressKind = Literal["p2pkh", "p2sh", "segwit_v0", "taproot", "segwit", "demo"]

_B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
_B58_INDEX = {c: i for i, c in enumerate(_B58_ALPHABET)}
_BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
_BECH32_CONST = 1
_BECH32M_CONST = 0x2BC830A3

_VERSION_BYTES: dict[Network, dict[int, AddressKind]] = {
    "mainnet": {0x00: "p2pkh", 0x05: "p2sh"},
    "testnet": {0x6F: "p2pkh", 0xC4: "p2sh"},
}
_HRP: dict[Network, tuple[str, ...]] = {"mainnet": ("bc",), "testnet": ("tb",)}

DEMO_PATTERN = re.compile(r"^DEMO-[A-Za-z0-9]{3,40}$")


@dataclass(frozen=True)
class AddressInfo:
    address: str
    kind: AddressKind
    network: Network | Literal["demo"]


class InvalidAddressError(ValueError):
    """Raised when a string is not a valid Bitcoin address."""


class SecretInputError(ValueError):
    """Raised when input looks like a seed phrase or private key. Never log the input."""


# ---------------------------------------------------------------- base58check


def b58decode(s: str) -> bytes:
    num = 0
    for ch in s:
        if ch not in _B58_INDEX:
            raise InvalidAddressError("invalid base58 character")
        num = num * 58 + _B58_INDEX[ch]
    raw = num.to_bytes((num.bit_length() + 7) // 8, "big") if num else b""
    pad = len(s) - len(s.lstrip("1"))
    return b"\x00" * pad + raw


def b58encode(data: bytes) -> str:
    num = int.from_bytes(data, "big")
    out = ""
    while num:
        num, rem = divmod(num, 58)
        out = _B58_ALPHABET[rem] + out
    pad = len(data) - len(data.lstrip(b"\x00"))
    return "1" * pad + out


def b58check_decode(s: str) -> bytes:
    raw = b58decode(s)
    if len(raw) < 5:
        raise InvalidAddressError("too short")
    payload, checksum = raw[:-4], raw[-4:]
    if hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4] != checksum:
        raise InvalidAddressError("bad base58 checksum")
    return payload


def b58check_encode(payload: bytes) -> str:
    return b58encode(payload + hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4])


# ---------------------------------------------------------------- bech32 / bech32m


def _polymod(values: list[int]) -> int:
    gen = (0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3)
    chk = 1
    for v in values:
        top = chk >> 25
        chk = (chk & 0x1FFFFFF) << 5 ^ v
        for i in range(5):
            chk ^= gen[i] if ((top >> i) & 1) else 0
    return chk


def _hrp_expand(hrp: str) -> list[int]:
    return [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]


def bech32_decode(bech: str) -> tuple[str, list[int], int]:
    """Return (hrp, data-without-checksum, const). Raises InvalidAddressError."""
    if any(ord(x) < 33 or ord(x) > 126 for x in bech):
        raise InvalidAddressError("invalid character")
    if bech.lower() != bech and bech.upper() != bech:
        raise InvalidAddressError("mixed case")
    bech = bech.lower()
    pos = bech.rfind("1")
    if pos < 1 or pos + 7 > len(bech) or len(bech) > 90:
        raise InvalidAddressError("bad bech32 structure")
    if not all(x in _BECH32_CHARSET for x in bech[pos + 1 :]):
        raise InvalidAddressError("invalid bech32 character")
    hrp = bech[:pos]
    data = [_BECH32_CHARSET.find(x) for x in bech[pos + 1 :]]
    const = _polymod(_hrp_expand(hrp) + data)
    if const not in (_BECH32_CONST, _BECH32M_CONST):
        raise InvalidAddressError("bad bech32 checksum")
    return hrp, data[:-6], const


def _convertbits(data: list[int], frombits: int, tobits: int, pad: bool) -> list[int]:
    acc = 0
    bits = 0
    ret: list[int] = []
    maxv = (1 << tobits) - 1
    for value in data:
        if value < 0 or (value >> frombits):
            raise InvalidAddressError("bad data")
        acc = (acc << frombits) | value
        bits += frombits
        while bits >= tobits:
            bits -= tobits
            ret.append((acc >> bits) & maxv)
    if pad:
        if bits:
            ret.append((acc << (tobits - bits)) & maxv)
    elif bits >= frombits or ((acc << (tobits - bits)) & maxv):
        raise InvalidAddressError("bad padding")
    return ret


def segwit_decode(hrp: str, addr: str) -> tuple[int, bytes]:
    hrpgot, data, const = bech32_decode(addr)
    if hrpgot != hrp or not data:
        raise InvalidAddressError("wrong hrp")
    witver = data[0]
    prog = bytes(_convertbits(data[1:], 5, 8, False))
    if not 2 <= len(prog) <= 40 or witver > 16:
        raise InvalidAddressError("bad witness program")
    if witver == 0 and len(prog) not in (20, 32):
        raise InvalidAddressError("bad v0 program length")
    if (witver == 0 and const != _BECH32_CONST) or (witver != 0 and const != _BECH32M_CONST):
        raise InvalidAddressError("wrong checksum variant")
    return witver, prog


def segwit_encode(hrp: str, witver: int, prog: bytes) -> str:
    const = _BECH32_CONST if witver == 0 else _BECH32M_CONST
    data = [witver, *_convertbits(list(prog), 8, 5, True)]
    values = _hrp_expand(hrp) + data
    polymod = _polymod([*values, 0, 0, 0, 0, 0, 0]) ^ const
    checksum = [(polymod >> 5 * (5 - i)) & 31 for i in range(6)]
    return hrp + "1" + "".join(_BECH32_CHARSET[d] for d in data + checksum)


# ---------------------------------------------------------------- public API


def validate_address(raw: str, network: Network = "mainnet", allow_demo: bool = False) -> AddressInfo:
    """Validate a Bitcoin address with real checksums. Returns the canonical form."""
    addr = raw.strip()
    if allow_demo and DEMO_PATTERN.match(addr):
        return AddressInfo(addr, "demo", "demo")
    if not addr or len(addr) > 90:
        raise InvalidAddressError("not a Bitcoin address")
    lower = addr.lower()
    for hrp in _HRP[network]:
        if lower.startswith(hrp + "1"):
            witver, _ = segwit_decode(hrp, addr)
            kind: AddressKind = "segwit_v0" if witver == 0 else ("taproot" if witver == 1 else "segwit")
            return AddressInfo(lower, kind, network)
    if not 25 <= len(addr) <= 35:
        raise InvalidAddressError("not a Bitcoin address")
    payload = b58check_decode(addr)
    if len(payload) != 21:
        raise InvalidAddressError("bad payload length")
    addr_kind = _VERSION_BYTES[network].get(payload[0])
    if addr_kind is None:
        raise InvalidAddressError("wrong network or version byte")
    return AddressInfo(addr, addr_kind, network)


def is_valid_address(raw: str, network: Network = "mainnet", allow_demo: bool = False) -> bool:
    try:
        validate_address(raw, network, allow_demo)
    except InvalidAddressError:
        return False
    return True


# ---------------------------------------------------------------- secret guard

_HEX64 = re.compile(r"(?<![0-9a-fA-F])(?:0x)?[0-9a-fA-F]{64}(?![0-9a-fA-F])")
_WIF = re.compile(r"(?<![1-9A-HJ-NP-Za-km-z])(?:5[1-9A-HJ-NP-Za-km-z]{50}|[KLc][1-9A-HJ-NP-Za-km-z]{51}"
                  r"|9[1-9A-HJ-NP-Za-km-z]{50})(?![1-9A-HJ-NP-Za-km-z])")
_XPRV = re.compile(r"\b[xyzt]prv[1-9A-HJ-NP-Za-km-z]{100,112}\b")
_WORD = re.compile(r"[a-z]+")
_SEED_LENGTHS = (12, 15, 18, 21, 24)


@lru_cache(maxsize=1)
def _bip39_words() -> frozenset[str]:
    path = Path(__file__).parent / "resources" / "bip39_english.txt"
    return frozenset(w.strip() for w in path.read_text().splitlines() if w.strip())


_INVISIBLE = dict.fromkeys(map(ord, "\u200b\u200c\u200d\u2060\ufeff\u00ad"), None)
_LIST_NUMBER = re.compile(r"(?:(?<=\s)|^)\(?\d{1,2}[.):]\s*")


def _normalize(text: str) -> str:
    """Remove invisible characters and list numbering ("1. word 2. word") that hide a seed phrase."""
    text = unicodedata.normalize("NFKC", text).translate(_INVISIBLE)
    return _LIST_NUMBER.sub(" ", text)


def _longest_bip39_run(text: str) -> int:
    words = _bip39_words()
    best = run = 0
    for tok in re.split(r"[\s,;.\-]+", _normalize(text).lower()):
        if not tok:
            continue
        if tok in words:
            run += 1
            best = max(best, run)
        else:
            run = 0
    return best


def looks_like_secret(text: str, address_field: bool = False) -> bool:
    """True if text contains something shaped like a seed phrase or a private key.

    address_field=True adds a stricter rule for inputs that should be a single address: any
    12/15/18/21/24 lowercase words are rejected even if they are not all BIP-39 words.
    """
    text = _normalize(text)
    if _HEX64.search(text) or _WIF.search(text) or _XPRV.search(text):
        return True
    if _longest_bip39_run(text) >= _SEED_LENGTHS[0]:
        return True
    if not address_field:
        return False
    tokens = text.split()
    return len(tokens) in _SEED_LENGTHS and all(_WORD.fullmatch(t) for t in tokens)


def guard_secret(text: str, address_field: bool = False) -> None:
    """Raise SecretInputError (content-free message) if the text looks like a secret."""
    if looks_like_secret(text, address_field):
        raise SecretInputError(
            "This looks like a seed phrase or private key. Never share it. "
            "Cryptiq only needs a public address."
        )
