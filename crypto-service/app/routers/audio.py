from __future__ import annotations

import os
import re

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse, Response

from app.deps import get_state
from app.errors import ApiError
from app.state import AppState

router = APIRouter()
_NAME = re.compile(r"^[0-9a-f]{32}\.mp3$")


@router.api_route("/api/audio/{name}", methods=["GET", "HEAD"], response_class=FileResponse)
async def audio(name: str, request: Request, state: AppState = Depends(get_state)) -> Response:
    if not _NAME.match(name):
        raise ApiError(404, "not_found")
    path = state.settings.artifacts_dir / "audio" / name
    if not path.exists():
        raise ApiError(404, "not_found")
    resp = FileResponse(path, media_type="audio/mpeg", headers={"cache-control": "public, max-age=86400"})
    resp.set_stat_headers(os.stat(path))
    etag = resp.headers.get("etag", "")
    tokens = {t.strip().removeprefix("W/") for t in request.headers.get("if-none-match", "").split(",")}
    if etag and (etag in tokens or "*" in tokens):  # Starlette serves Range but not conditional GETs itself
        return Response(status_code=304, headers={k: v for k, v in resp.headers.items()
                                                  if k in ("etag", "cache-control", "last-modified")})
    return resp
