"""Write ../docs/openapi.json from the FastAPI app (response models = the contract)."""

from __future__ import annotations

import json
from pathlib import Path

from app.config import Settings
from app.main import create_app


def main() -> None:
    app = create_app(Settings(_env_file=None, app_env="test"))  # type: ignore[call-arg]
    out = Path(__file__).resolve().parents[2] / "docs" / "openapi.json"
    out.write_text(json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
