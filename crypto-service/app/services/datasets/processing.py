"""Raw Elliptic++ CSVs -> clean tables, time-based splits and graph features.

All graph computations use scipy sparse matrices (822k nodes / 2.8M edges fit in memory and run in
seconds; a NetworkX graph of that size would need several GB and minutes).

Label-leakage rules for graph features (tested in tests/test_leakage.py):
- only TRAIN-split labels are used ("y_train"); validation/test labels are treated as unknown;
- a wallet's own label never contributes to its own features (self is excluded explicitly).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import scipy.sparse as sp
from scipy.sparse.csgraph import connected_components

from app.services.datasets.schema import (
    ADDRESS,
    CLASS,
    CLASS_TO_LABEL,
    EDGE_DST,
    EDGE_SRC,
    FEATURE_COLUMNS,
    TIME_STEP,
    TRAIN_MAX_STEP,
    VAL_MAX_STEP,
)

GRAPH_FEATURE_COLUMNS = [
    "pagerank", "comp_size", "in_deg", "out_deg",
    "nb1_illicit_train", "nb1_licit_train", "walk2_illicit_train", "walk2_licit_train",
    "hops_to_illicit_train",
]
HOPS_NONE = 3  # "3 or more / none" for hops_to_illicit_train


FEATURES_FILE = "wallets_features.csv"
CLASSES_FILE = "wallets_classes.csv"
COMBINED_FILE = "wallets_features_classes_combined.csv"
EDGES_FILE = "AddrAddr_edgelist.csv"
LFS_MAGIC = b"version https://git-lfs"
LFS_MAX_POINTER_BYTES = 1024  # a real pointer file is ~130 bytes
HF_DATASET_URL = "https://huggingface.co/datasets/AI4FinTech/ellipticpp"


class ConflictingClassesError(ValueError):
    """An address carries more than one class code in the combined features+classes file."""


def detect_lfs_pointers(raw_dir: Path) -> list[Path]:
    """Files in raw_dir that are Git-LFS pointer stubs (a `git clone` without `git lfs pull`)."""
    if not raw_dir.is_dir():
        return []
    found = []
    for path in sorted(raw_dir.iterdir()):
        if not path.is_file() or path.stat().st_size > LFS_MAX_POINTER_BYTES:
            continue
        with path.open("rb") as fh:
            if fh.read(len(LFS_MAGIC)) == LFS_MAGIC:
                found.append(path)
    return found


def lfs_pointer_message(pointers: list[Path]) -> str:
    names = "\n".join(f"  - {p}" for p in pointers)
    return (
        "These files are Git-LFS pointer stubs, not the real data:\n"
        f"{names}\n"
        "Fetch the real Elliptic++ CSVs and replace them: download wallets_features.csv, "
        "wallets_features_classes_combined.csv (or wallets_classes.csv) and AddrAddr_edgelist.csv from "
        f"Hugging Face ({HF_DATASET_URL}) or from the Google Drive link in the README."
    )


def _csv_header(path: Path) -> list[str]:
    return [str(c) for c in pd.read_csv(path, nrows=0).columns]


def _read_columns(path: Path, wanted: list[str]) -> pd.DataFrame:
    """Read only the wanted columns that exist (missing ones are left for check_schema to report)."""
    present = set(_csv_header(path))
    return pd.read_csv(path, engine="pyarrow", usecols=[c for c in wanted if c in present])


def _classes_from_combined(path: Path) -> pd.DataFrame:
    """One class per address (first-appearance order); conflicting classes raise, never guess."""
    cols = pd.read_csv(path, engine="pyarrow", usecols=[ADDRESS, CLASS])
    pairs = cols.drop_duplicates()
    del cols
    dup = pairs[ADDRESS].duplicated(keep=False)
    if dup.any():
        bad = pairs[dup].groupby(ADDRESS, sort=False)[CLASS].agg(lambda s: sorted(s.unique().tolist()))
        examples = "; ".join(f"{a}: {c}" for a, c in list(bad.items())[:5])
        raise ConflictingClassesError(
            f"{path.name}: {len(bad)} address(es) have conflicting classes across rows "
            f"(e.g. {examples}). Not guessing; fix or supply wallets_classes.csv."
        )
    return pairs.reset_index(drop=True)


def read_raw(raw_dir: Path) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Load (features, classes, edges).

    Classes come from wallets_classes.csv if present, else are derived from
    wallets_features_classes_combined.csv. Features come from wallets_features.csv if present, else from
    the combined file. Only the needed columns are read so the ~600 MB files are not held twice.
    """
    classes_path, features_path = raw_dir / CLASSES_FILE, raw_dir / FEATURES_FILE
    combined_path = raw_dir / COMBINED_FILE
    wanted = [ADDRESS, TIME_STEP, *FEATURE_COLUMNS]
    if classes_path.exists():
        if not features_path.exists():
            raise FileNotFoundError(f"{features_path} not found")
        classes = pd.read_csv(classes_path, engine="pyarrow")
    elif combined_path.exists():
        classes = _classes_from_combined(combined_path)
    else:
        raise FileNotFoundError(f"neither {classes_path} nor {combined_path} found in {raw_dir}")
    feats = _read_columns(features_path if features_path.exists() else combined_path, wanted)
    edges = pd.read_csv(raw_dir / EDGES_FILE, engine="pyarrow")
    return feats, classes, edges


