"""Builds docs/FinPilot_Feature_Guide.html (inline SVG diagrams); render to PDF with Edge headless (see run line at the bottom)."""
from __future__ import annotations

import html
import subprocess
from pathlib import Path

HERE = Path(__file__).parent
PAL = {"blue": "#e8f0fe", "green": "#e6f4ea", "amber": "#fef7e0", "rose": "#fce8e6", "violet": "#f3e8fd", "grey": "#f1f3f4", "lime": "#eef9c9"}
STROKE = {"blue": "#1a73e8", "green": "#188038", "amber": "#b06000", "rose": "#c5221f", "violet": "#8430ce", "grey": "#5f6368", "lime": "#6b8e00"}


def esc(s: str) -> str:
    return html.escape(s, quote=False)


def box(x, y, w, h, title, sub="", c="blue"):
    t = f'<text x="{x + w / 2}" y="{y + (h / 2 - 3 if sub else h / 2 + 4)}" text-anchor="middle" class="bt">{esc(title)}</text>'
    if sub:
        lines = sub.split("\n")
        t += "".join(f'<text x="{x + w / 2}" y="{y + h / 2 + 11 + i * 11}" text-anchor="middle" class="bs">{esc(l)}</text>' for i, l in enumerate(lines))
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="9" fill="{PAL[c]}" stroke="{STROKE[c]}" stroke-width="1.2"/>{t}'


def arrow(x1, y1, x2, y2, label="", dash=False):
    d = ' stroke-dasharray="4 3"' if dash else ""
    s = f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#5f6368" stroke-width="1.4" marker-end="url(#ah)"{d}/>'
    if label:
        s += f'<text x="{(x1 + x2) / 2}" y="{(y1 + y2) / 2 - 4}" text-anchor="middle" class="al">{esc(label)}</text>'
    return s


def svg(w, h, body):
    return (f'<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" class="diagram"><defs><marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">'
            f'<path d="M0,0 L8,4 L0,8 z" fill="#5f6368"/></marker></defs>{body}</svg>')


def chain(nodes, per_row=4, bw=150, bh=58, gap=34):
    """Boxes left to right, wrapping into rows; arrows between neighbours, elbow at each wrap."""
    rows = [nodes[i:i + per_row] for i in range(0, len(nodes), per_row)]
    W = per_row * bw + (per_row - 1) * gap + 20
    H = len(rows) * (bh + 40) + 10
    out, pos = "", []
    for r, row in enumerate(rows):
        for i, (t, s, c) in enumerate(row):
            x, y = 10 + i * (bw + gap), 10 + r * (bh + 40)
            out += box(x, y, bw, bh, t, s, c)
            pos.append((x, y))
    for k in range(len(pos) - 1):
        (x1, y1), (x2, y2) = pos[k], pos[k + 1]
        if y1 == y2:
            out += arrow(x1 + bw, y1 + bh / 2, x2, y2 + bh / 2)
        else:
            ym = y1 + bh + 20
            out += (f'<polyline points="{x1 + bw / 2},{y1 + bh} {x1 + bw / 2},{ym} {x2 + bw / 2},{ym} {x2 + bw / 2},{y2}" fill="none" stroke="#5f6368" stroke-width="1.4" marker-end="url(#ah)"/>')
    return svg(W, H, out)


def sequence(actors, msgs, w=760):
    n = len(actors)
    colw = (w - 20) / n
    xs = [10 + colw * (i + 0.5) for i in range(n)]
    h = 60 + len(msgs) * 34
    out = ""
    for (name, c), x in zip(actors, xs):
        out += box(x - 62, 6, 124, 30, name, "", c)
        out += f'<line x1="{x}" y1="36" x2="{x}" y2="{h - 6}" stroke="#bdc1c6" stroke-dasharray="3 3"/>'
    for i, (a, b, text, dash) in enumerate(msgs):
        y = 62 + i * 34
        x1, x2 = xs[a], xs[b]
        out += arrow(x1, y, x2, y, dash=dash)
        out += f'<text x="{(x1 + x2) / 2}" y="{y - 5}" text-anchor="middle" class="al">{esc(text)}</text>'
    return svg(w, h, out)


# ------------------------------------------------------------------ diagrams
D_ARCH = svg(780, 400, "".join([
    box(10, 10, 230, 70, "Laptop browser", "FinPilot web app (Next.js 16)\nDashboard, Transactions, Forecast, Connect", "blue"),
    box(10, 110, 230, 70, "Phone (USB)", "FinPilot Pay: installable web app (PWA)\nlocalhost via adb reverse", "blue"),
    box(300, 50, 200, 90, "Next.js 16 / React 19", "App Router, Tailwind 4, Recharts\nInngest route /api/inngest", "lime"),
    box(300, 190, 200, 90, "FastAPI backend", "Pydantic 2, pandas, numpy\nrouters per feature", "green"),
    box(560, 10, 210, 56, "Firebase Auth", "Google, email, TOTP MFA, phone OTP", "amber"),
    box(560, 80, 210, 56, "Firestore", "ledger, reviews, pairs, profile\n(in-memory fallback)", "amber"),
    box(560, 150, 210, 56, "Local AI (CPU, ONNX)", "CLIP ViT-B/32, RapidOCR", "violet"),
    box(560, 220, 210, 56, "Hosted AI (optional)", "Gemini / NVIDIA NIM vision + text", "violet"),
    box(560, 290, 210, 56, "Inngest", "Evidence Council background jobs", "rose"),
    box(300, 320, 200, 56, "Deterministic engines", "forecast, risk, payment check\nno LLM, seeded", "grey"),
    arrow(240, 45, 300, 80), arrow(240, 145, 300, 120), arrow(400, 140, 400, 190, "REST /api/*"),
    arrow(500, 235, 560, 108), arrow(500, 215, 560, 178), arrow(500, 250, 560, 248), arrow(500, 255, 560, 318),
    arrow(400, 280, 400, 320), arrow(300, 110, 240, 45, dash=True), arrow(560, 38, 500, 90, "ID token", dash=True),
]))

D_PAY = sequence(
    [("Phone app /pay", "blue"), ("FastAPI /api/pay", "green"), ("payment_check", "grey"), ("Firestore", "amber"), ("Dashboard tab", "lime")],
    [(0, 1, "POST /pay/{user} (amount, UPI id, X-Pair-Code)", False), (1, 2, "assess(history, amount, payee, balance)", False),
     (2, 1, "verdict + checks + impact", True), (1, 3, "batch: transaction + account balance + review", False),
     (1, 0, "success + review", True), (4, 1, "GET /live every 1 s (version)", False), (1, 4, "version changed", True),
     (4, 1, "refetch transactions + /reviews", False), (4, 4, "toast, table, security card update", True)])

