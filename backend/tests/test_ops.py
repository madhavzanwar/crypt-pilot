from app import telemetry
from app.api import ops_router


def test_outage_then_recovery_events(monkeypatch, tmp_path):
    monkeypatch.setattr(telemetry, "_FILE", tmp_path / "t.jsonl")
    telemetry._up.pop("zz", None)
    telemetry.record(kind="call", provider="zz", ok=False, error="ConnectError")
    telemetry.record(kind="call", provider="zz", ok=True)
    kinds = [e["kind"] for e in telemetry.events(10)][::-1]
    assert kinds[-4:] == ["call", "outage", "call", "recovery"]
    assert telemetry.provider_state()["zz"] is True


def test_runs_group_stages_by_run_id():
    ev = [{"kind": "stage", "run": "r1", "agent": "a", "step": "agent", "ms": 5, "findings": 2, "ts": "t2"},
          {"kind": "run", "run": "r1", "via": "stream", "parts": 9, "ts": "t1"}]  # newest first, like telemetry.events()
    run = ops_router._runs(ev)[0]
    assert run["parts"] == 9 and run["stages"][0]["findings"] == 2


def test_probe_rejects_unknown_key():
    import pytest
    from fastapi import HTTPException
    with pytest.raises(HTTPException):
        ops_router.probe("NOT_A_KEY")
