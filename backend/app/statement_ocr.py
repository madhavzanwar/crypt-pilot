"""Bank statement / passbook text -> redacted transactions. Pure text in, plain dicts out (OCR itself lives in app.ocr).

Order matters: redact() runs first, so nothing downstream (preview, database) ever sees account or identity data.
"""
from __future__ import annotations

import re
from datetime import date

# Whole lines that only carry who/where the account is; dropped, not masked.
_IDENTITY_LINE = re.compile(
    r"^\W*(?:account\s*(?:holder|name)|a/?c\s*(?:holder|name)|customer\s*(?:name|id)|cust(?:omer)?\s*id|cif|name|address|"
    r"branch|nominee|joint\s*holder|mr\.?|mrs\.?|ms\.?|shri|smt)\b.*$", re.I)

# Same for Hindi / Marathi labels (no \b: Devanagari vowel signs do not count as word characters).
_IDENTITY_LINE_DEVA = re.compile(r"^\W*(?:नाम|पता|पत्ता|खाताधारक|खातेदार|ग्राहक|शाखा|नामांकित|श्रीमती|श्री)(?=[\s:\-–]|$)")

# (kind, pattern, replacement). Most specific first so a 12-digit Aadhaar is not reported as an account number.
_MASKS: list[tuple[str, re.Pattern, str]] = [
    ("email", re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+"), "[email]"),
    ("upi_id", re.compile(r"\b[\w.-]{2,}@(?:ok\w+|ybl|ibl|axl|paytm|apl|upi|sbi|hdfcbank|icici|axisbank|oksbi)\b", re.I), "[upi-id]"),
    ("pan", re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"), "[pan]"),
    ("aadhaar", re.compile(r"\b\d{4}\s\d{4}\s\d{4}\b"), "[aadhaar]"),
    ("ifsc", re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b"), "[ifsc]"),
    ("phone", re.compile(r"(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)"), "[phone]"),
    ("account_number", re.compile(r"(?<![\d.,])(?:[Xx*]{2,}\s?)?\d{9,18}(?![\d.,])"), "[account]"),
]
_LABELLED_ACCOUNT = re.compile(r"((?:a/?c|account)\s*(?:no\.?|number|#)?\s*[:\-]?\s*)[Xx*\d][Xx*\d\s-]{5,}", re.I)


_DEVA_DIGITS = {0x966 + i: str(i) for i in range(10)}  # Hindi and Marathi share the Devanagari numerals


def redact(text: str) -> tuple[str, dict[str, int]]:
    """Return (clean text, how many of each kind were removed)."""
    text = text.translate(_DEVA_DIGITS)  # ५०,००० -> 50,000 before anything is matched
    removed: dict[str, int] = {}

    def bump(kind: str, n: int = 1) -> None:
        removed[kind] = removed.get(kind, 0) + n

    kept: list[str] = []
    for line in text.splitlines():
        if _IDENTITY_LINE.match(line.strip()) or _IDENTITY_LINE_DEVA.match(line.strip()):
            bump("identity_lines")
            continue
        line, n = _LABELLED_ACCOUNT.subn(lambda m: m.group(1) + "[account]", line)
        if n:
            bump("account_number", n)
        for kind, pat, repl in _MASKS:
            line, n = pat.subn(repl, line)
            if n:
                bump(kind, n)
        kept.append(line)
    return "\n".join(kept), removed


_MONTH_NAMES = {n: i for i, names in enumerate([
    "jan जनवरी जानेवारी", "feb फरवरी फेब्रुवारी", "mar मार्च", "apr अप्रैल एप्रिल", "may मई मे", "jun जून", "jul जुलाई जुलै",
    "aug अगस्त ऑगस्ट", "sep सितंबर सितम्बर सप्टेंबर", "oct अक्टूबर अक्तूबर ऑक्टोबर", "nov नवंबर नवम्बर नोव्हेंबर", "dec दिसंबर दिसम्बर डिसेंबर"], 1)
    for n in names.split()}
_MONTHS = "|".join(sorted(_MONTH_NAMES, key=len, reverse=True))  # longest first so 'मार्च' is not cut short
_DATE = re.compile(rf"^\W*(\d{{1,2}})[\s/.-]+(\d{{1,2}}|{_MONTHS})[\s/.-]+(\d{{4}}|\d{{2}})\b", re.I)
_AMOUNT = re.compile(r"(?<![\w.])(\d{1,3}(?:,\d{2,3})*|\d+)\.\d{2}(?!\d)")
_CREDIT_WORDS = re.compile(r"\b(?:cr|credit|salary|refund|interest|deposit|received|cashback|neft\s*cr|upi/cr)\b|जमा|वेतन|ब्याज|व्याज|वापसी|परतावा", re.I)
_DEBIT_WORDS = re.compile(r"\b(?:dr|debit|withdrawal|atm|paid|emi|charges?|upi/dr)\b|निकासी|नावे|भुगतान|शुल्क|खर्च|काढले", re.I)


def _to_date(d: str, m: str, y: str) -> date | None:
    try:
        year = int(y) + (2000 if len(y) == 2 else 0)
        month = int(m) if m.isdigit() else _MONTH_NAMES[m.lower()]
        return date(year, month, int(d))
    except ValueError:
        return None


def _num(s: str) -> float:
    return float(s.replace(",", ""))


_BALANCE_ROW = re.compile(r"^\W*(?:opening|closing|brought\s*forward|carried\s*forward|b/f|c/f|balance\b)", re.I)
_FOOTER = re.compile(r"\b(?:page\s*\d+|printed|authori[sz]ed|signatory|all amounts|computer generated)\b", re.I)


_DIRECTION_TOKEN = re.compile(r"(?<![\w/])(?:dr|cr)\.?(?![\w/])", re.I)


def clean_description(desc: str) -> str:
    """Drop standalone Dr/Cr tokens (they are direction markers, not part of the merchant name) and tidy the spaces."""
    return re.sub(r"\s+", " ", _DIRECTION_TOKEN.sub(" ", desc)).strip(" -|\t")


def parse_transactions(clean_text: str) -> list[dict]:
    """Rows like 'DATE  narration  amount  [balance]'. Wrapped narration lines are joined to the row above.

    Direction comes from the running balance when the statement has one, else Cr/Dr style words, else it is a debit.
    """
    rows: list[dict] = []
    prev_balance: float | None = None
    for raw in clean_text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if _FOOTER.search(line):
            # a footer ("Page 3 | Printed ... | Authorised Signatory") that OCR glued onto a row of a tilted photo: keep the
            # row (it starts at the last date followed by an amount), drop the footer; a pure footer line is skipped
            later = [m_ for m_ in _DATE_ANY.finditer(line) if m_.start() > 0 and _AMOUNT.search(line[m_.end():])]
            if not later:
                continue
            line = line[later[-1].start():]
        m = _DATE.match(line)
        d = _to_date(*m.groups()) if m else None
        if d is None:
            if rows and not _AMOUNT.search(line):  # continuation of a wrapped narration
                rows[-1]["description"] = f"{rows[-1]['description']} {line}"[:160]
            continue
        rest = line[m.end():]
        amounts = [m_.group(0) for m_ in _AMOUNT.finditer(rest)]
        if not amounts:
            continue
        desc = _AMOUNT.sub("", rest).strip(" -|\t")
        if _BALANCE_ROW.match(desc):  # 'Opening Balance 45,250.00' is a balance, not a transaction
            prev_balance = _num(amounts[-1])
            continue
        value = _num(amounts[-2] if len(amounts) >= 2 else amounts[0])
        balance = _num(amounts[-1]) if len(amounts) >= 2 else None
        if balance is not None and prev_balance is not None and abs(abs(balance - prev_balance) - value) < 0.02:
            sign = 1 if balance > prev_balance else -1
        elif _CREDIT_WORDS.search(desc) and not _DEBIT_WORDS.search(desc):
            sign = 1
        else:
            sign = -1
        if balance is not None:
            prev_balance = balance
        rows.append({"date": d.isoformat(), "description": clean_description(desc)[:160] or "Transaction", "amount": round(sign * value, 2), "balance": balance})
    return rows


_DATE_ANY = re.compile(_DATE.pattern.replace(r"^\W*", ""), re.I)
_TIME = re.compile(r"\d{1,2}:\d{2}(?::\d{2})?")
_PRICE = re.compile(r"(?<![\d.,])\d[\d,]*\.\d{1,2}(?!\d)")  # no \w guard: OCR often glues a misread rupee sign on, like 'र21.0'
_PAID_LINE = re.compile(r"upi\s*=|total|amount|fare|price|paid|भा[ड़डर]|एकूण|कुल|रक्कम|किराया|तिकीट\s*दर", re.I)


def parse_receipt_txn(clean_text: str) -> list[dict]:
    """One ticket or bill (no statement rows): its date, the amount paid, and a short description. [] if no amount is found.

    The amount is the last price on a line that looks like a total or fare, else the largest price on the page.
    """
    lines = [l.strip() for l in clean_text.splitlines() if l.strip()]
    when = next((d for l in lines if (m := _DATE_ANY.search(l)) and (d := _to_date(*m.groups()))), None)
    paid = [float(p.replace(",", "")) for l in lines if _PAID_LINE.search(l) for p in _PRICE.findall(l)]
    prices = [float(p.replace(",", "")) for l in lines for p in _PRICE.findall(l)]
    amount = paid[-1] if paid else max(prices, default=0.0)
    if amount <= 0:
        return []
    desc = next((t for l in lines if re.search(r"[A-Za-zऀ-ॿ]{3}", t := _TIME.sub("", _DATE_ANY.sub("", l)).strip(" :-|")) and not re.search(r"\d{4,}|upi", t, re.I) and not _PRICE.search(t)), "Receipt")
    return [{"date": (when or date.today()).isoformat(), "description": desc[:160], "amount": -round(amount, 2), "balance": None}]