D_PAIR = sequence(
    [("Website (signed in)", "lime"), ("FastAPI", "green"), ("Phone", "blue")],
    [(0, 1, "POST /pay/{uid}/pair (Bearer token)", False), (1, 0, "code (8 random bytes, 30 days)", True),
     (0, 2, "QR / link /pay?u=uid&pair=code", False), (2, 1, "GET /history  X-Pair-Code", False),
     (1, 1, "first use stamps claimed_at", True), (0, 1, "poll /pair?code= every 1.5 s", False),
     (1, 0, "claimed: true  (QR disappears)", True), (2, 1, "later: pay, history, live with the code", False)])

D_FORECAST = chain([
    ("Monthly flows", "income, essential,\ndiscretionary", "blue"), ("Choose window", "3/6/12/24 months\non a validation block", "grey"),
    ("Fit", "median per stream +\nwhole-month residuals", "green"), ("2,000 paths", "joint bootstrap,\nseed 20240601", "green"),
    ("Cash paths", "start cash + net -\ndebt minimums", "amber"), ("Shortfall risk", "P(cash < reserve)\nper month", "rose"),
    ("Scenarios", "same paths replayed\nunder 4 policies", "violet"), ("Backtest", "vs 2 baselines,\nno leakage", "lime"),
], per_row=4)

D_PHOTO = chain([
    ("Photo", "camera or upload", "blue"), ("CLIP image embed", "ONNX, 512-d unit vector", "violet"),
    ("Your memory?", "cosine >= 0.88 to a\nphoto you saved", "green"), ("Zero-shot", "softmax over catalog\nprompts, scale 100", "green"),
    ("Confident?", "top >= 0.5", "amber"), ("Vision LLM", "Gemini / NVIDIA NIM\nnames the item", "violet"),
    ("Price", "your median of last 5\nelse catalog x city", "lime"), ("Confirm + remember", "name and price\nsaved to memory", "blue"),
], per_row=4)

D_OCR = chain([
    ("Photo / PDF page", "statement or receipt", "blue"), ("RapidOCR", "ONNX on this machine\nEnglish + Devanagari", "violet"),
    ("redact()", "digits, then identity lines,\nthen masks", "rose"), ("parse_transactions", "date, narration,\ndebit/credit, balance", "green"),
    ("Preview", "only redacted text\nreaches the UI", "amber"), ("Import", "TransactionRow\nviaStore", "lime"),
], per_row=3)

D_CHECK = chain([
    ("Payment", "amount, payee, UPI id", "blue"), ("History", "your own spend,\nmedian + largest", "grey"),
    ("7 checks", "limit, PIN, payee,\nsize, funds, daily, time", "green"), ("Count", "any fail / >= 2 warns", "amber"),
    ("Verdict", "secure | review |\nsuspicious", "rose"), ("Impact", "balance, month, category,\nbudget, runway", "lime"),
], per_row=3)

D_CACHE = sequence(
    [("Request", "blue"), ("store.query", "green"), ("Cache (per table)", "amber"), ("Firestore", "violet")],
    [(0, 1, "query(Transaction, user_id)", False), (1, 2, "hit? version == table version, age < 45 s", False),
     (2, 1, "yes: copy of rows", True), (1, 3, "miss: stream() (cold ~14 s)", False),
     (0, 1, "put(new transaction)", False), (1, 3, "batch.commit()", False),
     (1, 2, "bump table version + patch matching entries", False), (0, 1, "next query: warm, includes new row", True)])


def table(head, rows, widths=None):
    th = "".join(f"<th>{esc(h)}</th>" for h in head)
    body = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f'<table><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table>'


def feature(num, title, tagline, parts):
    out = f'<section class="feature"><div class="fnum">{num}</div><h2>{esc(title)}</h2><p class="tag">{esc(tagline)}</p>'
    for h, content in parts:
        out += f"<h3>{esc(h)}</h3>{content}"
    return out + "</section>"


def facts(rows):
    return '<div class="facts">' + "".join(f'<div><b>{esc(k)}</b><span>{v}</span></div>' for k, v in rows) + "</div>"


CSS = """
@page { size: A4; margin: 16mm 14mm 16mm 14mm; }
* { box-sizing: border-box; }
body { font-family: 'Segoe UI', Roboto, Arial, sans-serif; color: #202124; font-size: 10.3pt; line-height: 1.5; margin: 0; }
h1 { font-size: 30pt; margin: 0; letter-spacing: -0.5px; }
h2 { font-size: 17pt; margin: 4px 0 2px; color: #174ea6; }
h3 { break-after: avoid; font-size: 11.5pt; margin: 14px 0 4px; color: #188038; }
p { margin: 5px 0; }
.cover { height: 255mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; background: linear-gradient(160deg,#e8f0fe,#fff 55%,#eef9c9); padding: 0 14mm; border-radius: 18px; }
.cover .sub { font-size: 14pt; color: #5f6368; margin-top: 8px; }
.cover .meta { margin-top: 30px; color: #5f6368; font-size: 10pt; }
.toc { page-break-after: always; }
.toc li { margin: 3px 0; }
section.feature, section.chapter { page-break-before: always; }
.fnum { display: inline-block; background: #1a73e8; color: #fff; border-radius: 999px; padding: 1px 12px; font-size: 10pt; }
.tag { color: #5f6368; font-style: italic; margin-bottom: 8px; }
table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 9.2pt; page-break-inside: avoid; }
th { background: #e8f0fe; text-align: left; padding: 5px 7px; border: 1px solid #c6dafc; }
td { padding: 5px 7px; border: 1px solid #e0e3e7; vertical-align: top; }
code, pre { font-family: Consolas, 'Courier New', monospace; font-size: 8.8pt; background: #f1f3f4; border-radius: 4px; }
code { padding: 0 3px; }
pre { padding: 8px 10px; overflow: hidden; white-space: pre-wrap; border: 1px solid #e0e3e7; }
.diagram { width: 100%; height: auto; margin: 8px 0; border: 1px solid #e8eaed; border-radius: 10px; background: #fff; page-break-inside: avoid; }
.bt { font-size: 11.5px; font-weight: 600; fill: #202124; font-family: 'Segoe UI', Arial, sans-serif; }
.bs { font-size: 9px; fill: #3c4043; font-family: 'Segoe UI', Arial, sans-serif; }
.al { font-size: 9px; fill: #3c4043; font-family: 'Segoe UI', Arial, sans-serif; }
.facts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin: 8px 0; }
.facts div { background: #f8f9fa; border: 1px solid #e8eaed; border-radius: 8px; padding: 6px 9px; page-break-inside: avoid; }
.facts b { display: block; font-size: 8.5pt; color: #5f6368; text-transform: uppercase; letter-spacing: .4px; }
.callout { border-left: 4px solid #1a73e8; background: #e8f0fe; padding: 7px 11px; margin: 9px 0; border-radius: 0 8px 8px 0; page-break-inside: avoid; }
.warn { border-left-color: #b06000; background: #fef7e0; }
.good { border-left-color: #188038; background: #e6f4ea; }
ul { margin: 4px 0 4px 18px; padding: 0; } li { margin: 2px 0; }
.cap { font-size: 8.8pt; color: #5f6368; margin-top: -4px; }
"""

