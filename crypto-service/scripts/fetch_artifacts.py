"""Fetch data/ and artifacts/ from a PRIVATE Hugging Face repo into the working directory at container start.

Why: free hosts have no persistent volume, and the Elliptic++ data and derived tables must never be baked
into an image or put in a public repo (the dataset has no stated licence). Keep them in a PRIVATE repo and
give the host a read-only token as a secret.

Env:  ARTIFACTS_REPO   e.g. "yourname/cryptiq-artifacts"   (required)
      HF_TOKEN         read token for that repo (secret; never logged)
      ARTIFACTS_REPO_TYPE  dataset | model | space  (default dataset)
      ARTIFACTS_REVISION   default main
      ARTIFACTS_MAX_BYTES  safety cap on the total download (default 3 GB)
      HF_ENDPOINT          default https://huggingface.co

Repo layout mirrors the backend folder: data/processed/*.parquet, data/labels/ofac_btc.txt,
artifacts/model.joblib, artifacts/model_card.json, artifacts/demo_wallets.json, artifacts/replay/*.json.
NOTE: model.joblib is a pickle: only ever fetch it from a repo you control.

The Hugging Face endpoints used (GET /api/{type}s/{repo}/tree/{rev}?recursive=true and
GET /{type}s/{repo}/resolve/{rev}/{path}) are written from the public API shape and have NOT been exercised
against the live service from the development sandbox (host blocked); the request/response handling is tested
with a mocked transport.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path, PurePosixPath

import httpx

ALLOWED_PREFIXES = ("data/", "artifacts/")
DEFAULT_MAX_BYTES = 3 * 1024**3


class FetchError(Exception):
    pass


def safe_dest(root: Path, repo_path: str) -> Path | None:
    """Destination for a repo file, or None if it is outside the allowlist or tries to escape `root`."""
    p = PurePosixPath(repo_path)
    if p.is_absolute() or ".." in p.parts or not repo_path.startswith(ALLOWED_PREFIXES):
        return None
    dest = (root / Path(*p.parts)).resolve()
    return dest if root.resolve() in dest.parents else None


def list_files(client: httpx.Client, base: str, rtype: str, repo: str, rev: str) -> list[dict[str, object]]:
    url: str | None = f"{base}/api/{rtype}s/{repo}/tree/{rev}?recursive=true"
    out: list[dict[str, object]] = []
    while url:
        r = client.get(url)
        if r.status_code in (401, 403, 404):
            raise FetchError(f"cannot list {rtype} repo (HTTP {r.status_code}): check ARTIFACTS_REPO and HF_TOKEN")
        r.raise_for_status()
        out += [e for e in r.json() if e.get("type") == "file"]
        url = r.links.get("next", {}).get("url")
    return out


def fetch(root: Path, client: httpx.Client, base: str, rtype: str, repo: str, rev: str, max_bytes: int
          ) -> dict[str, int]:
    files = list_files(client, base, rtype, repo, rev)
    wanted = [(str(f["path"]), int(f.get("size") or 0)) for f in files if str(f["path"]).startswith(ALLOWED_PREFIXES)]
    total = sum(s for _, s in wanted)
    if total > max_bytes:
        raise FetchError(f"repo content is {total} bytes, above ARTIFACTS_MAX_BYTES={max_bytes}")
    done = skipped = ignored = 0
    ignored = len(files) - len(wanted)
    for path, size in wanted:
        dest = safe_dest(root, path)
        if dest is None:
            ignored += 1
            continue
        if dest.exists() and size and dest.stat().st_size == size:
            skipped += 1
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix(dest.suffix + ".part")
        with client.stream("GET", f"{base}/{rtype}s/{repo}/resolve/{rev}/{path}", follow_redirects=True) as r:
            r.raise_for_status()
            with tmp.open("wb") as f:
                for chunk in r.iter_bytes():
                    f.write(chunk)
        if size and tmp.stat().st_size != size:
            tmp.unlink(missing_ok=True)
            raise FetchError(f"size mismatch for {path}")
        tmp.replace(dest)
        done += 1
    return {"downloaded": done, "already_present": skipped, "ignored": ignored, "bytes_total": total}


def main() -> None:
    repo = os.environ.get("ARTIFACTS_REPO", "")
    if not repo:
        sys.exit("ARTIFACTS_REPO is not set")
    token = os.environ.get("HF_TOKEN", "")
    headers = {"authorization": f"Bearer {token}"} if token else {}
    base = os.environ.get("HF_ENDPOINT", "https://huggingface.co").rstrip("/")
    with httpx.Client(headers=headers, timeout=httpx.Timeout(60.0, connect=10.0)) as client:
        try:
            summary = fetch(Path.cwd(), client, base, os.environ.get("ARTIFACTS_REPO_TYPE", "dataset"), repo,
                            os.environ.get("ARTIFACTS_REVISION", "main"),
                            int(os.environ.get("ARTIFACTS_MAX_BYTES", DEFAULT_MAX_BYTES)))
        except (FetchError, httpx.HTTPError) as exc:
            sys.exit(f"fetch_artifacts failed: {type(exc).__name__}: {str(exc)[:200]}")  # no URL, no token
    print(f"fetch_artifacts: {summary}")


if __name__ == "__main__":
    main()
