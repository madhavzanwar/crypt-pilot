"""store.query results are cached, but a write (or a caller editing a row) must never leave stale data."""
from app.core import store
from app.models import GoalRow, AuditLogRow


def _goal(uid, name):
    return GoalRow(user_id=uid, name=name, target_amount=100.0, target_date="2030-01-01")


def test_write_invalidates_cached_reads():
    uid = "cache-test-1"
    store.delete_where(GoalRow, user_id=uid)
    assert store.query(GoalRow, user_id=uid) == []
    store.put(_goal(uid, "a"))
    assert [g.name for g in store.query(GoalRow, user_id=uid)] == ["a"]
    store.delete_where(GoalRow, user_id=uid)
    assert store.query(GoalRow, user_id=uid) == []


def test_cached_rows_are_copies():
    uid = "cache-test-2"
    store.put(_goal(uid, "orig"))
    try:
        store.query(GoalRow, user_id=uid)[0].name = "mutated"
        assert store.query(GoalRow, user_id=uid)[0].name == "orig"
    finally:
        store.delete_where(GoalRow, user_id=uid)


def test_second_read_does_not_hit_firestore(monkeypatch):
    uid = "cache-test-3"
    store.query(GoalRow, user_id=uid)
    monkeypatch.setattr(store, "_q", lambda *a, **k: (_ for _ in ()).throw(AssertionError("went to Firestore")))
    assert store.query(GoalRow, user_id=uid) == []


def test_log_tables_are_always_read_live():
    assert AuditLogRow.__tablename__ in store._QUIET


def test_put_writes_through_and_only_invalidates_its_own_table(monkeypatch):
    uid = "cache-test-4"
    store.query(GoalRow, user_id=uid)  # warm
    store.query(GoalRow, user_id="someone-else")
    store.put(_goal(uid, "fresh"))
    try:
        monkeypatch.setattr(store, "_q", lambda *a, **k: (_ for _ in ()).throw(AssertionError("went to Firestore")))
        assert [g.name for g in store.query(GoalRow, user_id=uid)] == ["fresh"]  # patched in, no refetch
        assert store.query(GoalRow, user_id="someone-else") == []  # filter respected
    finally:
        monkeypatch.undo()
        store.delete_where(GoalRow, user_id=uid)


def test_live_version_changes_on_write_without_firestore():
    from app.models import AccountRow

    before = store.live_version("live-user")
    store.put(AccountRow(id="live-acc", user_id="live-user", name="x", type="checking", balance=1.0))
    assert store.live_version("live-user") != before
