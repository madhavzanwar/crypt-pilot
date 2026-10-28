"""Voice agent: only real pages and visible controls survive; model failure hands over to the Copilot."""
from app.api import voice_router as v


def _screen():
    return v.Screen(controls=[v.Control(id=1, label="Add goal")])


def test_actions_filtered_to_real_targets():
    plan = {"say": "ok", "actions": [{"type": "navigate", "path": "/evil"}, {"type": "navigate", "path": "/goals"}, {"type": "click", "id": 9},
                                     {"type": "click", "id": 1}, {"type": "scroll", "to": "top"}, {"type": "drop"}]}
    out = v._clean(plan, _screen())
    assert [(a["type"], a.get("path") or a.get("id") or a.get("to")) for a in out["actions"]] == [("navigate", "/goals"), ("click", 1), ("scroll", "top")]
    assert out["actions"][1]["label"] == "Add goal"


def test_model_failure_falls_back_to_copilot(monkeypatch):
    from app.copilot import nvidia
    def boom(*a): raise RuntimeError("busy")
    monkeypatch.setattr(nvidia, "complete_json", boom)
    out = v.act(v.Act(text="hello", path="/dashboard"))
    assert out["ask_copilot"] and out["actions"] == [] and out["say"] == ""
