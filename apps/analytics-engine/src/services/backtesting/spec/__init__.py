"""Declarative strategy specs: parse, validate, hash and compile."""

from __future__ import annotations

from src.services.backtesting.spec.canonical import (
    behavior_hash,
    canonical_json,
    spec_ref,
)
from src.services.backtesting.spec.compiler import compile_spec
from src.services.backtesting.spec.loader import load_spec
from src.services.backtesting.spec.model import StrategySpec
from src.services.backtesting.spec.validation import SpecError, SpecIssue, parse_spec

__all__ = [
    "SpecError",
    "SpecIssue",
    "StrategySpec",
    "behavior_hash",
    "canonical_json",
    "compile_spec",
    "load_spec",
    "parse_spec",
    "spec_ref",
]
