"""AA 'deposit' FI JSON -> our AccountRow / TransactionRow."""
from __future__ import annotations

from datetime import date

from app.aa import AAError
from app.ingest.categorize import categorize
from app.models import AccountRow, TransactionRow


def _merchant(narration: str) -> str:
    # UPI narrations look like UPI/<merchant>/<ref>; anything else keeps its first words
    parts = [p.strip() for p in narration.split("/")]
    if len(parts) >= 4 and parts[0].upper() == "UPI" and parts[1].upper() in ("CR", "DR") and parts[3]:
        name = parts[3]  # real banks: UPI/CR/<ref>/<counterparty>/<bank>/<id>
    else:
        name = parts[1] if len(parts) >= 3 and parts[0].upper() == "UPI" and parts[1] else narration
    return name[:60] or "Unknown"


def to_rows(user_id: str, fi: dict) -> tuple[list[AccountRow], list[TransactionRow]]:
    accounts: list[AccountRow] = []
    txns: list[TransactionRow] = []
    for item in fi.get("accounts", []):
        d = item.get("data") or {}
        if d.get("type") != "deposit":
            continue
        try:
            acc_id = f"{user_id}-aa-{item['linkedAccRef']}"
            summary = d["summary"]
            kind = "savings" if str(summary.get("type", "")).upper() == "SAVINGS" else "checking"
            holder = d["profile"]["holders"]["holder"]["name"]
            accounts.append(AccountRow(id=acc_id, user_id=user_id, name=f"{holder} {kind.title()} {d['maskedAccNumber'][-4:]}",
                                       type=kind, balance=float(summary["currentBalance"])))
            for t in d["transactions"]["transaction"]:
                amount = float(t["amount"]) * (1 if t["type"] == "CREDIT" else -1)
                merchant = _merchant(t["narration"])
                txns.append(TransactionRow(
                    id=f"{user_id}-aa-{t['txnId']}", user_id=user_id, account_id=acc_id, date=date.fromisoformat(t["valueDate"][:10]),
                    amount=amount, merchant=merchant, category=categorize(merchant, amount).value, description=t["narration"]))
        except (KeyError, ValueError, TypeError) as exc:
            raise AAError("The bank sent data in an unexpected format.", 502) from exc
    return accounts, txns
