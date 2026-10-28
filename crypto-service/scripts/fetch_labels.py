"""Download external label lists.

- OFAC sanctioned Bitcoin (XBT) addresses from 0xB10C/ofac-sanctioned-digital-currency-addresses
  (MIT, `lists` branch) -> data/labels/ofac_btc.txt
- Optional Ransomwhere (OpenSanctions, CC BY-NC 4.0; non-commercial demo use with attribution) when
  RANSOMWHERE_ENABLED=true: download the dataset export manually (see README) to RANSOMWHERE_PATH.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

import httpx

from app.config import get_settings
from app.services.address import is_valid_address

OFAC_URL = ("https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/"
            "lists/sanctioned_addresses_XBT.txt")


def main() -> None:
    s = get_settings()
    r = httpx.get(OFAC_URL, timeout=30, follow_redirects=True)
    r.raise_for_status()
    lines = [ln.strip() for ln in r.text.splitlines() if ln.strip()]
    valid = [a for a in lines if is_valid_address(a)]
    s.ofac_list_path.parent.mkdir(parents=True, exist_ok=True)
    s.ofac_list_path.write_text("\n".join(valid) + "\n")
    meta = {"source": OFAC_URL, "fetched_at": datetime.now(UTC).isoformat(),
            "lines": len(lines), "valid_checksum": len(valid)}
    s.ofac_list_path.with_suffix(".meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta, indent=2))
    if s.ransomwhere_enabled and (not s.ransomwhere_path or not s.ransomwhere_path.exists()):
        print("RANSOMWHERE_ENABLED=true but RANSOMWHERE_PATH is missing: see README (manual download).")


if __name__ == "__main__":
    main()