SECTIONS: list[str] = []

# ------------------------------------------------------------------ cover + toc
SECTIONS.append("""
<div class="cover"><div style="font-size:12pt;color:#1a73e8;font-weight:600">FinPilot</div>
<h1>Feature Guide</h1>
<div class="sub">How every feature we built works: data, algorithms, tech stack, and why each choice was made.</div>
<div class="meta">Covers: Opt-out simulator · Phone OTP for Google Pay link · Forecast &amp; Risk · Photo prices · Statement OCR · FinPilot Pay phone app · Payment security review · Phone pairing &amp; live sync · Read cache · Login and onboarding flow<br><br>Written from the code in this repository. Demo build: no real money moves and no bank is contacted.</div></div>
""")
SECTIONS.append("""
<div class="toc"><h2>Contents</h2><ol>
<li>System overview and architecture</li><li>Tech stack and why</li><li>Datasets and data model</li>
<li>Feature 1: Opt-out expense simulator</li><li>Feature 2: Phone OTP for the Google Pay link</li>
<li>Feature 3: Forecast &amp; Risk</li><li>Feature 4: Photo prices</li><li>Feature 5: Statement and receipt OCR</li>
<li>Feature 6: FinPilot Pay phone app</li><li>Feature 7: Automatic payment security review</li>
<li>Feature 8: Phone pairing and live sync</li><li>Feature 9: Read cache with write-through</li>
<li>Feature 10: Login, onboarding and dashboard changes</li>
<li>Security, privacy and data integrity</li><li>API reference</li><li>Testing, running it, and known limits</li></ol>
<div class="callout"><b>How to read this guide.</b> Each feature has the same shape: what it does, a diagram, how it works step by step, the data it uses, the stack and the reason for it, and its limits. Numbers quoted (thresholds, sizes, seeds) are the actual constants in the code.</div></div>
""")

# ------------------------------------------------------------------ 1 overview
SECTIONS.append('<section class="chapter"><h2>1. System overview</h2><p class="tag">One ledger per user, many views of it.</p>'
    "<p>FinPilot is a personal-finance copilot. Everything revolves around one <b>ledger per user</b> (accounts, transactions, budgets, goals). The web app, the phone app and every analysis read and write that same ledger, which is why a payment made on the phone shows up on the dashboard within about a second.</p>"
    + D_ARCH + '<p class="cap">Figure 1. Components and how they talk. Solid arrows are requests; dashed arrows are identity or fallback.</p>'
    "<h3>The three rules the design follows</h3><ul>"
    "<li><b>Numbers are computed, not generated.</b> Forecasts, risk, simulators and the payment check are deterministic code over your data. LLMs are used only for language and vision (naming a photographed item, answering chat), never to produce a financial figure.</li>"
    "<li><b>Private data stays local first.</b> OCR and image embeddings run on the machine (ONNX on CPU). Statements are redacted before anything is previewed or stored. Hosted models are optional fallbacks.</li>"
    "<li><b>One source of truth.</b> There is a single backend store module. Every router goes through it, so caching, invalidation and the live-sync counter are consistent.</li></ul>"
    "<h3>Request path of a typical page</h3>" + table(["Step", "What happens"], [
        ["1", "Browser holds a Firebase ID token (or a demo/guest id). <code>apiFetch</code> adds it as <code>Authorization: Bearer</code>."],
        ["2", "FastAPI dependency <code>resolve_user_id</code> checks the token's subject equals the <code>{user_id}</code> in the URL. Demo personas and guest sandboxes are public fixtures and need no token."],
        ["3", "Router reads rows through <code>store.query</code> (cache, then Firestore) and computes the answer with pandas/numpy."],
        ["4", "Response is a Pydantic model, so the frontend types in <code>lib/types.ts</code> mirror it."],
        ["5", "<code>LiveSync</code> polls a change counter; when it moves, the API cache is cleared and every mounted page refetches."]]) + "</section>")

# ------------------------------------------------------------------ 2 stack
SECTIONS.append('<section class="chapter"><h2>2. Tech stack and why</h2><p class="tag">Each choice, and the alternative we did not take.</p>' + table(
    ["Layer", "Choice", "Why this", "Instead of"], [
        ["Web UI", "Next.js 16 (App Router), React 19", "File-based routes, server/client split, one codebase for the site and the installable phone app", "Separate native app (Flutter / React Native)"],
        ["Styling", "Tailwind CSS 4 + shadcn/Radix primitives", "Fast to build accessible, consistent components; design tokens (lime / sage / ink)", "Hand-written CSS"],
        ["Charts", "Recharts", "React-native charting; fan charts, bars, calibration plots with little code", "D3 (more code), Chart.js"],
        ["Animation", "Framer Motion, NumberFlow", "Smooth numeric and layout transitions", "CSS-only"],
        ["Backend", "FastAPI + Pydantic 2", "Typed request/response, auto validation, quick to test; Python owns the numeric stack", "Node API (would split the ML/finance code)"],
        ["Numerics", "pandas 2.2, numpy 2.2", "Monte Carlo, group-bys and rolling statistics are one-liners and fast for months of data", "Pure Python loops"],
        ["Database", "Firestore (Admin SDK), memory fallback", "Serverless, per-user documents, free tier, same project as Auth; fallback makes tests and demos work offline", "SQL (needs hosting and migrations)"],
        ["Auth", "Firebase Auth (Google, email, TOTP MFA, phone OTP)", "Hosted, secure, phone SMS and reCAPTCHA handled for us", "Own password and OTP system"],
        ["Image embeddings", "CLIP ViT-B/32 via fastembed (ONNX)", "No torch install, CPU only, zero-shot: needs no training set for new items", "Training a classifier (needs labelled data)"],
        ["OCR", "RapidOCR (PP-OCR, ONNX), incl. Devanagari", "Runs locally, no cloud upload of bank statements, reads Hindi and Marathi", "Cloud OCR (privacy cost)"],
        ["Vision / text LLM", "Gemini, NVIDIA NIM (optional)", "Handles odd bills and unrecognised items; failover between providers", "One vendor"],
        ["Background jobs", "Inngest", "Parallel agents, retries and a run dashboard for the Evidence Council without us building a queue", "Celery/Redis"],
        ["Phone app", "PWA (web manifest, standalone)", "Same React code installs without the browser bar; secure context over <code>adb reverse</code> unlocks camera", "Native Android build"],
        ["QR / UPI", "<code>qrcode</code> lib, Chrome <code>BarcodeDetector</code>, <code>upi://pay</code> URI", "Standard UPI deep-link format; built-in scanner needs no extra library", "Third-party scanner SDK"],
        ["Tests", "pytest (backend), tsc + eslint (frontend)", "Deterministic engines are easy to assert on", "Manual only"]]) + "</section>")

