"""The per-IP free-grant cap must not turn a shared loopback/private peer into one bucket for every visitor."""

from types import SimpleNamespace

from app.services.billing.ledger import _ip_identifies_visitor


def test_cap_skipped_when_ip_does_not_identify_visitor() -> None:
    untrusted = SimpleNamespace(trust_proxy=False)
    trusted = SimpleNamespace(trust_proxy=True)
    assert not _ip_identifies_visitor("127.0.0.1", untrusted)
    assert not _ip_identifies_visitor("10.1.2.3", untrusted)
    assert not _ip_identifies_visitor(None, untrusted)
    assert not _ip_identifies_visitor("not-an-ip", untrusted)
    assert _ip_identifies_visitor("8.8.8.8", untrusted)  # a real public peer
    assert _ip_identifies_visitor("127.0.0.1", trusted)  # trusted proxy: the forwarded IP is the visitor