def check_schema(feats: pd.DataFrame, classes: pd.DataFrame, edges: pd.DataFrame) -> list[str]:
    """Return a list of problems (empty if the files match the documented schema)."""
    problems = []
    missing = {ADDRESS, TIME_STEP, *FEATURE_COLUMNS} - set(feats.columns)
    if missing:
        problems.append(f"wallets_features.csv missing columns: {sorted(missing)}")
    if {ADDRESS, CLASS} - set(classes.columns):
        problems.append("wallets_classes.csv needs columns address, class")
    elif not set(classes[CLASS].unique()) <= set(CLASS_TO_LABEL):
        problems.append(f"unexpected class codes: {sorted(classes[CLASS].unique())}")
    if {EDGE_SRC, EDGE_DST} - set(edges.columns):
        problems.append("AddrAddr_edgelist.csv needs columns input_address, output_address")
    return problems


def summarize(feats: pd.DataFrame, classes: pd.DataFrame, edges: pd.DataFrame) -> dict[str, Any]:
    deg = pd.concat([edges[EDGE_SRC], edges[EDGE_DST]]).value_counts()
    steps = feats[TIME_STEP]
    return {
        "wallets_features": {
            "rows": len(feats),
            "columns": list(feats.columns),
            "unique_addresses": int(feats[ADDRESS].nunique()),
            "exact_duplicate_rows": int(feats.duplicated().sum()),
            "time_step_min": int(steps.min()),
            "time_step_max": int(steps.max()),
            "rows_per_address_max": int(feats[ADDRESS].value_counts().max()),
            "features_vary_within_address": int(
                (feats.drop(columns=[TIME_STEP]).drop_duplicates()[ADDRESS].duplicated()).sum()),
        },
        "wallets_classes": {
            "rows": len(classes),
            "unique_addresses": int(classes[ADDRESS].nunique()),
            "class_counts": {str(k): int(v) for k, v in classes[CLASS].value_counts().sort_index().items()},
            "label_encoding": {str(k): v for k, v in CLASS_TO_LABEL.items()},
        },
        "AddrAddr_edgelist": {
            "rows": len(edges),
            "columns": list(edges.columns),
            "has_time_column": any("time" in c.lower() for c in edges.columns),
            "self_loops": int((edges[EDGE_SRC] == edges[EDGE_DST]).sum()),
            "duplicate_edges": int(edges.duplicated().sum()),
            "reciprocal_edges": _reciprocal(edges),
            "addresses_in_edges": int(deg.shape[0]),
            "max_degree": int(deg.max()),
            "degree_p50": float(deg.quantile(0.5)),
            "degree_p99": float(deg.quantile(0.99)),
            "nodes_with_degree_over_1000": int((deg > 1000).sum()),
            "edge_addresses_missing_from_classes": int((~deg.index.isin(classes[ADDRESS])).sum()),
        },
    }


def _reciprocal(edges: pd.DataFrame) -> int:
    e = edges[[EDGE_SRC, EDGE_DST]].drop_duplicates()
    e = e[e[EDGE_SRC] != e[EDGE_DST]]
    return int(pd.merge(e, e, left_on=[EDGE_SRC, EDGE_DST], right_on=[EDGE_DST, EDGE_SRC]).shape[0])


def build_wallets(feats: pd.DataFrame, classes: pd.DataFrame) -> pd.DataFrame:
    """One row per address: label, first/last time step and the features of its latest appearance."""
    f = feats.drop_duplicates()
    span = f.groupby(ADDRESS)[TIME_STEP].agg(first_step="min", last_step="max", n_appearances="nunique")
    latest = f.sort_values([ADDRESS, TIME_STEP]).drop_duplicates(ADDRESS, keep="last")
    latest = latest.set_index(ADDRESS)[FEATURE_COLUMNS]
    w = classes.drop_duplicates(ADDRESS).set_index(ADDRESS)
    w["label"] = w[CLASS].map(CLASS_TO_LABEL)
    out = w[["label"]].join(span, how="left").join(latest, how="left").reset_index()
    out[FEATURE_COLUMNS] = out[FEATURE_COLUMNS].astype("float32")
    return out


def assign_splits(wallets: pd.DataFrame, train_max: int = TRAIN_MAX_STEP, val_max: int = VAL_MAX_STEP
                  ) -> pd.DataFrame:
    """Time-based split on the first time step a wallet appears in."""
    step = wallets["first_step"].fillna(wallets["first_step"].max())
    split = np.where(step <= train_max, "train", np.where(step <= val_max, "val", "test"))
    return pd.DataFrame({ADDRESS: wallets[ADDRESS], "split": split, "first_step": wallets["first_step"]})


