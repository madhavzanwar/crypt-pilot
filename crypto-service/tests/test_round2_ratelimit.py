"""BUG-038: client-IP resolution with CRYPTO_TRUST_PROXY on/off (a loopback caller cannot pick its own bucket
unless the operator declared the proxy trusted)."""

from __future__ import annotations

from typing import Any

import pytest
from starlette.requests import Request

from app.config import Settings
from app.ratelimit import resolve_client_ip


def _req(xff: str | None, peer: str = "127.0.0.1", extra: dict[str, str] | None = None) -> Request:
    headers = [(b"x-forwarded-for", xff.encode())] if xff is not None else []
    headers += [(k.encode(), v.encode()) for k, v in (extra or {}).items()]
    return Request({"type": "http", "headers": headers, "client": (peer, 1234), "method": "GET", "path": "/",
                    "query_string": b"", "scheme": "http", "server": ("t", 80)})


def _st(**kw: Any) -> Settings:
    return Settings(_env_file=None, app_env="test", **kw)  # type: ignore[call-arg]


def test_proxy_off_ignores_forwarded_for() -> None:
    st = _st()
    assert resolve_client_ip(_req("1.2.3.4"), st) == "127.0.0.1"
    assert resolve_client_ip(_req("9.9.9.9, 1.2.3.4"), st) == "127.0.0.1"


def test_proxy_on_uses_rightmost_hop_not_client_supplied_first_entry() -> None:
    st = _st(trust_proxy=True)
    assert resolve_client_ip(_req("6.6.6.6, 1.2.3.4"), st) == "1.2.3.4"  # client sent 6.6.6.6, bridge appended 1.2.3.4
    assert resolve_client_ip(_req(None), st) == "127.0.0.1"  # no header (e.g. council calls): loopback bucket
    assert resolve_client_ip(_req("6.6.6.6, 5.5.5.5, 1.2.3.4"), _st(trust_proxy=True, trusted_proxy_hops=2)) == "5.5.5.5"


@pytest.mark.parametrize("on", [False, True])
def test_fly_header_only_when_enabled(on: bool) -> None:
    st = _st(trust_fly_client_ip=on)
    got = resolve_client_ip(_req(None, extra={"fly-client-ip": "8.8.8.8"}), st)
    assert got == ("8.8.8.8" if on else "127.0.0.1")
