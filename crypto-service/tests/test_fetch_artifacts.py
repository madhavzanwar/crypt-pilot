from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from scripts.fetch_artifacts import FetchError, fetch, safe_dest

BASE = "https://hub.test"
FILES = {
    "data/labels/ofac_btc.txt": b"1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa\n",
    "artifacts/model_card.json": b'{"servingModel": "baseline"}',
    "artifacts/replay/x__en.json": b"{}",
    "README.md": b"not allowed",              # outside the allowlist
    "src/evil.py": b"not allowed",
}


def make_client(seen_auth: list[str], tree_override: list[dict] | None = None) -> httpx.Client:  # type: ignore[type-arg]
    def handler(req: httpx.Request) -> httpx.Response:
        seen_auth.append(req.headers.get("authorization", ""))
        if req.url.path == "/api/datasets/me/priv/tree/main":
            tree = tree_override if tree_override is not None else [
                {"type": "file", "path": p, "size": len(b)} for p, b in FILES.items()] + [
                {"type": "directory", "path": "data"}]
            return httpx.Response(200, json=tree)
        prefix = "/datasets/me/priv/resolve/main/"
        if req.url.path.startswith(prefix):
            return httpx.Response(200, content=FILES[req.url.path[len(prefix):]])
        return httpx.Response(404)

    return httpx.Client(transport=httpx.MockTransport(handler), headers={"authorization": "Bearer TEST-TOKEN"})


def test_downloads_only_allowlisted_paths_and_is_resumable(tmp_path: Path) -> None:
    seen: list[str] = []
    with make_client(seen) as c:
        first = fetch(tmp_path, c, BASE, "dataset", "me/priv", "main", 10_000)
        second = fetch(tmp_path, c, BASE, "dataset", "me/priv", "main", 10_000)
    assert first["downloaded"] == 3 and first["ignored"] == 2
    assert second["downloaded"] == 0 and second["already_present"] == 3  # nothing re-downloaded
    assert (tmp_path / "data/labels/ofac_btc.txt").read_bytes() == FILES["data/labels/ofac_btc.txt"]
    assert not (tmp_path / "README.md").exists() and not (tmp_path / "src").exists()
    assert all(a == "Bearer TEST-TOKEN" for a in seen)
    assert not list(tmp_path.rglob("*.part"))


@pytest.mark.parametrize("bad", ["data/../../etc/passwd", "/etc/passwd", "data/../x", "artifacts/../../x", "other/x"])
def test_path_traversal_is_refused(tmp_path: Path, bad: str) -> None:
    assert safe_dest(tmp_path, bad) is None
    assert safe_dest(tmp_path, "data/a/b.parquet") == (tmp_path / "data/a/b.parquet").resolve()


def test_traversal_entry_in_listing_is_ignored(tmp_path: Path) -> None:
    tree = [{"type": "file", "path": "data/../../escape.txt", "size": 1}, {"type": "file", "path": "data/ok.txt", "size": 2}]
    FILES["data/ok.txt"] = b"ok"
    with make_client([], tree) as c:
        out = fetch(tmp_path, c, BASE, "dataset", "me/priv", "main", 10_000)
    assert out["downloaded"] == 1 and not (tmp_path.parent / "escape.txt").exists()


def test_size_cap_and_auth_errors(tmp_path: Path) -> None:
    with make_client([]) as c, pytest.raises(FetchError, match="ARTIFACTS_MAX_BYTES"):
        fetch(tmp_path, c, BASE, "dataset", "me/priv", "main", 10)
    with make_client([]) as c, pytest.raises(FetchError, match="HTTP 404"):
        fetch(tmp_path, c, BASE, "dataset", "me/missing", "main", 10_000)


def test_size_mismatch_leaves_no_file(tmp_path: Path) -> None:
    tree = [{"type": "file", "path": "data/ok.txt", "size": 999}]
    FILES["data/ok.txt"] = b"ok"
    with make_client([], tree) as c, pytest.raises(FetchError, match="size mismatch"):
        fetch(tmp_path, c, BASE, "dataset", "me/priv", "main", 10_000)
    assert not (tmp_path / "data/ok.txt").exists() and not list(tmp_path.rglob("*.part"))