# ------------------------------------------------------------------ 3 datasets
SECTIONS.append('<section class="chapter"><h2>3. Datasets and data model</h2><p class="tag">Where every number in a demo comes from, and how we keep that honest.</p>'
    "<p>There is <b>no external dataset download</b> for the financial features. Data comes from five sources, and each feature states which one it uses.</p>" + table(
    ["Source", "What it is", "Used by"], [
        ["Persona seeds", "<code>ingest/personas.py</code> generates 12 months of transactions for three demo users (Priya, Arjun, Meera): salary, rent, EMIs, subscriptions, SIPs with jitter so recurring-detection has to find the pattern, a discretionary profile per category and planted anomalies.", "Dashboard, Transactions, security review, simulator (detected subscriptions)"],
        ["Synthetic variable-income history", "<code>plan/synthetic.py</code>: seeded 48-month income / essential / discretionary series for three profiles (stable, moderate, volatile). Test months use a separate seed so tuning never touches them.", "Forecast &amp; Risk when you have under 4 months of real data, or by choice"],
        ["Your own ledger", "Rows you created: UPI payments from the phone, imported statements, linked connectors, receipts.", "Everything, and it always wins over priors"],
        ["Catalog priors", "<code>expenses/catalog.py</code>: everyday items with a CLIP description, category, aliases and typical INR price, adjusted by a city factor.", "Photo prices (first-time items only)"],
        ["Merchant rules", "<code>ingest/categorize.py</code>: ordered regex list of Indian merchants to a category; anything unknown is <code>other</code>.", "Phone payments, imports"]]) +
    "<h3>Collections (Firestore) added or used by these features</h3>" + table(["Collection", "Key fields", "Purpose"], [
        ["transactions", "id, user_id, date, amount (negative = spend), merchant, category, description, review_status, created_at", "The ledger. UPI payments have description <code>UPI to &lt;id&gt;</code>"],
        ["accounts", "id, user_id, name, type, balance", "Balance is decremented on each payment"],
        ["payment_reviews", "id (= transaction id), verdict, heavy, status (open/confirmed/reported), payload JSON", "Security review of heavy or unusual payments"],
        ["pay_pairs", "id (= pairing code), user_id, created_at, claimed_at", "Lets the phone write to a signed-in user's ledger"],
        ["price_memory", "user_id, item, price, photo embedding", "What you taught Photo prices"],
        ["profiles", "id, level, answers", "Onboarding questionnaire"]]) +
    '<div class="callout warn"><b>Honesty rule.</b> Forecast &amp; Risk labels its data source on every screen: when the series is synthetic the report says so in bold. No synthetic number is ever presented as yours.</div></section>')

# ------------------------------------------------------------------ F1 simulator
SECTIONS.append(feature("Feature 1", "Opt-out expense simulator", "See what you would save, per year and in a 12% SIP, if you cancel everyday subscriptions and habits.", [
    ("What it does", "<p>A tab on <b>/simulate</b>. You list recurring spends (Spotify, Netflix, Hotstar, doodhwala, newspaper, gym, broadband and your own). A toggle cancels each one, and the page shows monthly saving, new savings rate, yearly saving and the future value if the saved money went into a SIP.</p>"),
    ("How it works", "<ul><li>Each item has <code>cost</code> (today) and <code>replacement</code> (what you would still spend, e.g. packet milk instead of a doodhwala). Saving = cost - replacement for cancelled items.</li>"
     "<li>Before: <code>savings = income - other - sum(cost)</code>. After: <code>savings + saving</code>. Savings rate = savings / income.</li>"
     "<li>12-month future value of the monthly saving uses the annuity-due formula with <code>SIP_RATE = 12%</code> p.a.: <code>FV = P * ((1+r)^n - 1) / r * (1+r)</code>, r = 12%/12.</li>"
     "<li>Subscriptions detected in your real data (the dashboard's recurring obligations of category <i>subscriptions</i>) are offered as one-click additions, normalised to a monthly amount by frequency (weekly 52/12, quarterly 1/3, annual 1/12).</li></ul>"
     + table(["Formula", "Value"], [["Monthly saving", "sum over cancelled (cost - replacement)"], ["Future value", "P x ((1+r)^12 - 1)/r x (1+r), r = 0.01"], ["Savings rate", "(income - other - spend) / income"]])),
    ("Data and stack", facts([("Data", "your inputs + detected subscriptions from <code>/api/dashboard</code>"), ("Stack", "React state + <code>useMemo</code>, Recharts area chart, Framer Motion"), ("Why client-side", "instant feedback while toggling; no server round trip for pure arithmetic"), ("No LLM", "all arithmetic")])),
    ("Limits", "<p>The 12% return is illustrative, not a promise, and is labelled as such. Items you add are not saved between sessions.</p>")]))

