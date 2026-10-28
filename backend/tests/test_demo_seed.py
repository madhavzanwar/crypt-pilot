from app.core import store
from app.ingest import seed
from app.models import AccountRow, TransactionRow


def test_wiped_demo_persona_is_reseeded_on_request(monkeypatch):
    seed.seed_if_empty()
    store.delete_where(AccountRow, user_id="demo-meera")
    store.delete_where(TransactionRow, user_id="demo-meera")
    monkeypatch.setattr(seed, "_checked_at", 0.0)  # the 30 s throttle must not hide the wipe
    seed.ensure_demo_seeded()
    assert store.first(AccountRow, user_id="demo-meera") is not None
    assert len(store.query(TransactionRow, user_id="demo-meera")) > 100
