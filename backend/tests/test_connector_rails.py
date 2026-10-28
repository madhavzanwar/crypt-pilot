"""Payment rails (Dodo, Cake Wallet) replace Google Pay in the connector catalogue; they never touch user data."""
from fastapi.testclient import TestClient

from app.api import connectors_router as cr
from app.main import app


def test_catalogue_has_rails_and_no_google_pay():
    assert "google_pay" not in cr.CATALOG
    assert {"dodo", "cake_wallet"} <= set(cr.CATALOG)
    for other in ("bank", "google_sheets", "invoices", "investments", "plaid"):
        assert other in cr.CATALOG


def test_list_shows_rails_connected_and_hides_google_pay():
    c = TestClient(app)
    rows = {r["id"]: r for r in c.get("/api/connectors/demo-priya").json()}
    assert "google_pay" not in rows
    for rid in ("dodo", "cake_wallet"):
        assert rows[rid]["available"] is True and rows[rid]["connected"] is True and rows[rid]["detail"]


def test_rail_connect_disconnect_is_a_noop_for_the_ledger():
    from app.core import store
    from app.ingest.seed import seed_all
    from app.models import TransactionRow

    seed_all()
    c = TestClient(app)
    before = len(store.query(TransactionRow, user_id="demo-priya"))
    assert c.post("/api/connectors/demo-priya/dodo/connect", json={}).json()["rail"] is True
    assert c.delete("/api/connectors/demo-priya/cake_wallet").status_code == 204
    assert c.get("/api/connectors/demo-priya/dodo/export").status_code == 409
    assert len(store.query(TransactionRow, user_id="demo-priya")) == before
