"""External address label lists (exact match on the canonical address form)."""

from __future__ import annotations

import csv
from pathlib import Path

from app.logging_setup import log
from app.services.address import is_valid_address


def _canonical(a: str) -> str:
    a = a.strip()
    return a.lower() if a.lower().startswith("bc1") else a


class LabelLists:
    def __init__(self, ofac_path: Path, ransomwhere_path: Path | None = None) -> None:
        self.ofac = self._load_lines(ofac_path)
        self.ransomwhere = self._load_ransomwhere(ransomwhere_path) if ransomwhere_path else frozenset()
        self.ofac_loaded = ofac_path.exists()
        if not self.ofac_loaded:
            log.warning("ofac_list_missing", path=str(ofac_path))

    @staticmethod
    def _load_lines(path: Path) -> frozenset[str]:
        if not path.exists():
            return frozenset()
        return frozenset(_canonical(x) for x in path.read_text().splitlines() if x.strip())

    @staticmethod
    def _load_ransomwhere(path: Path) -> frozenset[str]:
        if not path.exists():
            log.warning("ransomwhere_list_missing")
            return frozenset()
        text = path.read_text()
        lines = text.splitlines()
        if not lines:
            return frozenset()
        if "," not in lines[0]:
            return frozenset(_canonical(x) for x in text.splitlines() if is_valid_address(x.strip()))
        out = set()
        for row in csv.DictReader(text.splitlines()):
            for v in row.values():
                if v and is_valid_address(v.strip()):
                    out.add(_canonical(v))
        return frozenset(out)

    def hits(self, address: str) -> tuple[bool, bool]:
        a = _canonical(address)
        return a in self.ofac, a in self.ransomwhere
