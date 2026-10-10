"""The promotion policy: what a candidate must show to replace the reference.

The thresholds live in ``src/config/strategies/PROMOTION_POLICY.json``, a file a
reviewer reads, not in code, so changing the bar is a visible change of its own.
Each name says which side of the bar passes: ``fold_win_rate_at_least`` is
inclusive, ``mean_oos_edge_above_pp`` and ``deflated_sharpe_above`` are strict,
``bootstrap_p_below`` is strict, and the ``..._worse_by_at_most_pp`` and
``..._shortfall_at_most_pp`` bars allow exactly that much.

A candidate takes one of two tracks. The search track (``walk_forward`` and
``holdout``) is for a candidate whose numbers were searched. The structural
track (``structural``) is for one that only removes pieces or changes a
categorical choice: it searched nothing a fold could catch overfitting, so it is
held instead to not trailing the reference on the real data and on a fixed suite
of synthetic histories.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from src.services.backtesting.lab.bundle import SYNTHETIC_SCHEME
from src.services.backtesting.lab.folds import MIN_FOLDS
from src.services.backtesting.lab.report import hash_of
from src.services.backtesting.spec.loader import STRATEGIES_DIR

POLICY_FORMAT = "promotion-policy/1"
POLICY_FILENAME = "PROMOTION_POLICY.json"
POLICY_PATH = STRATEGIES_DIR / POLICY_FILENAME


class PolicyError(ValueError):
    """The policy file is missing, is not JSON, or does not say what it must."""


class _Section(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Prerequisites(_Section):
    real_data_only: bool = Field(
        description="Evidence on synthetic data is refused: it is not evidence."
    )
    canonical_assumptions: bool = Field(
        description="Every number was produced under the assumptions a response states by default."
    )
    no_dead_parameters: bool = Field(
        description="No tunable parameter of the candidate changes no decision."
    )
    hard_invariants: bool = Field(description="No hard invariant is broken.")
    validation_events: bool = Field(
        description="The candidate passes the behavioral validation events."
    )
    golden_unaffected: bool = Field(
        description="The pinned golden traces still reproduce."
    )


class WalkForward(_Section):
    min_folds: int = Field(
        ge=MIN_FOLDS, description="Fewer folds say nothing, whatever they show."
    )
    fold_win_rate_at_least: float = Field(ge=0.0, le=1.0)
    mean_oos_edge_above_pp: float
    bootstrap_p_below: float = Field(gt=0.0, le=1.0)
    fold_drawdown_worse_by_at_most_pp: float = Field(ge=0.0)
    deflated_sharpe_above: float = Field(ge=0.0, le=1.0)


class HoldoutBar(_Section):
    required: bool
    roi_shortfall_at_most_pp: float = Field(ge=0.0)
    drawdown_worse_by_at_most_pp: float = Field(ge=0.0)


class RealBundleBar(_Section):
    """How far the candidate may trail the reference on the evidence data."""

    roi_shortfall_at_most_pp: float = Field(ge=0.0)
    drawdown_worse_by_at_most_pp: float = Field(ge=0.0)


class StressSuiteBar(_Section):
    """The same synthetic histories for every structural promotion, judged by medians."""

    bundles: tuple[str, ...] = Field(
        min_length=1,
        description="Synthetic bundle references, so anyone can rerun the suite.",
    )
    median_roi_shortfall_at_most_pp: float = Field(ge=0.0)
    median_drawdown_worse_by_at_most_pp: float = Field(ge=0.0)

    @field_validator("bundles")
    @classmethod
    def _fixed_and_synthetic(cls, bundles: tuple[str, ...]) -> tuple[str, ...]:
        recorded = [
            ref for ref in bundles if not ref.startswith(f"{SYNTHETIC_SCHEME}:")
        ]
        if recorded:
            raise ValueError(
                "the suite must be reproducible anywhere, so every history is "
                f"synthetic: {', '.join(recorded)}"
            )
        if len(set(bundles)) != len(bundles):
            raise ValueError("a history is listed twice")
        return bundles


class StructuralBar(_Section):
    description: str = Field(min_length=1)
    real_bundle: RealBundleBar
    stress_suite: StressSuiteBar


class PromotionPolicy(_Section):
    format: Literal["promotion-policy/1"]
    description: str = Field(min_length=1)
    prerequisites: Prerequisites
    walk_forward: WalkForward
    holdout: HoldoutBar
    structural: StructuralBar


@dataclass(frozen=True)
class LoadedPolicy:
    policy: PromotionPolicy
    path: Path
    policy_hash: str

    def as_dict(self) -> dict[str, str]:
        return {"path": str(self.path), "hash": self.policy_hash}


def load_policy(path: Path = POLICY_PATH) -> LoadedPolicy:
    try:
        raw = json.loads(path.read_text())
    except FileNotFoundError as error:
        raise PolicyError(f"No promotion policy at {path}") from error
    except json.JSONDecodeError as error:
        raise PolicyError(f"{path} is not JSON: {error}") from error
    try:
        policy = PromotionPolicy.model_validate(raw)
    except ValidationError as error:
        problems = "; ".join(
            f"/{'/'.join(str(part) for part in item['loc'])}: {item['msg']}"
            for item in error.errors()
        )
        raise PolicyError(f"{path} is not a promotion policy: {problems}") from error
    return LoadedPolicy(policy, path, hash_of(policy.model_dump(mode="json")))


__all__ = [
    "LoadedPolicy",
    "POLICY_FILENAME",
    "POLICY_FORMAT",
    "POLICY_PATH",
    "PolicyError",
    "PromotionPolicy",
    "StructuralBar",
    "load_policy",
]
