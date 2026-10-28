"""Find a Bitcoin address in a (noisy) spoken transcript. Every candidate is checksum-validated.

Speech-to-text spells addresses in many ways ("one A one z P", "b c one q", "capital K", dashes,
spaces, punctuation). We try, in order: raw tokens, the text with separators removed, and a version
where spoken number words / "capital X" / "small x" are converted. The first checksum-valid address
wins; otherwise null (the frontend shows the raw text so the user can correct it).
"""

from __future__ import annotations

import re

from app.services.address import is_valid_address

_NUMBER_WORDS = {"zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6",
                 "seven": "7", "eight": "8", "nine": "9", "won": "1", "to": "2", "too": "2", "for": "4",
                 "ate": "8", "शून्य": "0", "एक": "1", "दो": "2", "तीन": "3", "चार": "4", "पांच": "5", "पाँच": "5",
                 "छह": "6", "सात": "7", "आठ": "8", "नौ": "9"}
_FILLERS = {"address", "wallet", "is", "the", "check", "please", "my", "this", "bitcoin", "dash", "hyphen",
            "space", "comma", "dot", "period", "पता", "वॉलेट", "चेक", "करो", "कीजिए", "है", "यह"}
_CANDIDATE = re.compile(r"(?:bc1|BC1)[a-zA-HJ-NP-Z0-9]{8,87}|[13][a-km-zA-HJ-NP-Z1-9]{24,34}")
_SEPARATORS = re.compile(r"[\s\-_.,;:!?'\"()/\\|]+")


def _scan(text: str) -> str | None:
    for m in _CANDIDATE.finditer(text):
        cand = m.group(0)
        # a match may have swallowed trailing letters: try shrinking from the right
        for end in range(len(cand), 24, -1):
            c = cand[:end]
            if is_valid_address(c):
                return c.lower() if c.lower().startswith("bc1") else c
    return None


def _spoken_to_chars(text: str) -> str:
    tokens = text.split()
    out: list[str] = []
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        low = tok.lower().strip(".,;:!?")
        nxt = tokens[i + 1] if i + 1 < len(tokens) else ""
        if low in ("capital", "uppercase", "upper", "big", "कैपिटल") and nxt:
            out.append(nxt[:1].upper() + nxt[1:])
            i += 2
            continue
        if low in ("small", "lowercase", "lower", "स्मॉल") and nxt:
            out.append(nxt.lower())
            i += 2
            continue
        if low in _NUMBER_WORDS:
            out.append(_NUMBER_WORDS[low])
        elif low not in _FILLERS:
            out.append(tok)
        i += 1
    return "".join(out)


def extract_address(text: str) -> str | None:
    if not text:
        return None
    found = _scan(text)
    if found:
        return found
    squashed = _SEPARATORS.sub("", text)
    found = _scan(squashed)
    if found:
        return found
    spoken = _SEPARATORS.sub("", _spoken_to_chars(_SEPARATORS.sub(" ", text)))
    return _scan(spoken)
