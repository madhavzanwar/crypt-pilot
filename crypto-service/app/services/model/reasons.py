"""Deterministic reasons (English + simple Hindi) from evidence rules and model contributions.

Every number in a reason comes from the evidence object; nothing is invented.
"""

from __future__ import annotations

from dataclasses import dataclass

_STAT_EN = {"total": "total", "min": "smallest", "max": "largest", "mean": "average", "median": "median"}
_STAT_HI = {"total": "कुल", "min": "सबसे छोटी", "max": "सबसे बड़ी", "mean": "औसत", "median": "मध्य"}
_STEM_EN = {
    "btc_transacted": "BTC moved", "btc_sent": "BTC sent", "btc_received": "BTC received",
    "fees": "fees paid", "fees_as_share": "fees as a share of amount", "blocks_btwn_txs": "gap between transactions",
    "blocks_btwn_input_txs": "gap between incoming transactions",
    "blocks_btwn_output_txs": "gap between outgoing transactions",
    "transacted_w_address": "transactions with the same counterparty",
}
_STEM_HI = {
    "btc_transacted": "लेन-देन की BTC राशि", "btc_sent": "भेजी गई BTC", "btc_received": "प्राप्त BTC",
    "fees": "शुल्क", "fees_as_share": "राशि में शुल्क का हिस्सा", "blocks_btwn_txs": "लेन-देन के बीच का अंतर",
    "blocks_btwn_input_txs": "आने वाले लेन-देन के बीच का अंतर",
    "blocks_btwn_output_txs": "जाने वाले लेन-देन के बीच का अंतर",
    "transacted_w_address": "एक ही पक्ष के साथ लेन-देन",
}
_PLAIN: dict[str, tuple[str, str]] = {
    "num_txs_as_sender": ("number of payments sent", "भेजे गए भुगतानों की संख्या"),
    "num_txs_as receiver": ("number of payments received", "प्राप्त भुगतानों की संख्या"),
    "first_block_appeared_in": ("when the wallet first appeared", "वॉलेट पहली बार कब दिखा"),
    "last_block_appeared_in": ("when the wallet was last seen", "वॉलेट आखिरी बार कब दिखा"),
    "lifetime_in_blocks": ("how long the wallet was active", "वॉलेट कितने समय सक्रिय रहा"),
    "total_txs": ("total number of transactions", "कुल लेन-देन की संख्या"),
    "first_sent_block": ("when it first sent money", "पहली बार पैसा कब भेजा"),
    "first_received_block": ("when it first received money", "पहली बार पैसा कब मिला"),
    "num_timesteps_appeared_in": ("number of periods it was active", "कितनी अवधियों में सक्रिय रहा"),
    "num_addr_transacted_multiple": ("repeat counterparties", "बार-बार वाले लेन-देन पक्ष"),
    "pagerank": ("how central the wallet is in the graph (PageRank)", "ग्राफ में वॉलेट की केंद्रीयता (PageRank)"),
    "comp_size": ("size of its connected cluster", "जुड़े हुए समूह का आकार"),
    "in_deg": ("number of wallets paying it", "इसे भुगतान करने वाले वॉलेट"),
    "out_deg": ("number of wallets it pays", "जिन वॉलेट को यह भुगतान करता है"),
    "nb1_illicit_train": ("flagged direct neighbours", "सीधे जुड़े चिह्नित वॉलेट"),
    "nb1_licit_train": ("known-licit direct neighbours", "सीधे जुड़े वैध वॉलेट"),
    "walk2_illicit_train": ("flagged wallets two steps away", "दो कदम दूर चिह्नित वॉलेट"),
    "walk2_licit_train": ("known-licit wallets two steps away", "दो कदम दूर वैध वॉलेट"),
    "hops_to_illicit_train": ("distance to the nearest flagged wallet", "सबसे नज़दीकी चिह्नित वॉलेट की दूरी"),
}


