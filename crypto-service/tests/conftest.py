from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None,  # type: ignore[call-arg]
        app_env="test",
        database_url=f"sqlite:///{tmp_path}/test.sqlite",
        data_dir=tmp_path / "data",
        artifacts_dir=tmp_path / "artifacts",
        ofac_list_path=tmp_path / "data/labels/ofac_btc.txt",
        cors_origins="http://localhost:3000",
        graph_engine="networkx",
        demo_mode=True,
        session_secret="test-secret",
        log_salt="test-salt",
        admin_token="admin-test-token",
    )


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    from app.main import build_state, create_app

    app = create_app(settings, build_state(settings))
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def trained(tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, Path]:
    """(processed_dir, artifacts_dir) for a synthetic dataset with trained models."""
    from tests.helpers import build_trained_fixture

    return build_trained_fixture(tmp_path_factory.mktemp("trained"))