# ------------------------------------------------------------------ F2 OTP
SECTIONS.append(feature("Feature 2", "Phone OTP for the Google Pay link", "Prove you own the mobile number before linking a UPI source.", [
    ("What it does", "<p>In <b>Connect &gt; Google Pay</b>, after choosing a demo profile and entering a mobile number, the dialog sends a real SMS one-time code through Firebase Phone Auth and asks for it before the Account Aggregator consent step proceeds.</p>"),
    ("How it works", chain([("Enter number", "10-digit mobile", "blue"), ("reCAPTCHA", "invisible, in the dialog", "grey"), ("Firebase SMS", "signInWithPhoneNumber(+91...)", "amber"), ("Enter code", "confirmation.confirm()", "blue"), ("Link source", "AA consent + import", "green")], per_row=5, bw=128) +
     "<ul><li>The OTP uses a <b>separate Firebase app instance</b> named <code>phone-verify</code> with in-memory persistence. Verifying a number therefore never signs the user in as that number or changes who the app thinks the user is.</li>"
     "<li>A new <code>RecaptchaVerifier</code> is created for every attempt and cleared after failure or success, because a verifier cannot be reused.</li>"
     "<li>Numbers are normalised to <code>+91</code> and validated as 10 digits before any SMS is sent.</li></ul>"),
    ("Data and stack", facts([("Provider", "Firebase Authentication, Phone provider"), ("Client", "<code>lib/firebase/auth.ts</code>: sendPhoneOtp, confirmPhoneOtp"), ("UI", "<code>LinkGooglePayDialog</code> phases: details, verify, otp, working"), ("Why Firebase", "SMS delivery, rate limiting and abuse protection are hard to do safely ourselves")])),
    ("Limits", "<p>Needs the Phone provider enabled in the Firebase console and an authorised domain (localhost is allowed). Real SMS costs apply beyond the free tier; test numbers can be configured in Firebase.</p>")]))

# ------------------------------------------------------------------ F3 forecast
SECTIONS.append(feature("Feature 3", "Forecast & Risk", "A probabilistic cash-flow forecast, the chance you run short, four scenarios side by side, and proof of how accurate it has been.", [
    ("What it does", "<p>The <b>/forecast-risk</b> page has four tabs: <b>Forecast</b> (P10-P90 fan of income, essentials, discretionary and net cash), <b>Risk</b> (probability of falling below a safety reserve each month, severity, drivers), <b>Scenarios</b> (do nothing vs cut discretionary vs extra debt payment vs extra saving, on the same simulated futures) and <b>Accuracy</b> (backtest versus baselines and calibration of the risk numbers).</p>"),
    ("Pipeline", D_FORECAST + '<p class="cap">Figure 2. One request builds the whole report. Everything after the history is a pure function: same inputs and seed give identical output.</p>'),
    ("The forecaster (<code>plan/forecast.py</code>)", "<ul>"
     "<li><b>Streams.</b> Three monthly series: income, essential spend, discretionary spend.</li>"
     "<li><b>Point forecast.</b> Median of the last <i>W</i> months per stream. <i>W</i> is chosen from (3, 6, 12, 24) by one-step-ahead rolling-origin error of net cash on a <i>validation block that sits before the test months</i>. The longest window wins unless a shorter one beats it by more than 5%, because the validation block is short and noisy.</li>"
     "<li><b>Uncertainty.</b> The residual vector of a <i>whole month</i> (all three streams together) is resampled with replacement. Resampling jointly keeps correlation: a bonus month and a heavy-spend month stay linked.</li>"
     "<li><b>Paths.</b> <code>N_PATHS = 2000</code> simulated futures, <code>SEED = 20240601</code>, horizons 3, 6 or 12 months. Bands are empirical P10 / P50 / P90.</li></ul>"),
    ("Risk (<code>plan/risk.py</code>)", "<ul><li>Cash on each path = starting cash + cumulative (income - essential - discretionary) - debt minimums.</li>"
     "<li><b>Shortfall probability</b> for a month = share of the 2,000 paths where cash is below the reserve (default: median essential spend over the window).</li>"
     "<li>Level low / moderate / high compares that probability with your tolerance. Severity (how deep the shortfall goes) and ranked <i>factors</i> are computed from the same paths. Explanatory sentences are templated from the numbers, not generated by an LLM.</li></ul>"),
    ("Scenarios (<code>plan/compare.py</code>)", "<p>Four fixed monthly schedules (do nothing, cut discretionary, pay extra on debt, save extra) are replayed over the <b>same</b> 2,000 paths, so differences are policy effects and not simulation noise. Cash arithmetic reuses the planner's <code>DebtBook</code>, so \"cash\" has one definition across the app. A recommendation block states the trade-offs.</p>"),
    ("Accuracy (<code>plan/accuracy.py</code>)", "<ul><li><b>No leakage:</b> every forecast origin refits on months strictly before it; the window is tuned on validation; test months are only used for scoring.</li>"
     "<li><b>Baselines:</b> historical average and recurring-payment forecasts. Point error (MAE) and interval coverage/width are compared.</li>"
     "<li><b>Calibration:</b> predicted shortfall probabilities are binned and compared with how often shortfalls actually happened.</li></ul>"),
    ("Data and stack", facts([("Real data", "your monthly flows, needs at least <code>MIN_MONTHS = 4</code>"), ("Synthetic data", "48 months, 3 profiles, shown with a disclosure banner"), ("Stack", "numpy, pandas, Pydantic; Recharts on the frontend"), ("Endpoint", "<code>GET /api/forecast-risk/{user}</code> with horizon, sims, seed, profile")]) +
     "<p><b>Why a bootstrap and not ARIMA/Prophet?</b> Personal finance gives 6-24 noisy months. A model with many parameters overfits; the median-plus-resampled-residuals approach has one tuned parameter (the window), keeps the real shape of your variability, and is explainable in one sentence.</p>"),
    ("Tests and limits", "<p>19 pytest cases cover determinism, window selection, leakage guard, risk monotonicity and scenario paths. Limits: a long upward trend or a one-off life event is not in the history, so the fan will not anticipate it; the report states assumptions on screen.</p>")]))

