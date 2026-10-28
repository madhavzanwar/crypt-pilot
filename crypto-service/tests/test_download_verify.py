from __future__ import annotations

from pathlib import Path

import pytest

from scripts import download_data as dd
from scripts.make_fixture import make_fixture


@pytest.fixture
def small_thresholds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(dd, "MIN_REAL_BYTES", 100)  # fixtures are tiny; the real floor is 1 MB


def test_count_rows(tmp_path: Path) -> None:
    f = tmp_path / "a.csv"
    f.write_text("h\n1\n2\n3\n")
    assert dd.count_rows(f) == 3
    g = tmp_path / "b.csv"
    g.write_text("h\n")
    assert dd.count_rows(g) == 0


def test_lfs_pointer_and_tiny_files_are_rejected(tmp_path: Path) -> None:
    (tmp_path / "AddrAddr_edgelist.csv").write_text("version https://git-lfs.github.com/spec/v1\noid sha256:ab\nsize 9\n")
    rep = dd.verify_raw(tmp_path)
    assert not rep["ok"] and rep["lfs_pointers"] == ["AddrAddr_edgelist.csv"]
    assert any("not real data" in p or "git-lfs" in p.lower() for p in rep["problems"])


def test_missing_files_reported(tmp_path: Path) -> None:
    rep = dd.verify_raw(tmp_path)
    assert not rep["ok"]
    assert any("AddrAddr_edgelist.csv missing" in p for p in rep["problems"])


def test_row_count_mismatch_is_reported_not_hidden(tmp_path: Path, small_thresholds: None) -> None:
    make_fixture(tmp_path, n_wallets=300, layout="combined")
    rep = dd.verify_raw(tmp_path)
    assert rep["ok"]  # real-looking, but the counts are those of a 300-wallet fixture, not Elliptic++
    assert len(rep["mismatches"]) == 2
    assert any(m.startswith("edges: found") for m in rep["mismatches"])
    assert any(m.startswith("feature rows: found") for m in rep["mismatches"])


def test_matching_counts_have_no_mismatch(tmp_path: Path, small_thresholds: None, monkeypatch: pytest.MonkeyPatch) -> None:
    info = make_fixture(tmp_path, n_wallets=300, layout="combined")
    monkeypatch.setitem(dd.EXPECTED, "edges", info["edges"])
    monkeypatch.setitem(dd.EXPECTED, "feature_rows", info["feature_rows"])
    assert dd.verify_raw(tmp_path)["mismatches"] == []
