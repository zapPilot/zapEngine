"""Typed Laya questions and encodings for an offline historical experiment."""

from __future__ import annotations

from typing import Any, Literal

EncodingId = Literal[
    "per_bucket_score",
    "posture_mixture",
    "static_equal_weight",
]

BUCKETS = ("stable", "spy", "btc", "eth")
ENCODING_VERSION: dict[EncodingId, str] = {
    "per_bucket_score": "per_bucket_score_v1",
    "posture_mixture": "posture_mixture_v1",
    "static_equal_weight": "static_equal_weight_v1",
}

SCORE_CRITERIA = [
    "none (0%): zero allocation in this historical simulation",
    "light (10%): small simulated allocation",
    "moderate (25%): meaningful simulated allocation",
    "heavy (50%): major simulated allocation",
    "max (75%): dominant simulated allocation",
]
SCORE_LEVEL_WEIGHTS = (0.0, 0.10, 0.25, 0.50, 0.75)

POSTURE_TEMPLATES: dict[str, dict[str, float]] = {
    "risk_off": {"stable": 0.70, "spy": 0.20, "btc": 0.05, "eth": 0.05},
    "defensive": {"stable": 0.45, "spy": 0.30, "btc": 0.15, "eth": 0.10},
    "balanced": {"stable": 0.25, "spy": 0.25, "btc": 0.25, "eth": 0.25},
    "growth": {"stable": 0.10, "spy": 0.30, "btc": 0.35, "eth": 0.25},
    "risk_on": {"stable": 0.05, "spy": 0.20, "btc": 0.45, "eth": 0.30},
}


def _bucket_question(bucket: str) -> dict[str, Any]:
    return {
        "type": "score",
        "instructions": (
            f"For this synthetic historical research state, score the simulated `{bucket}` "
            "allocation. Read only `fgi`, `macro`, `spy`, `btc`, `eth`, "
            "`eth_btc_dma%`, `alloc`, and `prior`; do not assume missing data."
        ),
        "criteria": list(SCORE_CRITERIA),
    }


def questions_for_encoding(encoding: EncodingId) -> dict[str, dict[str, Any]]:
    if encoding == "per_bucket_score":
        return {bucket: _bucket_question(bucket) for bucket in BUCKETS}
    if encoding == "posture_mixture":
        return {
            "posture": {
                "type": "choice",
                "instructions": (
                    "For this synthetic historical research state, classify the simulated "
                    "portfolio posture using `fgi`, `macro`, `spy`, `btc`, `eth`, "
                    "`eth_btc_dma%`, `alloc`, and `prior`."
                ),
                "criteria": {
                    "risk_off": "capital-preservation posture with mostly stable exposure",
                    "defensive": "cautious posture with a large stable reserve",
                    "balanced": "roughly equal exposure across all four buckets",
                    "growth": "higher simulated equity and crypto exposure",
                    "risk_on": "crypto-dominant simulated exposure",
                },
            }
        }
    if encoding == "static_equal_weight":
        return {}
    raise ValueError(f"Unsupported Laya encoding '{encoding}'")


__all__ = [
    "BUCKETS",
    "ENCODING_VERSION",
    "EncodingId",
    "POSTURE_TEMPLATES",
    "SCORE_CRITERIA",
    "SCORE_LEVEL_WEIGHTS",
    "questions_for_encoding",
]
