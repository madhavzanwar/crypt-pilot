"""Deterministic explanations (English + simple Hindi) filled only from the evidence object.

Used directly in the vertical slice and as the fallback whenever the LLM output fails validation.
"""

from __future__ import annotations

from typing import Any

LIMITATION_EN = "This is a risk signal from a research dataset, not an accusation."
LIMITATION_HI = "यह एक शोध डेटासेट पर आधारित जोखिम संकेत है, आरोप नहीं।"

_VERDICT_HI = {"ALLOW": "ALLOW (अनुमति)", "WARN": "WARN (सावधान)", "BLOCK": "BLOCK (रोकें)",
               "UNKNOWN": "UNKNOWN (अज्ञात)"}
_LABEL_HI = {"illicit": "अवैध (illicit)", "licit": "वैध (licit)", "unknown": "अज्ञात (unknown)"}


def _plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def template_en(ev: dict[str, Any]) -> str:
    parts: list[str] = []
    ofac = ev["labelHits"]["ofac"]
    if ev["status"] != "ok":
        parts.append(f"This address is not in the {ev['datasetName']} research dataset, so there is "
                     "insufficient evidence to score it.")
        if ofac:
            parts.append("It appears on the OFAC sanctions list, so the verdict is BLOCK.")
        parts.append(LIMITATION_EN)
        return " ".join(parts)
    parts.append(f"The verdict for this wallet is {ev['verdict']} with a risk score of {ev['riskScore']} out of 100.")
    if ev["datasetLabel"] in ("illicit", "licit"):
        parts.append(f"The {ev['datasetName']} research dataset labels it {ev['datasetLabel']}.")
    n1 = ev["neighbors"]["hop1"]["illicit"]
    nearest = ev["hopsToNearestIllicit"]
    if n1 > 0:
        parts.append(f"{_plural(n1, 'flagged wallet')} {'is' if n1 == 1 else 'are'} directly connected to it.")
    elif nearest is not None:
        parts.append(f"The nearest flagged wallet is {nearest} hops away.")
    else:
        parts.append(f"No flagged wallet was found within {ev['maxHop']} hops.")
    if ofac:
        parts.append("It appears on the OFAC sanctions list.")
    parts.append(LIMITATION_EN)
    return " ".join(parts)


def template_hi(ev: dict[str, Any]) -> str:
    parts: list[str] = []
    ofac = ev["labelHits"]["ofac"]
    if ev["status"] != "ok":
        parts.append(f"यह पता {ev['datasetName']} शोध डेटासेट में नहीं है, इसलिए जोखिम आँकने के लिए पर्याप्त सबूत "
                     "नहीं है।")
        if ofac:
            parts.append("यह OFAC प्रतिबंध सूची में है, इसलिए नतीजा BLOCK (रोकें) है।")
        parts.append(LIMITATION_HI)
        return " ".join(parts)
    parts.append(f"इस वॉलेट का नतीजा {_VERDICT_HI[ev['verdict']]} है और जोखिम स्कोर 100 में से {ev['riskScore']} है।")
    if ev["datasetLabel"] in ("illicit", "licit"):
        parts.append(f"{ev['datasetName']} शोध डेटासेट में इसे {_LABEL_HI[ev['datasetLabel']]} चिह्नित किया गया है।")
    n1 = ev["neighbors"]["hop1"]["illicit"]
    nearest = ev["hopsToNearestIllicit"]
    if n1 > 0:
        parts.append(f"{n1} चिह्नित वॉलेट इससे सीधे जुड़े हैं।")
    elif nearest is not None:
        parts.append(f"सबसे नज़दीकी चिह्नित वॉलेट {nearest} कदम दूर है।")
    else:
        parts.append(f"{ev['maxHop']} कदम के भीतर कोई चिह्नित वॉलेट नहीं मिला।")
    if ofac:
        parts.append("यह OFAC प्रतिबंध सूची में है।")
    parts.append(LIMITATION_HI)
    return " ".join(parts)


class TemplateExplainer:
    name = "template"

    async def explain(self, evidence: dict[str, Any]) -> tuple[str, str]:
        return template_en(evidence), template_hi(evidence)

    async def aclose(self) -> None:
        return None
