"""Generate a SYNTHETIC dataset in the exact Elliptic++ raw CSV format (fake data, DEMO- addresses).

Used for tests and offline development before the real data is downloaded. Nothing produced from
this fixture is ever reported as a real metric: processed outputs are tagged
`source=synthetic_fixture`, responses set `isMock: true`.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from app.services.datasets.schema import FEATURE_COLUMNS

LAYOUTS = ("default", "combined")


def make_fixture(out: Path, n_wallets: int = 2400, seed: int = 7, layout: str = "default") -> dict[str, int]:
    """layout 'default': features + classes files; 'combined': features file with a class column (HF mirror)."""
    if layout not in LAYOUTS:
        raise ValueError(f"layout must be one of {LAYOUTS}")
    rng = np.random.default_rng(seed)
    out.mkdir(parents=True, exist_ok=True)
    # class codes as in Elliptic++: 1 illicit, 2 licit, 3 unknown
    classes = rng.choice([1, 2, 3], size=n_wallets, p=[0.06, 0.34, 0.60])
    addrs = np.array([f"DEMO-w{i:05d}" for i in range(n_wallets)])
    first_step = rng.integers(1, 50, size=n_wallets)

    rows = []
    for i in range(n_wallets):
        n_steps = int(rng.integers(1, 4))
        steps = np.clip(first_step[i] + np.arange(n_steps) * rng.integers(0, 3), 1, 49)
        illicit = classes[i] == 1
        # weak, overlapping signal in a few columns; the graph (homophily) carries the rest
        base = {c: float(abs(rng.normal(1.0, 1.0))) for c in FEATURE_COLUMNS}
        for c in ("btc_received_max", "fees_as_share_total", "transacted_w_address_total"):
            base[c] = float(abs(rng.normal(1.6 if illicit else 1.0, 1.0)))
        base["num_timesteps_appeared_in"] = float(n_steps)
        for t in steps:
            rows.append({"address": addrs[i], "Time step": int(t), **base})
    feats = pd.DataFrame(rows)
    # Elliptic++ repeats identical rows; mimic that
    feats = pd.concat([feats, feats.sample(frac=0.1, random_state=seed)], ignore_index=True)

    # graph with homophily: illicit wallets cluster together
    edges: list[tuple[str, str]] = []
    illicit_idx = np.flatnonzero(classes == 1)
    other_idx = np.flatnonzero(classes != 1)
    for i in range(n_wallets):
        k = int(rng.integers(1, 4))
        pool = illicit_idx if (classes[i] == 1 and rng.random() < 0.6) else other_idx
        for j in rng.choice(pool, size=k):
            edges.append((addrs[i], addrs[j]))
    # a hub, self-loops and duplicates, as in the real data
    hub = addrs[other_idx[0]]
    edges += [(hub, addrs[j]) for j in rng.choice(n_wallets, size=300, replace=False)]
    edges += [(addrs[5], addrs[5]), (addrs[6], addrs[7]), (addrs[6], addrs[7])]

    if layout == "combined":
        feats["class"] = feats["address"].map(dict(zip(addrs, classes.tolist(), strict=True)))
        feats.to_csv(out / "wallets_features_classes_combined.csv", index=False)
    else:
        feats.to_csv(out / "wallets_features.csv", index=False)
        pd.DataFrame({"address": addrs, "class": classes}).to_csv(out / "wallets_classes.csv", index=False)
    pd.DataFrame(edges, columns=["input_address", "output_address"]).to_csv(
        out / "AddrAddr_edgelist.csv", index=False)
    return {"wallets": n_wallets, "feature_rows": len(feats), "edges": len(edges)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=Path("data/fixture/raw"))
    ap.add_argument("--wallets", type=int, default=2400)
    ap.add_argument("--layout", choices=LAYOUTS, default="default",
                    help="combined: only wallets_features_classes_combined.csv + edge list (Hugging Face layout)")
    args = ap.parse_args()
    print(make_fixture(args.out, args.wallets, layout=args.layout))


if __name__ == "__main__":
    main()