# ------------------------------------------------------------------ F4 photo
SECTIONS.append(feature("Feature 4", "Photo prices", "Take or choose a photo, and the app says what it looks like and suggests a price. Confirm once and it remembers.", [
    ("What it does", "<p>On <b>/photos</b>, tapping the button first asks <i>camera or upload</i>. The photo is analysed and the result reads \"Looks like X\" with a price field. Confirming the name and price saves it so next time the same item is priced from your own history.</p>"),
    ("Pipeline", D_PHOTO + '<p class="cap">Figure 3. The order is deliberate: your own history first, then a zero-shot model, then a language model only if needed.</p>'),
    ("How each stage works", "<ul>"
     "<li><b>Embedding.</b> The image goes through CLIP ViT-B/32 (ONNX via fastembed, CPU) to a 512-dimension unit vector. Models download once (~600 MB).</li>"
     "<li><b>Memory.</b> If the cosine similarity to a photo you saved earlier is at least <code>0.88</code>, the item is the same thing as before and its price comes from your history.</li>"
     "<li><b>Zero-shot.</b> Otherwise the vector is compared with CLIP text embeddings of <i>\"a photo of &lt;catalog prompt&gt;\"</i> for each catalog item. Logits are scaled by 100 and passed through a softmax to give confidences. <b>No training happens</b>: the catalog is just text.</li>"
     "<li><b>Confidence gate.</b> Under <code>0.5</code> the price is left blank rather than guessed, and the vision LLM (Gemini if a key is set, else NVIDIA NIM) names the item.</li>"
     "<li><b>Price.</b> Your median of the last 5 prices for the item, else the catalog price times a city factor. The result shows the range of your own history.</li></ul>"),
    ("Datasets", facts([("Training set", "none: zero-shot CLIP, plus your saved items"), ("Catalog", "<code>expenses/catalog.py</code>: item, prompt, aliases, category, INR price prior"), ("Memory", "<code>PriceMemoryRow</code>: item, price, embedding"), ("Endpoints", "<code>POST /expenses/{u}/snap</code>, <code>/suggest</code>, <code>/teach</code>, <code>GET /items</code>")])),
    ("Why this stack", "<p>CLIP gives usable recognition for hundreds of everyday objects without collecting or labelling images. ONNX through fastembed avoids installing PyTorch. Keeping the LLM as the last resort keeps cost, latency and privacy low, and the user's own confirmed prices always outrank any prior.</p>"),
    ("Limits", "<p>Prices are priors, not market quotes. Visually similar items (two bottle sizes) can be confused; that is why the user confirms the name and price once.</p>")]))

# ------------------------------------------------------------------ F5 OCR
SECTIONS.append(feature("Feature 5", "Statement and receipt OCR", "Photograph a bank statement, passbook or receipt and get transactions, with personal identifiers removed first.", [
    ("What it does", "<p>The <b>Upload document</b> page and the statement flow read a photo or scan, show a redacted preview, and import the parsed rows into the ledger after you confirm.</p>"),
    ("Pipeline", D_OCR + '<p class="cap">Figure 4. Redaction is the second step, so nothing downstream ever sees account or identity data.</p>'),
    ("How it works", "<ul><li><b>OCR.</b> RapidOCR (PP-OCR on ONNX) runs on this machine. A Devanagari recogniser is tried first (it also reads Latin letters and digits); if fewer than 3 Devanagari letters are found, the English model is used. Boxes are sorted into reading order and merged into lines by vertical position.</li>"
     "<li><b>Redaction (<code>statement_ocr.redact</code>).</b> Devanagari digits are converted to ASCII; whole lines carrying identity (account holder, customer ID, name, address, branch, nominee, in English, Hindi and Marathi) are dropped; then ordered masks replace email, UPI IDs, PAN, Aadhaar (before account numbers so a 12-digit Aadhaar is not mislabeled), IFSC, phone numbers and long account numbers. The response reports how many of each kind were removed.</li>"
     "<li><b>Parsing.</b> <code>parse_transactions</code> extracts date, narration and debit/credit amounts per line; <code>parse_receipt_txn</code> handles single receipts. Rows are categorised with the same merchant rules as everything else.</li></ul>"),
    ("Data and stack", facts([("Input", "image bytes (PNG/JPEG), Hindi / Marathi / English"), ("Output", "plain dicts, then <code>TransactionRow</code> on import"), ("Endpoints", "<code>POST /api/ocr/extract/{u}</code> then <code>/import/{u}</code>"), ("Why local", "bank statements are the most sensitive file a user has; no cloud upload is needed")])),
    ("Limits", "<p>OCR quality depends on the photo. Unusual layouts may need the hosted vision model; the preview step lets the user catch errors before import.</p>")]))

# ------------------------------------------------------------------ F6 pay app
SECTIONS.append(feature("Feature 6", "FinPilot Pay: the phone payment app", "A Google-Pay-style scan-and-pay web app installed on the phone. No real money moves; every payment is booked into the real ledger.", [
    ("What it does", "<p>Open <code>/pay</code> on the phone (USB-connected). You scan any UPI QR (or pick a person, type a UPI ID), enter the amount, choose the account, enter any 4-6 digit PIN, and see a success screen with the UPI transaction id. The same payment appears on the website's dashboard and Transactions page.</p>"),
    ("Screens", table(["Screen", "Behaviour"], [["Home", "search pill and avatar over a gradient hero, 4x2 action grid, People, Business &amp; bills, Recent payments, floating Scan button"], ["Scan", "live camera with Chrome <code>BarcodeDetector</code>; fallbacks: gallery photo, typed UPI ID"], ["Pay", "big amount, Add a note, account sheet, blue Pay button; UPI cap of 1,00,000 enforced"], ["PIN", "6-dot pad, any 4-6 digits (demo)"], ["Success", "blue check, payee, UPI id, amount, UPI transaction id, security verdict for heavy payments, Share screenshot, Done"], ["Tiles not built", "bank transfer, bills, recharge show a \"not available in this demo\" snackbar"]])),
    ("How it works", D_PAY + '<p class="cap">Figure 5. A payment end to end, including how the open dashboard finds out.</p>'
     "<ul><li><b>UPI QR format.</b> <code>upi://pay?pa=&lt;vpa&gt;&amp;pn=&lt;name&gt;&amp;am=&lt;amount&gt;&amp;tn=&lt;note&gt;&amp;cu=INR</code>, parsed by <code>lib/upi.ts</code>. Any real UPI QR can be read; the app only reads it and never contacts a bank.</li>"
     "<li><b>Server.</b> <code>POST /api/pay/{user}</code> validates the VPA with a regex and amount <code>0 &lt; a &lt;= 100000</code>, categorises the merchant, runs the security review, then writes the transaction, the reduced account balance and the review in <b>one Firestore batch</b>.</li>"
     "<li><b>Merchant QR page.</b> <code>/pay/qr</code> on the laptop renders demo merchants with editable amounts for the phone to scan.</li></ul>"),
    ("Installable app (PWA)", "<p><code>public/pay.webmanifest</code> declares <code>display: standalone</code>, scope <code>/pay</code>, theme blue and 192/512/maskable icons. The page links it through its own <code>layout.tsx</code>. Installed from Chrome (Install app) it launches without the address bar. <code>adb reverse tcp:3000 tcp:3000</code> and <code>tcp:8000 tcp:8000</code> make the phone's <code>localhost</code> reach the laptop, which is also a secure context, so the camera works.</p>"),
    ("Why a web app, not native", "<p>One React codebase, instant updates over the dev server, and a PWA is enough to look and feel like an app for this demo. The trade-off is that it depends on the USB forward being active.</p>")]))

