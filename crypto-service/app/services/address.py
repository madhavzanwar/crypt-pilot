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


# Invisible / formatting characters: zero-width, bidi controls (LRM, RLM, LRE..RLO, isolates), invisible math operators
# (U+2061..2064), soft hyphen, Mongolian vowel separator, combining grapheme joiner, BOM.
_INVISIBLE_CODEPOINTS = (
    [0x00AD, 0x034F, 0x180E, 0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0xFEFF]
    + list(range(0x202A, 0x202F)) + list(range(0x2060, 0x2065)) + list(range(0x2066, 0x206A))
)
_DELETE_INVISIBLE = dict.fromkeys(_INVISIBLE_CODEPOINTS, None)
_SPACE_INVISIBLE = dict.fromkeys(_INVISIBLE_CODEPOINTS, " ")
# Cyrillic / Greek letters that render like Latin ones ("homoglyphs"): mapped back before testing.
_HOMOGLYPHS = str.maketrans({
    "\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "p", "\u0441": "c", "\u0445": "x", "\u0443": "y",
    "\u0456": "i", "\u0458": "j", "\u0455": "s", "\u0501": "d", "\u04bb": "h", "\u043a": "k", "\u043c": "m",
    "\u0442": "t", "\u043d": "h", "\u0432": "b", "\u0410": "A", "\u0415": "E", "\u041e": "O", "\u0420": "P",
    "\u0421": "C", "\u0425": "X", "\u0423": "Y", "\u0406": "I", "\u0408": "J", "\u0405": "S", "\u041a": "K",
    "\u041c": "M", "\u0422": "T", "\u041d": "H", "\u0412": "B", "\u03bf": "o", "\u039f": "O", "\u03b1": "a",
    "\u03b9": "i", "\u03c5": "u", "\u03bd": "v",
})
_NON_LETTERS = re.compile(r"[^a-z]+")
_SEP = re.compile(r"[\s\-_:/|,;.\u2013\u2014]+")  # what people put between the chunks of a split key
_HEX_TOKEN = re.compile(r"(?:0[xX])?[0-9a-fA-F]+")
_B58_TOKEN = re.compile(r"[1-9A-HJ-NP-Za-km-z]+")
_WIF_FULL = re.compile(r"5[1-9A-HJ-NP-Za-km-z]{50}|[KLc][1-9A-HJ-NP-Za-km-z]{51}|9[1-9A-HJ-NP-Za-km-z]{50}")
_XPRV_FULL = re.compile(r"[xyzt]prv[1-9A-HJ-NP-Za-km-z]{100,112}")
_MAX_SPLIT_RUN = 200  # tokens examined per run (bounds the window scan)


def _variants(text: str) -> list[str]:
    """Normalised views of the input: invisible characters both deleted (hidden inside a word) and turned into
    spaces (hidden between words); NFKC and homoglyph folding applied to both."""
    t = unicodedata.normalize("NFKC", text)
    return [t.translate(_DELETE_INVISIBLE).translate(_HOMOGLYPHS), t.translate(_SPACE_INVISIBLE).translate(_HOMOGLYPHS)]


def _normalize(text: str) -> str:
    return _variants(text)[0]


def _longest_bip39_run(text: str) -> int:
    """Longest run of consecutive BIP-39 words; anything that is not a letter (spaces, digits, "1.", "#2",
    punctuation, invisible characters) only separates words and never breaks a run."""
    words = _bip39_words()
    best = run = 0
    for tok in _NON_LETTERS.split(text.lower()):
        if not tok:
            continue
        if tok in words:
            run += 1
            best = max(best, run)
        else:
            run = 0
    return best


def _token_runs(text: str, token: re.Pattern[str]) -> list[list[str]]:
    """Maximal runs of consecutive separator-delimited tokens that are ALL made of the given alphabet."""
    runs: list[list[str]] = []
    cur: list[str] = []
    for tok in _SEP.split(text):
        if not tok:
            continue
        if token.fullmatch(tok):
            cur.append(tok)
        else:
            if len(cur) > 1:
                runs.append(cur[:_MAX_SPLIT_RUN])
            cur = []
    if len(cur) > 1:
        runs.append(cur[:_MAX_SPLIT_RUN])
    return runs


def _split_hex_key(text: str) -> bool:
    """A 64-hex key written in chunks ("e9873d79 c6d87dc0 ...", dashes, colons, byte pairs)."""
    for run in _token_runs(text, _HEX_TOKEN):
        for i in range(len(run)):
            total = 0
            for j in range(i, len(run)):
                tok = run[j]
                total += len(tok) - (2 if tok[:2] in ("0x", "0X") and j == i else 0)
                if total == 64 and j > i:
                    return True
                if total > 64:
                    break
    return False


def _split_b58_key(text: str) -> bool:
    """A WIF / extended private key broken up by spaces, dashes or similar."""
    for run in _token_runs(text, _B58_TOKEN):
        for i in range(len(run)):
            joined = ""
            for j in range(i, len(run)):
                joined += run[j]
                if len(joined) > 120:
                    break
                if j > i and (_WIF_FULL.fullmatch(joined) or _XPRV_FULL.fullmatch(joined)):
                    return True
    return False


def looks_like_secret(text: str, address_field: bool = False) -> bool:
    """True if text contains something shaped like a seed phrase or a private key.

    Keys split by spaces/hyphens/other separators, seed words separated by digits or punctuation, invisible
    characters and Cyrillic/Greek look-alikes are all caught. 64-hex transaction hashes look exactly like a raw
    private key and are rejected too (the field takes addresses only).

    address_field=True adds a stricter rule for inputs that should be a single address: any
    12/15/18/21/24 lowercase words are rejected even if they are not all BIP-39 words.
    """
    for text in _variants(text):
        if _HEX64.search(text) or _WIF.search(text) or _XPRV.search(text):
            return True
        if _split_hex_key(text) or _split_b58_key(text):
            return True
        if _longest_bip39_run(text) >= _SEED_LENGTHS[0]:
            return True
        if address_field:
            tokens = text.split()
            if len(tokens) in _SEED_LENGTHS and all(_WORD.fullmatch(t) for t in tokens):
                return True
    return False


def guard_secret(text: str, address_field: bool = False) -> None:
    """Raise SecretInputError (content-free message) if the text looks like a secret."""
    if looks_like_secret(text, address_field):
        raise SecretInputError(
            "This looks like a seed phrase or private key. Never share it. "
            "Cryptiq only needs a public address."
        )
