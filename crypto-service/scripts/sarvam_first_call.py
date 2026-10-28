"""First Sarvam call: text to speech (Hindi), saved to artifacts/sarvam_hello.wav. Key comes from SARVAM_API_KEY (.env).
The SDK is not an app dependency (the app talks to the REST API with httpx), so run:
  uv run --with sarvamai python -m scripts.sarvam_first_call
"""

from __future__ import annotations

import base64
from pathlib import Path

from sarvamai import SarvamAI

from app.config import get_settings

OUT = Path("artifacts/sarvam_hello.wav")


def main() -> None:
    key = get_settings().sarvam_api_key.get_secret_value()
    if not key:
        raise SystemExit("SARVAM_API_KEY is not set (backend/.env)")
    client = SarvamAI(api_subscription_key=key)
    res = client.text_to_speech.convert(text="नमस्ते, यह क्रिप्टिक है।", language_code="hi-IN",
                                        model="bulbul:v4-flash")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(base64.b64decode(res.audios[0]))
    print(f"request_id={res.request_id} audios={len(res.audios)} saved={OUT} bytes={OUT.stat().st_size}")


if __name__ == "__main__":
    main()