# ------------------------------------------------------------------ F7 check
SECTIONS.append(feature("Feature 7", "Automatic payment security review", "Every phone payment is checked as it happens; heavy or unusual ones appear on the dashboard with the verdict and their impact.", [
    ("What it does", "<p>A payment is <b>heavy</b> when it is at least ₹25,000, or at least ₹5,000 <i>and</i> at least 5 times your median payment. Heavy or non-clean payments store a review that the dashboard shows as a card: verdict badge, the seven checks, four impact tiles, insights, and \"It was me\" / \"I did not make this\" buttons.</p>"),
    ("Decision flow", D_CHECK + '<p class="cap">Figure 6. Pure rules over your own history; no model and no network.</p>'),
    ("The seven checks", table(["Check", "Pass when", "Warn / fail"], [
        ["Within UPI limit", "amount &lt;= ₹1,00,000", "fail above"], ["UPI PIN verified", "always (PIN entered on device)", "-"],
        ["Payee recognised", "you have paid this merchant before", "warn: first payment"], ["Size vs your usual", "within 10x of your median", "warn above 10x"],
        ["Sufficient balance", "balance after is at least one month of essentials", "warn below; fail if negative"], ["Daily UPI activity", "UPI sent today &lt;= ₹1,00,000", "warn above"],
        ["Time of day", "05:00 to 23:00 IST", "warn at night"]]) +
     "<p><b>Verdict:</b> any <i>fail</i> gives <b>suspicious</b>; two or more <i>warns</i> give <b>review</b>; otherwise <b>secure</b>.</p>"),
    ("Impact analysis", "<ul><li>Balance before and after, and the payment as a percentage of the balance.</li><li>Month-to-date spend after the payment versus an average full month (\"30% above your usual month\").</li>"
     "<li>Category spend this month versus its usual, and the share of that category's budget used.</li><li>Runway: balance after divided by typical monthly essentials.</li></ul>"
     '<div class="callout good"><b>Example.</b> A ₹1,00,000 payment to a new payee from a ₹42,000 balance fails the balance check and is marked <b>suspicious</b>, with balance after -₹58,000. A ₹12,000 payment to a known merchant with enough balance comes back <b>secure</b>.</div>'),
    ("Endpoints", table(["Endpoint", "Purpose"], [["GET /api/pay/{u}/reviews", "newest reviews with checks and impact"], ["POST /api/pay/{u}/reviews/{id}/status", "confirmed or reported; reported flags the transaction for review"]])),
    ("Why rules, not a model", "<p>The user can read exactly why a payment was flagged, behaviour is identical on every run, and it needs no training data. Thresholds are product choices and are shown in each check's detail text.</p>")]))

# ------------------------------------------------------------------ F8 pairing
SECTIONS.append(feature("Feature 8", "Phone pairing and live sync", "Connect the phone to the account you are signed in with, and see every payment appear in about a second.", [
    ("The problem it solves", "<p>The phone has no login. Without pairing it paid into the demo user, while the website was signed in as a real account, so the two ledgers differed. Pairing makes the phone write to <i>your</i> ledger.</p>"),
    ("Pairing flow", D_PAIR + '<p class="cap">Figure 7. After the first request from the phone, the website replaces the QR with \"Phone connected\" and returns to the other connectors.</p>'),
    ("How it works", "<ul><li><b>Code.</b> <code>secrets.token_urlsafe(8)</code> stored in <code>pay_pairs</code> with the user id; valid 30 days. The server accepts it only for the user that minted it (<code>403</code> otherwise).</li>"
     "<li><b>Phone auth.</b> The phone sends <code>X-Pair-Code</code>; a dependency <code>payer</code> accepts either that or a normal bearer token. The phone stores <code>{u, code}</code> in localStorage so the installed app remembers the account.</li>"
     "<li><b>Live sync.</b> <code>LiveSync</code> (mounted in the app layout) polls <code>/api/pay/{u}/live</code> every <b>1 second</b>, only while the tab is visible. The server returns a global write counter; when it changes, the API cache is cleared and <code>DATA_CHANGED_EVENT</code> makes every mounted <code>useAsync</code> refetch. A toast announces new heavy payments.</li>"
     "<li><b>Phone history.</b> The home screen polls <code>/history</code> every 4 seconds from the same ledger.</li></ul>"
     "<p>The Connect page has a <b>Phone payments</b> tile next to Google Pay, Sheets and Plaid; the dashboard has the same pairing card.</p>"),
    ("Why polling, not websockets", "<p>A one-line counter endpoint is cheap, works through any proxy and needs no connection state. A websocket or Firestore listener is the upgrade path if many users poll at once.</p>"),
    ("Limits", "<p>The pairing link points at <code>localhost:3000</code>, so it only works while the USB forward is active. Pairing a different account means pairing again from that account's session.</p>")]))

# ------------------------------------------------------------------ F9 cache
SECTIONS.append(feature("Feature 9", "Read cache with write-through", "Why the Transactions page used to take forever after a payment, and how it stays fast now.", [
    ("The problem", "<p>A cold Firestore read of one account's 281 transactions took about 14 seconds. The old cache dropped <b>every</b> cached read after <b>any</b> write, so each phone payment sent the dashboard and Transactions page back to cold reads for several queries.</p>"),
    ("How it works now", D_CACHE + '<p class="cap">Figure 8. Per-table versions and write-through.</p>'
     "<ul><li>Each table has its own version number. A write bumps only its table.</li>"
     "<li><code>put()</code> commits to Firestore, then <b>patches the still-current cached query results</b> with the new rows (a row is added to a cached query only if it matches that query's filters), so the next read is warm and already contains the payment.</li>"
     "<li>A 45 second TTL still covers writes from other processes. Log-like tables (audit, copilot insights) are never cached.</li>"
     "<li>A separate global counter, bumped on every non-log write, feeds the live-sync endpoint.</li></ul>"),
    ("Verification", "<p>Five tests in <code>tests/test_read_cache.py</code>: writes visible immediately, cached rows are copies, repeat reads never touch Firestore, log tables are live, and the new write-through test (no refetch after <code>put</code>, filters respected).</p>"),
    ("Limits", "<p>The first read after a backend restart is still cold. Firestore batches are atomic within 500 rows, not across batches.</p>")]))

