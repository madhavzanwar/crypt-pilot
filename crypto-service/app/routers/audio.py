from __future__ import annotations

import re

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse

from app.deps import get_state
from app.errors import ApiError
from app.state import AppState

router = APIRouter()
_NAME = re.compile(r"^[0-9a-f]{32}\.mp3$")


@router.get("/api/audio/{name}", response_class=FileResponse)
async def audio(name: str, state: AppState = Depends(get_state)) -> FileResponse:
    if not _NAME.match(name):
        raise ApiError(404, "not_found")
    path = state.settings.artifacts_dir / "audio" / name
    if not path.exists():
        raise ApiError(404, "not_found")
    return FileResponse(path, media_type="audio/mpeg", headers={"cache-control": "public, max-age=86400"})
