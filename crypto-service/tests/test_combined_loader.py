"""Combined-file layout (Hugging Face mirror) and Git-LFS pointer detection."""

from __future__ import annotations

import shutil
from pathlib import Path

import pandas as pd
import pytest

from app.services.datasets.processing import (
    COMBINED_FILE,
    ConflictingClassesError,
    build_wallets,
    detect_lfs_pointers,
    lfs_pointer_message,
    read_raw,
)
from scripts.build_processed import build
from scripts.make_fixture import make_fixture

LFS_POINTER = "version https://git-lfs.github.com/spec/v1\noid sha256:" + "ab" * 32 + "\nsize 628000000\n"


@pytest.fixture(scope="module")
def layouts(tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, Path]:
    root = tmp_path_factory.mktemp("layouts")
    default, combined = root / "default", root / "combined"
    a = make_fixture(default, n_wallets=300, seed=11)
    b = make_fixture(combined, n_wallets=300, seed=11, layout="combined")
    assert a == b
    return default, combined


def test_combined_layout_writes_only_combined_and_edges(layouts: tuple[Path, Path]) -> None:
    _, combined = layouts
    assert sorted(p.name for p in combined.iterdir()) == ["AddrAddr_edgelist.csv", COMBINED_FILE]


def test_both_layouts_yield_identical_wallets(layouts: tuple[Path, Path]) -> None:
    default, combined = layouts
    f1, c1, e1 = read_raw(default)
    f2, c2, e2 = read_raw(combined)
    assert "class" not in f2.columns
    pd.testing.assert_frame_equal(f1, f2)
    pd.testing.assert_frame_equal(c1, c2)
    pd.testing.assert_frame_equal(e1, e2)
    pd.testing.assert_frame_equal(build_wallets(f1, c1), build_wallets(f2, c2))


def test_features_file_preferred_next_to_combined(layouts: tuple[Path, Path], tmp_path: Path) -> None:
    default, combined = layouts
    shutil.copy(combined / COMBINED_FILE, tmp_path / COMBINED_FILE)
    shutil.copy(default / "wallets_features.csv", tmp_path / "wallets_features.csv")
    shutil.copy(default / "AddrAddr_edgelist.csv", tmp_path / "AddrAddr_edgelist.csv")
    f_both, c_both, _ = read_raw(tmp_path)
    f_def, c_def, _ = read_raw(default)
    pd.testing.assert_frame_equal(f_both, f_def)
    pd.testing.assert_frame_equal(c_both, c_def)


def test_classes_file_without_features_file_is_an_error(layouts: tuple[Path, Path], tmp_path: Path) -> None:
    default, combined = layouts
    shutil.copy(default / "wallets_classes.csv", tmp_path / "wallets_classes.csv")
    shutil.copy(combined / COMBINED_FILE, tmp_path / COMBINED_FILE)
    shutil.copy(default / "AddrAddr_edgelist.csv", tmp_path / "AddrAddr_edgelist.csv")
    with pytest.raises(FileNotFoundError, match=r"wallets_features\.csv"):
        read_raw(tmp_path)


def test_conflicting_classes_raise_with_examples(layouts: tuple[Path, Path], tmp_path: Path) -> None:
    _, combined = layouts
    df = pd.read_csv(combined / COMBINED_FILE)
    victims = df["address"].drop_duplicates().iloc[:7]
    # give each victim a second row with a different class
    extra = df[df["address"].isin(victims)].drop_duplicates("address").copy()
    extra["class"] = extra["class"] % 3 + 1
    pd.concat([df, extra], ignore_index=True).to_csv(tmp_path / COMBINED_FILE, index=False)
    shutil.copy(combined / "AddrAddr_edgelist.csv", tmp_path / "AddrAddr_edgelist.csv")
    with pytest.raises(ConflictingClassesError, match=r"7 address\(es\) have conflicting classes") as exc:
        read_raw(tmp_path)
    msg = str(exc.value)
    assert victims.iloc[0] in msg
    assert msg.count("DEMO-w") == 5  # only a few examples listed


def test_missing_classes_everywhere_is_clear(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match=r"wallets_features_classes_combined\.csv"):
        read_raw(tmp_path)


def test_detect_lfs_pointers(tmp_path: Path) -> None:
    assert detect_lfs_pointers(tmp_path) == []
    assert detect_lfs_pointers(tmp_path / "nope") == []
    (tmp_path / "wallets_features.csv").write_text(LFS_POINTER)
    (tmp_path / "AddrAddr_edgelist.csv").write_text("input_address,output_address\na,b\n")
    (tmp_path / "empty.csv").write_text("")
    found = detect_lfs_pointers(tmp_path)
    assert found == [tmp_path / "wallets_features.csv"]
    msg = lfs_pointer_message(found)
    assert "wallets_features.csv" in msg and "huggingface.co/datasets/AI4FinTech/ellipticpp" in msg
    assert "Google Drive" in msg


def test_build_exits_clearly_on_lfs_pointer(tmp_path: Path) -> None:
    (tmp_path / "wallets_features.csv").write_text(LFS_POINTER)
    with pytest.raises(SystemExit, match="Git-LFS pointer"):
        build(tmp_path, tmp_path / "out", "elliptic++")


def test_combined_layout_end_to_end(layouts: tuple[Path, Path], tmp_path: Path) -> None:
    default, combined = layouts
    m_default = build(default, tmp_path / "p_default", "synthetic_fixture")
    m_combined = build(combined, tmp_path / "p_combined", "synthetic_fixture")
    for key in ("source", "wallets", "label_counts", "edges", "split_counts", "split_label_counts"):
        assert m_combined[key] == m_default[key], key
    assert m_combined["source"] == "synthetic_fixture"
    for name in ("wallets", "edges", "splits", "graph_features"):
        pd.testing.assert_frame_equal(
            pd.read_parquet(tmp_path / "p_default" / f"{name}.parquet"),
            pd.read_parquet(tmp_path / "p_combined" / f"{name}.parquet"),
        )