# ------------------------------------------------------------------ F10 login
SECTIONS.append(feature("Feature 10", "Login, onboarding and dashboard changes", "Smaller changes that make the flow coherent.", [
    ("Changes", table(["Change", "Detail"], [
        ["Redirect", "After Google, email or MFA sign-in the app opens <code>/dashboard</code> (it used to open the copilot)."],
        ["Questionnaire", "The onboarding wizard opens over the dashboard if the profile is missing or was <i>skipped</i>; closing hides it for the browser session, and a skipped profile asks again at the next sign-in."],
        ["Status label", "Transaction History shows <b>Completed</b> for imported rows that were only unreviewed. The money had already moved; review state is tracked in the Transactions review queue."],
        ["Security card", "Latest heavy or unusual payment, placed at the top of the dashboard."],
        ["Phone app look", "Full-width layout (a wrapper that shrank to its content made it look squeezed), dev badge hidden in dev."]])),
    ("Where", "<p><code>app/login/page.tsx</code>, <code>components/onboarding/OnboardingGate.tsx</code>, <code>components/dashboard/TransactionHistory.tsx</code>, <code>PaymentReviewCard.tsx</code>, <code>PhonePairCard.tsx</code>.</p>")]))

# ------------------------------------------------------------------ security
SECTIONS.append('<section class="chapter"><h2>Security, privacy and data integrity</h2><p class="tag">What protects the user, and what a reviewer can verify.</p>' + table(["Area", "Mechanism"], [
    ["Authentication", "Firebase ID tokens. <code>resolve_user_id</code> requires the token's <code>sub</code> to equal the URL user id (403 otherwise). Demo personas and guest sandboxes are public synthetic fixtures."],
    ["Phone link", "Pairing code is 8 random bytes, bound to one user, expires in 30 days, and only grants the pay, history, live and review endpoints."],
    ["Firestore rules", "Clients are read-only on their own documents; all writes go through the backend Admin SDK. Unknown collections are denied."],
    ["Input validation", "Pydantic models: VPA regex, amount bounds, field lengths. Category and review status are validated against enums or regexes."],
    ["Privacy of documents", "OCR runs locally; identifiers are redacted before preview or storage; the redaction report counts what was removed."],
    ["Rate limiting", "The voice and AI routes use a sliding-window <code>RateLimiter</code>."],
    ["Background jobs", "Inngest-called stages require a shared secret in <code>X-Job-Token</code>, compared with <code>hmac.compare_digest</code>."],
    ["Integrity (ACID)", "A payment's transaction, balance change and review are written in one Firestore batch (atomic, up to 500 writes). Firestore transactions provide isolation and durability. The cache never serves a row older than its write because per-table versions change on commit."],
    ["Honest labelling", "Demo and synthetic data are labelled; the phone app says no real money moves."]]) +
    '<div class="callout warn"><b>Not claimed.</b> The demo does not talk to a bank or a real UPI rail; PIN entry accepts any 4-6 digits; pairing codes live in the same database as the ledger.</div></section>')

# ------------------------------------------------------------------ API
SECTIONS.append('<section class="chapter"><h2>API reference (features in this guide)</h2>' + table(["Method and path", "Auth", "Purpose"], [
    ["GET /api/forecast-risk/{u}", "bearer / demo", "full Forecast &amp; Risk report (params: horizon, sims, seed, profile, source)"],
    ["POST /api/expenses/{u}/snap", "bearer / guest", "photo to item and price suggestion"],
    ["POST /api/expenses/{u}/suggest, /teach", "bearer / guest", "suggest from name; save a confirmed item and price"],
    ["POST /api/ocr/extract/{u}, /import/{u}", "bearer / demo", "OCR + redaction preview; import parsed rows"],
    ["POST /api/pay/{u}", "bearer or X-Pair-Code", "book a UPI payment; returns the review"],
    ["GET /api/pay/{u}/history", "bearer or X-Pair-Code", "recent UPI payments"],
    ["GET /api/pay/{u}/live", "bearer or X-Pair-Code", "global write counter"],
    ["GET /api/pay/{u}/reviews", "bearer or X-Pair-Code", "security reviews, newest first"],
    ["POST /api/pay/{u}/reviews/{id}/status", "bearer", "confirmed or reported"],
    ["POST /api/pay/{u}/pair", "bearer", "mint a pairing code"],
    ["GET /api/pay/{u}/pair?code=", "bearer", "has the phone claimed the code / is any phone paired"],
    ["GET/PUT /api/profile/{u}", "bearer / demo", "onboarding profile"]]) + "</section>")

# ------------------------------------------------------------------ testing
SECTIONS.append('<section class="chapter"><h2>Testing, running it, and known limits</h2>'
    "<h3>Verification done</h3><ul><li>Backend: 19 Forecast &amp; Risk tests and 5 read-cache tests pass (<code>python -m pytest --noconftest tests/test_forecast_risk.py tests/test_read_cache.py</code>).</li>"
    "<li>Frontend: <code>tsc --noEmit</code> and eslint clean on the touched files.</li>"
    "<li>Manually: heavy payment review verified by API call; pairing claim verified by API (claimed false, then true after first phone request); phone layout checked by screenshots over adb.</li></ul>"
    "<h3>Run it</h3><pre>cd backend  &amp;&amp; python -m uvicorn app.main:app --port 8000\ncd frontend &amp;&amp; npm run dev            # http://localhost:3000\nadb reverse tcp:3000 tcp:3000 &amp;&amp; adb reverse tcp:8000 tcp:8000\nphone Chrome: http://localhost:3000/pay   (Install app for full screen)</pre>"
    "<h3>Known limits</h3><ul><li><b>No backend tests yet</b> for the payment review rules and the pay/pairing endpoints (verified manually and by API calls).</li>"
    "<li>Dashboard live refresh only runs while the tab is visible; the USB forward drops on unplug.</li>"
    "<li>Test payments created during development remain in the demo ledger until removed.</li>"
    "<li>Two different signed-in accounts see two different ledgers; pair the phone from the account you are viewing.</li>"
    "<li>Backend reload on Windows is unreliable; restart uvicorn after backend edits.</li></ul>"
    "<h3>Other modules present in the repo (not covered here)</h3><p>Voice agent (<code>api/voice_router.py</code>), Evidence Council with Inngest jobs (<code>api/jobs_router.py</code>, <code>security/</code>), Copilot and RAG (<code>copilot/</code>, <code>rag/</code>), tax, household, goals and budgets. They share the same store, auth and conventions described above.</p></section>")

html_doc = f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>FinPilot Feature Guide</title><style>{CSS}</style></head><body>{"".join(SECTIONS)}</body></html>'
out_html = HERE / "FinPilot_Feature_Guide.html"
out_html.write_text(html_doc, encoding="utf8")
pdf = HERE / "FinPilot_Feature_Guide.pdf"
edge = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
subprocess.run([edge, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={pdf}", out_html.as_uri()], check=True, timeout=180)
print("wrote", pdf, pdf.stat().st_size)