def build_edges(edges: pd.DataFrame, known: pd.Series) -> tuple[pd.DataFrame, dict[str, int]]:
    e = edges.rename(columns={EDGE_SRC: "src", EDGE_DST: "dst"})[["src", "dst"]]
    stats = {"raw": len(e)}
    e = e[e["src"] != e["dst"]]
    stats["after_self_loops"] = len(e)
    e = e.drop_duplicates()
    stats["after_dedupe"] = len(e)
    known_set = pd.Index(known)
    e = e[e["src"].isin(known_set) & e["dst"].isin(known_set)]
    stats["after_unknown_address_filter"] = len(e)
    return e.reset_index(drop=True), stats


@dataclass
class IndexedGraph:
    addresses: np.ndarray  # index -> address
    directed: sp.csr_matrix  # src -> dst, binary
    undirected: sp.csr_matrix  # symmetric, binary, zero diagonal


def index_graph(addresses: pd.Series, edges: pd.DataFrame) -> IndexedGraph:
    addr = addresses.to_numpy()
    idx = pd.Index(addr)
    s = idx.get_indexer(edges["src"])
    d = idx.get_indexer(edges["dst"])
    n = len(addr)
    data = np.ones(len(s), dtype=np.float32)
    directed = sp.csr_matrix((data, (s, d)), shape=(n, n))
    directed.data[:] = 1.0
    und = (directed + directed.T).tocsr()
    und.data[:] = 1.0
    und.setdiag(0)
    und.eliminate_zeros()
    return IndexedGraph(addr, directed, und)


def pagerank(directed: sp.csr_matrix, alpha: float = 0.85, tol: float = 1e-10, max_iter: int = 200
             ) -> np.ndarray:
    """Standard PageRank (power iteration, uniform teleport, dangling mass redistributed uniformly)."""
    n = directed.shape[0]
    out_deg = np.asarray(directed.sum(axis=1)).ravel()
    dangling = out_deg == 0
    inv = np.zeros(n)
    inv[~dangling] = 1.0 / out_deg[~dangling]
    transition_t = (sp.diags(inv) @ directed).T.tocsr()
    r = np.full(n, 1.0 / n)
    for _ in range(max_iter):
        r_new = alpha * (transition_t @ r + r[dangling].sum() / n) + (1 - alpha) / n
        if np.abs(r_new - r).sum() < tol:
            r = r_new
            break
        r = r_new
    out: np.ndarray = r / r.sum()
    return out


def graph_features(g: IndexedGraph, labels: pd.Series, splits: pd.Series) -> pd.DataFrame:
    """Per-wallet graph features. Label-derived ones use TRAIN labels only and exclude self.

    labels/splits are aligned with g.addresses.
    """
    a = g.undirected
    is_train = (splits.to_numpy() == "train")
    y_ill = ((labels.to_numpy() == "illicit") & is_train).astype(np.float64)
    y_lic = ((labels.to_numpy() == "licit") & is_train).astype(np.float64)
    deg = np.asarray(a.sum(axis=1)).ravel()

    # hop-1: distinct neighbours (diagonal is zero, so self is excluded)
    nb1_ill = a @ y_ill
    nb1_lic = a @ y_lic
    # 2-step walks ending at a train-labelled wallet, minus walks i->j->i that return to self
    walk2_ill = a @ nb1_ill - deg * y_ill
    walk2_lic = a @ nb1_lic - deg * y_lic
    # nearest OTHER train-illicit wallet: 1 if a neighbour is one; else 2 if a 2-walk reaches a
    # non-adjacent one (then its distance is exactly 2); else "3 or more / none"
    hops = np.full(len(deg), HOPS_NONE, dtype=np.int8)
    hops[walk2_ill > 0.5] = 2
    hops[nb1_ill > 0.5] = 1

    _n_comp, comp = connected_components(a, directed=False)
    comp_size = np.bincount(comp)[comp]
    return pd.DataFrame({
        ADDRESS: g.addresses,
        "pagerank": pagerank(g.directed).astype(np.float64),
        "comp_id": comp.astype(np.int64),
        "comp_size": comp_size.astype(np.int64),
        "in_deg": np.asarray(g.directed.sum(axis=0)).ravel().astype(np.int64),
        "out_deg": np.asarray(g.directed.sum(axis=1)).ravel().astype(np.int64),
        "nb1_illicit_train": nb1_ill.astype(np.int64),
        "nb1_licit_train": nb1_lic.astype(np.int64),
        "walk2_illicit_train": np.rint(walk2_ill).astype(np.int64),
        "walk2_licit_train": np.rint(walk2_lic).astype(np.int64),
        "hops_to_illicit_train": hops,
    })
