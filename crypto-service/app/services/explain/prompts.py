"""Prompts. The LLM only ever receives the structured evidence JSON built by the pipeline: no user
free text (the address is validated by checksum; the language is an enum)."""

from __future__ import annotations

import json
from typing import Any

SYSTEM = """You explain a wallet risk check to a non-expert. You receive ONLY a JSON evidence object.
Rules:
- Write 3 to 5 short sentences in English for "en" and the same meaning in simple Hindi (Devanagari) for "hi".
- Only restate facts present in the JSON: the verdict, the risk score, the dataset label, hop counts
  and neighbour counts. Never invent or round numbers; never add numbers that are not in the JSON.
- Do not speculate about who owns the wallet. Do not name crimes or activities that are not in the
  JSON. Do not give legal or financial advice. Do not call the wallet safe, guilty or criminal.
- If status is "not_in_dataset" or evidence is missing, say there is insufficient evidence.
- Mention the OFAC sanctions list only if labelHits.ofac is true.
- The last sentence must be exactly: en: "This is a risk signal from a research dataset, not an accusation."
  hi: "यह एक शोध डेटासेट पर आधारित जोखिम संकेत है, आरोप नहीं।"
Return ONLY a JSON object: {"en": "...", "hi": "..."}"""

# fields the model is allowed to see (no subgraph ids, no hashes)
_FIELDS = ("status", "verdict", "riskScore", "datasetName", "datasetLabel", "hopsToNearestIllicit", "maxHop",
           "neighbors", "labelHits", "componentSize", "topReasons")


def evidence_for_llm(evidence: dict[str, Any]) -> dict[str, Any]:
    return {k: evidence[k] for k in _FIELDS if k in evidence}


def user_prompt(evidence: dict[str, Any]) -> str:
    return "Evidence JSON:\n" + json.dumps(evidence_for_llm(evidence), ensure_ascii=False, sort_keys=True)
