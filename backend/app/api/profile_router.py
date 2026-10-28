"""Onboarding questionnaire: questions by depth, and each user's saved answers."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import profile
from app.core import store
from app.core.auth import resolve_user_id
from app.models import ProfileRow

router = APIRouter(prefix="/api/profile", tags=["profile"])


class ProfileBody(BaseModel):
    level: str  # basic | standard | deep | skipped
    answers: dict[str, str] = {}


def _out(row: ProfileRow | None) -> dict:
    return {"completed": row is not None, "level": row.level if row else None,
            "answers": json.loads(row.answers) if row else {}}


@router.get("/questions")
def get_questions() -> dict:
    return profile.all_questions()


@router.get("/{user_id}")
def get_profile(user_id: str = Depends(resolve_user_id)) -> dict:
    return _out(store.get(ProfileRow, user_id))


@router.put("/{user_id}")
def put_profile(body: ProfileBody, user_id: str = Depends(resolve_user_id)) -> dict:
    if body.level != "skipped" and body.level not in profile.LEVELS:
        raise HTTPException(422, "Unknown level")
    allowed = {q["id"] for q in profile.questions(body.level)} if body.level != "skipped" else set()
    answers = {k: v.strip()[:500] for k, v in body.answers.items() if k in allowed and v.strip()}
    if body.level != "skipped":
        answers = {**json.loads((store.get(ProfileRow, user_id) or ProfileRow(id=user_id, user_id=user_id)).answers), **answers}
    row = ProfileRow(id=user_id, user_id=user_id, level=body.level, answers=json.dumps(answers))
    store.put(row)
    return _out(row)
