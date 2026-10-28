"""reportHash = keccak256 of the canonical evidence JSON (see docs/api-contract.md)."""

from __future__ import annotations

import json
from typing import Any

from Crypto.Hash import keccak


def canonical_json(obj: Any) -> str:
    """Sorted keys, no whitespace, non-ASCII kept. Floats are rejected: format them as strings first."""

    def check(v: Any) -> None:
        if isinstance(v, float):
            raise TypeError("floats are not allowed in canonical evidence; pre-format as strings")
        if isinstance(v, dict):
            for x in v.values():
                check(x)
        elif isinstance(v, list):
            for x in v:
                check(x)

    check(obj)
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def keccak_hex(data: str) -> str:
    k = keccak.new(digest_bits=256)
    k.update(data.encode("utf-8"))
    return "0x" + k.hexdigest()


def report_hash(evidence: dict[str, Any]) -> str:
    return keccak_hex(canonical_json(evidence))
