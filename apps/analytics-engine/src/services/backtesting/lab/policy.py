"""The promotion policy: what a candidate must show to replace the reference.

The thresholds live in ``src/config/strategies/PROMOTION_POLICY.json``, a file a
reviewer reads, not in code, so changing the bar is a visible change of its own.
Each name says which side of the bar passes: ``fold_win_rate_at_least`` is
inclusive, ``mean_oos_edge_above_pp`` and ``deflated_sharpe_above`` are strict,
``bootstrap_p_below`` is strict, and the ``..._worse_by_at_most_pp`` bars allow
exactly that much.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

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


class PromotionPolicy(_Section):
    format: Literal["promotion-policy/1"]
    description: str = Field(min_length=1)
    prerequisites: Prerequisites
    walk_forward: WalkForward
    holdout: HoldoutBar


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
    "load_policy",
]