def feature_name(feature: str) -> tuple[str, str]:
    """Plain-language (en, hi) name for a model feature."""
    if feature in _PLAIN:
        return _PLAIN[feature]
    stem, _, stat = feature.rpartition("_")
    if stem in _STEM_EN and stat in _STAT_EN:
        return f"{_STAT_EN[stat]} {_STEM_EN[stem]}", f"{_STAT_HI[stat]} {_STEM_HI[stem]}"
    return feature.replace("_", " "), feature.replace("_", " ")


@dataclass
class ReasonInput:
    ofac: bool
    ransomwhere: bool
    in_dataset: bool
    dataset_label: str | None
    hop1_illicit: int
    nearest_illicit: int | None
    max_hop: int
    comp_size: int | None
    pagerank: float | None
    pagerank_p99: float | None
    verdict: str
    contributions: list[tuple[str, float]]
    dataset_name: str = "Elliptic++"


_LABEL_HI = {"illicit": "अवैध (illicit)", "licit": "वैध (licit)", "unknown": "अज्ञात (unknown)"}
LARGE_CLUSTER = 1000


def build_reasons(r: ReasonInput, max_model_reasons: int = 3) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    if r.ofac:
        out.append(("Appears on the OFAC sanctions list", "OFAC प्रतिबंध सूची में शामिल है"))
    if r.ransomwhere:
        out.append(("Appears in the Ransomwhere ransomware address list",
                    "Ransomwhere रैनसमवेयर पता सूची में शामिल है"))
    if not r.in_dataset:
        out.append((f"Not in the {r.dataset_name} research dataset, so there is no graph evidence",
                    f"यह {r.dataset_name} शोध डेटासेट में नहीं है, इसलिए ग्राफ़ का कोई सबूत नहीं है"))
        return out
    if r.dataset_label in ("illicit", "licit"):
        out.append((f"Labelled {r.dataset_label} in the {r.dataset_name} research dataset",
                    f"{r.dataset_name} शोध डेटासेट में इसे {_LABEL_HI[r.dataset_label]} चिह्नित किया गया है"))
    if r.hop1_illicit > 0:
        noun = "wallet" if r.hop1_illicit == 1 else "wallets"
        out.append((f"{r.hop1_illicit} flagged {noun} within 1 hop",
                    f"1 कदम की दूरी पर {r.hop1_illicit} चिह्नित वॉलेट"))
    if r.nearest_illicit is not None:
        if r.nearest_illicit > 1:
            out.append((f"Nearest flagged wallet is {r.nearest_illicit} hops away",
                        f"सबसे नज़दीकी चिह्नित वॉलेट {r.nearest_illicit} कदम दूर है"))
    else:
        out.append((f"No flagged wallet within {r.max_hop} hops",
                    f"{r.max_hop} कदम के भीतर कोई चिह्नित वॉलेट नहीं"))
    if r.comp_size is not None and r.comp_size >= LARGE_CLUSTER:
        out.append((f"Part of a large connected cluster of {r.comp_size} wallets",
                    f"{r.comp_size} वॉलेट के एक बड़े जुड़े समूह का हिस्सा"))
    if r.pagerank is not None and r.pagerank_p99 is not None and r.pagerank > r.pagerank_p99:
        out.append(("Unusually well-connected wallet (high PageRank, top 1%)",
                    "असामान्य रूप से ज़्यादा जुड़ा हुआ वॉलेट (ऊँचा PageRank, शीर्ष 1%)"))
    # model contributions in the direction of the verdict
    raising = r.verdict in ("WARN", "BLOCK")
    picked = [(f, c) for f, c in r.contributions if (c > 0) == raising][:max_model_reasons]
    for f, _ in picked:
        en, hi = feature_name(f)
        if raising:
            out.append((f"Model signal: {en} raised the risk", f"मॉडल संकेत: {hi} से जोखिम बढ़ा"))
        else:
            out.append((f"Model signal: {en} lowered the risk", f"मॉडल संकेत: {hi} से जोखिम घटा"))
    return out
