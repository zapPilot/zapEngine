"""What every strategy-lab command shares: outcomes, failures and where files live."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from src.services.backtesting.lab.bundle import (
    Bundle,
    BundleCorruptError,
    BundleError,
    BundleExistsError,
    BundleReferenceError,
    load_bundle,
)
from src.services.backtesting.lab.ledger import LEDGER_FILENAME
from src.services.backtesting.spec import StrategySpec, load_spec
from src.services.backtesting.spec.loader import resolve_spec_path
from src.services.backtesting.spec.validation import SpecError, SpecIssue

EXIT_OK = 0
EXIT_GATE = 1
EXIT_NOT_APPLICABLE = 2
EXIT_SPEC = 3
EXIT_DATA = 4
EXIT_HOLDOUT = 5


@dataclass
class Outcome:
    """What a command reports. ``exit_code`` is non-zero when it found a gate failure."""

    result: dict[str, Any]
    artifacts: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    exit_code: int = EXIT_OK


@dataclass
class CliError(Exception):
    exit_code: int
    code: str
    message: str
    issues: tuple[SpecIssue, ...] = ()


@dataclass(frozen=True)
class Context:
    """Where a command reads specs and keeps lab files."""

    strategies_dir: Path
    lab_dir: Path

    @property
    def bundles_dir(self) -> Path:
        return self.lab_dir / "bundles"

    @property
    def runs_dir(self) -> Path:
        return self.lab_dir / "runs"

    @property
    def candidates_dir(self) -> Path:
        return self.lab_dir / "candidates"

    @property
    def ledger_path(self) -> Path:
        return self.lab_dir / LEDGER_FILENAME

    @property
    def holdouts_dir(self) -> Path:
        return self.lab_dir / "holdouts"


def load_spec_or_fail(ref: str, context: Context) -> tuple[Path, StrategySpec]:
    path = resolve_spec_path(ref, context.strategies_dir)
    try:
        return path, load_spec(ref, context.strategies_dir)
    except FileNotFoundError as error:
        raise CliError(EXIT_SPEC, "spec_not_found", f"No spec at {path}") from error
    except SpecError as error:
        raise CliError(
            EXIT_SPEC, "invalid_spec", "The spec is invalid", error.issues
        ) from error


def bundle_failure(error: BundleError) -> CliError:
    if isinstance(error, BundleReferenceError):
        return CliError(EXIT_NOT_APPLICABLE, "invalid_bundle_reference", str(error))
    if isinstance(error, BundleExistsError):
        return CliError(EXIT_GATE, "bundle_exists", str(error))
    if isinstance(error, BundleCorruptError):
        return CliError(EXIT_DATA, "bundle_corrupt", str(error))
    return CliError(EXIT_DATA, "bundle_not_found", str(error))


def load_bundle_or_fail(ref: str, context: Context) -> Bundle:
    try:
        return load_bundle(ref, context.bundles_dir)
    except BundleError as error:
        raise bundle_failure(error) from error


__all__ = [
    "CliError",
    "Context",
    "EXIT_DATA",
    "EXIT_GATE",
    "EXIT_HOLDOUT",
    "EXIT_NOT_APPLICABLE",
    "EXIT_OK",
    "EXIT_SPEC",
    "Outcome",
    "bundle_failure",
    "load_bundle_or_fail",
    "load_spec_or_fail",
]
