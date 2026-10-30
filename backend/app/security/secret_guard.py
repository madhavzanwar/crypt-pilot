"""Server-side guard for text that must never reach the chat engine: seed phrases and private keys.

Ported from the crypto service's address guard (crypto-service/app/services/address.py) and the frontend's seedGuard.ts so the
three agree: BIP-39 phrases of any length (also split by digits/punctuation/hyphens, numbered, invisible characters,
look-alike letters), raw 64-hex keys, WIF, extended private keys (xprv...), also when a key is written in chunks. A chat
request is checked on its message AND on the earlier user turns joined together, so a key sent in two halves is caught
on the second one. Rejected text is never echoed, stored or logged.
"""
from __future__ import annotations

import re
import unicodedata
from functools import lru_cache
from pathlib import Path

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


SECRET_MESSAGE = (
    "This looks like a seed phrase or a private key. Never share it with anyone, including this chat. "
    "I did not read or keep it. If you typed it by mistake, treat that wallet as exposed and move your funds."
)
_HISTORY_USER_TURNS = 4  # earlier user turns joined with the new message to catch a key sent in pieces


def message_has_secret(message: str, history: list | None = None) -> bool:
    """True if the new message, any earlier turn, or the recent user turns taken together look like a secret."""
    if looks_like_secret(message):
        return True
    turns = [(getattr(t, "role", None), getattr(t, "content", "")) for t in (history or [])]
    if any(looks_like_secret(c) for _, c in turns):
        return True
    recent_user = [c for r, c in turns if r == "user"][-_HISTORY_USER_TURNS:]
    return bool(recent_user) and looks_like_secret(" ".join([*recent_user, message]))
