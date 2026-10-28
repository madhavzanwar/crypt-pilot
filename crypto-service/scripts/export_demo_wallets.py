"""Pick demo wallets ONLY from the held-out test split and write artifacts/demo_wallets.json.

`expected` is the verdict the trained system gives (computed here, not hand-written); wallets are
picked where that verdict agrees with the dataset label, so the demo is predictable. This is a demo
choice, not a metric: metrics live in model_card.json.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from app.config import get_settings
from app.services.address import is_valid_address
from app.services.model.policy import decide
from app.services.model.scorer import Scorer

# well-known public addresses used as "not in the dataset" candidates (checked against the data)
NOT_IN_DATASET_CANDIDATES = [
    "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
    "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
    "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
]


def pick(s: Scorer, n_each: int = 3, seed: int = 11) -> list[dict[str, str]]:
    t = s.table
    test = t[(t["split"] == "test")]
    scores = s.batch_scores(test.index)
    rng = np.random.default_rng(seed)
    out: list[dict[str, str]] = []

    def take(mask: np.ndarray, k: int, note: str, expected: str) -> None:
        idx = np.flatnonzero(mask)
        for i in rng.permutation(idx)[:k]:
            out.append({"address": str(test.index[i]), "note": note, "expected": expected})

    lab = test["label"].to_numpy()
    ds = "the synthetic fixture" if s.data_source == "synthetic_fixture" else "Elliptic++"
    take((lab == "illicit") & (scores >= s.block), n_each, f"Test-split wallet labelled illicit in {ds}", "BLOCK")
    take((lab == "licit") & (scores < s.warn), n_each, f"Test-split wallet labelled licit in {ds}", "ALLOW")
    take((scores >= s.warn) & (scores < s.block), 1, "Borderline test-split wallet", "WARN")
    if s.data_source == "synthetic_fixture":
        missing = "DEMO-notindataset"
    else:
        missing = next(a for a in NOT_IN_DATASET_CANDIDATES if is_valid_address(a) and not s.has(a))
    out.append({"address": missing, "note": "Not in the research dataset (not charged)", "expected": "UNKNOWN"})
    for w in out:
        if w["expected"] != "UNKNOWN":
            res = s.score(w["address"])
            assert res is not None
            assert decide(res.score, True, False, s.warn, s.block, s.label(w["address"])) == w["expected"]
    return out


def main() -> None:
    st = get_settings()
    s = Scorer(st.artifacts_dir, st.processed_dir)
    wallets = pick(s)
    path: Path = st.artifacts_dir / "demo_wallets.json"
    path.write_text(json.dumps({"dataSource": s.data_source, "wallets": wallets}, indent=2))
    print(json.dumps(wallets, indent=2))
    kinds = {w["expected"] for w in wallets}
    if kinds != {"ALLOW", "WARN", "BLOCK", "UNKNOWN"}:
        print(f"WARNING: not every verdict type is covered: {sorted(kinds)}")


if __name__ == "__main__":
    main()
