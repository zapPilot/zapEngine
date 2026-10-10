"""Market data bundles: the pinned inputs the lab runs strategies on.

A bundle is a gzipped JSONL file: one manifest line, then one line per day with
the engine-input row and that day's sentiment, exactly what the compare path
consumes. The manifest names the source and window, records the market data
requirements the rows satisfy and their coverage, and carries
``content_sha256``, the hash of the rows alone. That hash is the bundle's
identity: it is checked on every read, and a report that names it can be
reproduced. The gzip stream is written with ``mtime=0`` so the same data gives
the same bytes on the same platform.

Rows are plain JSON: a day's own ``date`` comes back as a ``date``, while dates
and datetimes nested in a sentiment or feature come back as ISO text. The engine
reads only a sentiment's label and value, so a run on a bundle equals a run on
the data it was taken from (a test pins it).

Bundles live under ``.lab/bundles/<name>/<end>-<hash12>.jsonl.gz`` (git-ignored).
A reference is ``name:latest``, ``name:<id>``, a path to a bundle file, or
``synthetic:<scenario>?seed=N&days=N`` for a deterministic synthetic history.
"""

from __future__ import annotations

import copy
import gzip
import hashlib
import json
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, cast
from urllib.parse import parse_qs, urlsplit

from src.services.backtesting.constants import STRATEGY_DMA_FGI_PORTFOLIO_RULES
from src.services.backtesting.features import MarketDataRequirements
from src.services.backtesting.lab.coverage import coverage_of
from src.services.backtesting.lab.synthetic import (
    SCENARIOS,
    Scenario,
    synthetic_market,
)
from src.services.backtesting.strategy_registry import get_strategy_recipe

BUNDLE_SCHEMA = 2
APP_ROOT = Path(__file__).resolve().parents[4]
LAB_DIR = APP_ROOT / ".lab"
BUNDLES_DIR = LAB_DIR / "bundles"
BUNDLE_SUFFIX = ".jsonl.gz"
LATEST = "latest"
SYNTHETIC_SCHEME = "synthetic"
SYNTHETIC_DEFAULT_SEED = 1
SYNTHETIC_DEFAULT_DAYS = 400
PRODUCTION_SOURCE = "production-read-only"
SYNTHETIC_SOURCE = "synthetic"
_NAME = re.compile(r"^[a-z][a-z0-9_-]{0,47}$")
_HASH_PREFIX = 12

History = tuple[list[dict[str, Any]], dict[date, dict[str, Any]], date, date]


class BundleError(Exception):
    """Base of everything that can go wrong with a bundle."""


class BundleReferenceError(BundleError):
    """The reference or name is malformed."""


class BundleNotFoundError(BundleError):
    """No bundle matches the reference."""


class BundleCorruptError(BundleError):
    """The file is not a bundle this version reads, or its content changed."""


class BundleExistsError(BundleError):
    """A bundle with this identity is already on disk; it is never overwritten."""


@dataclass(frozen=True)
class BundleManifest:
    name: str
    source: str
    start: date
    end: date
    requirements: dict[str, Any]
    coverage: dict[str, Any]
    content_sha256: str

    @property
    def bundle_id(self) -> str:
        return f"{self.end.isoformat()}-{self.content_sha256[:_HASH_PREFIX]}"

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema": BUNDLE_SCHEMA,
            "name": self.name,
            "source": self.source,
            "window": {"start": self.start.isoformat(), "end": self.end.isoformat()},
            "requirements": self.requirements,
            "coverage": self.coverage,
            "content_sha256": self.content_sha256,
        }

    @classmethod
    def from_dict(cls, raw: Mapping[str, Any]) -> BundleManifest:
        if raw.get("schema") != BUNDLE_SCHEMA:
            raise BundleCorruptError(
                f"Unsupported bundle schema {raw.get('schema')!r}; this reads "
                f"schema {BUNDLE_SCHEMA}"
            )
        try:
            return cls(
                name=raw["name"],
                source=raw["source"],
                start=date.fromisoformat(raw["window"]["start"]),
                end=date.fromisoformat(raw["window"]["end"]),
                requirements=raw["requirements"],
                coverage=raw["coverage"],
                content_sha256=raw["content_sha256"],
            )
        except (KeyError, TypeError, ValueError) as error:
            raise BundleCorruptError(f"Malformed bundle manifest: {error}") from error


@dataclass(frozen=True)
class Bundle:
    manifest: BundleManifest
    prices: list[dict[str, Any]]
    sentiments: dict[date, dict[str, Any]]
    path: Path | None = None

    def history(self) -> History:
        """The ``(prices, sentiments, start, end)`` the compare path takes.

        Fresh copies on every call, so a run can never change the bundle.
        """
        return (
            copy.deepcopy(self.prices),
            copy.deepcopy(self.sentiments),
            self.manifest.start,
            self.manifest.end,
        )


def requirements_as_dict(requirements: MarketDataRequirements) -> dict[str, Any]:
    return {
        "price_history_days": requirements.price_history_days,
        "sentiment_history_days": requirements.sentiment_history_days,
        "requires_sentiment": requirements.requires_sentiment,
        "requires_macro_fear_greed": requirements.requires_macro_fear_greed,
        "required_price_features": sorted(requirements.required_price_features),
        "required_aux_series": sorted(requirements.required_aux_series),
        "max_lag_days": requirements.max_lag_days,
    }


def reference_requirements() -> dict[str, Any]:
    """What the reference strategy needs from market data."""
    recipe = get_strategy_recipe(STRATEGY_DMA_FGI_PORTFOLIO_RULES)
    return requirements_as_dict(recipe.market_data_requirements)


def build_manifest(
    *,
    name: str,
    source: str,
    prices: Sequence[Mapping[str, Any]],
    sentiments: Mapping[date, Any],
    start: date,
    end: date,
    requirements: dict[str, Any],
) -> BundleManifest:
    check_bundle_name(name)
    return BundleManifest(
        name=name,
        source=source,
        start=start,
        end=end,
        requirements=requirements,
        coverage=coverage_of(prices, sentiments).as_dict(),
        content_sha256=_content_sha256(_row_lines(prices, sentiments)),
    )


def encode_bundle(
    manifest: BundleManifest,
    prices: Sequence[Mapping[str, Any]],
    sentiments: Mapping[date, Any],
) -> bytes:
    lines = [
        json.dumps(manifest.as_dict(), sort_keys=True),
        *_row_lines(prices, sentiments),
    ]
    return gzip.compress("".join(line + "\n" for line in lines).encode(), mtime=0)


def write_bundle(
    bundles_dir: Path,
    *,
    manifest: BundleManifest,
    prices: Sequence[Mapping[str, Any]],
    sentiments: Mapping[date, Any],
) -> Path:
    """Write a bundle under its identity. Never overwrites an existing file."""
    path = bundles_dir / manifest.name / f"{manifest.bundle_id}{BUNDLE_SUFFIX}"
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("xb") as handle:
            handle.write(encode_bundle(manifest, prices, sentiments))
    except FileExistsError as error:
        raise BundleExistsError(f"{path} already exists") from error
    return path


def read_bundle(path: Path) -> Bundle:
    try:
        raw = gzip.decompress(path.read_bytes())
    except FileNotFoundError as error:
        raise BundleNotFoundError(f"No bundle at {path}") from error
    except (OSError, EOFError) as error:
        raise BundleCorruptError(f"{path} is not a gzip bundle: {error}") from error
    lines = raw.decode().splitlines()
    try:
        manifest = BundleManifest.from_dict(json.loads(lines[0]))
        entries = [json.loads(line) for line in lines[1:]]
    except (IndexError, json.JSONDecodeError) as error:
        raise BundleCorruptError(f"{path} is not a bundle: {error}") from error
    if _content_sha256(lines[1:]) != manifest.content_sha256:
        raise BundleCorruptError(
            f"{path} no longer matches its content hash {manifest.content_sha256}"
        )
    prices: list[dict[str, Any]] = []
    sentiments: dict[date, dict[str, Any]] = {}
    for entry in entries:
        row = entry["market"]
        row["date"] = date.fromisoformat(row["date"])
        prices.append(row)
        if entry["sentiment"] is not None:
            sentiments[row["date"]] = entry["sentiment"]
    return Bundle(manifest=manifest, prices=prices, sentiments=sentiments, path=path)


def resolve_bundle_path(ref: str, bundles_dir: Path = BUNDLES_DIR) -> Path:
    """The file a ``name:latest``, ``name:<id>`` or path reference points at."""
    if ref.endswith(BUNDLE_SUFFIX):
        return Path(ref)
    name, separator, version = ref.partition(":")
    if not separator or not version:
        raise BundleReferenceError(
            f"'{ref}' is not a bundle reference; use name:latest or name:<id>"
        )
    check_bundle_name(name)
    directory = bundles_dir / name
    if version != LATEST:
        return directory / f"{version}{BUNDLE_SUFFIX}"
    candidates = sorted(
        directory.glob(f"*{BUNDLE_SUFFIX}") if directory.is_dir() else [],
        key=lambda path: (path.name[:10], path.stat().st_mtime_ns),
    )
    if not candidates:
        raise BundleNotFoundError(f"No bundle named '{name}' in {bundles_dir}")
    return candidates[-1]


def load_bundle(ref: str, bundles_dir: Path = BUNDLES_DIR) -> Bundle:
    if ref.startswith(f"{SYNTHETIC_SCHEME}:"):
        return synthetic_bundle(ref)
    return read_bundle(resolve_bundle_path(ref, bundles_dir))


def synthetic_bundle(ref: str) -> Bundle:
    """``synthetic:<scenario>?seed=N&days=N`` as a bundle (never real evidence)."""
    parts = urlsplit(ref)
    scenario = parts.path
    options = parse_qs(parts.query, keep_blank_values=True)
    unknown = sorted(set(options) - {"seed", "days"})
    if scenario not in SCENARIOS or unknown:
        raise BundleReferenceError(
            f"'{ref}' is not a synthetic reference; use "
            f"synthetic:<{'|'.join(SCENARIOS)}>?seed=N&days=N"
        )
    try:
        seed = int(options.get("seed", [str(SYNTHETIC_DEFAULT_SEED)])[0])
        days = int(options.get("days", [str(SYNTHETIC_DEFAULT_DAYS)])[0])
        market = synthetic_market(
            seed=seed,
            scenario=cast(Scenario, scenario),
            days=days,
        )
    except ValueError as error:
        raise BundleReferenceError(f"'{ref}': {error}") from error
    manifest = build_manifest(
        name=f"synthetic-{scenario}-{seed}-{days}",
        source=SYNTHETIC_SOURCE,
        prices=market.prices,
        sentiments=market.sentiments,
        start=market.user_start_date,
        end=market.prices[-1]["date"],
        requirements=reference_requirements(),
    )
    return Bundle(
        manifest=manifest,
        prices=market.prices,
        sentiments=market.sentiments,
    )


def check_bundle_name(name: str) -> None:
    if not _NAME.match(name):
        raise BundleReferenceError(
            f"'{name}' is not a bundle name (lowercase letters, digits, - and _)"
        )


def _row_lines(
    prices: Sequence[Mapping[str, Any]],
    sentiments: Mapping[date, Any],
) -> list[str]:
    return [
        json.dumps(
            {"market": row, "sentiment": sentiments.get(row["date"])},
            default=_json_default,
            allow_nan=False,
            sort_keys=True,
        )
        for row in prices
    ]


def _content_sha256(lines: Sequence[str]) -> str:
    return hashlib.sha256("".join(line + "\n" for line in lines).encode()).hexdigest()


def _json_default(value: Any) -> str:
    if isinstance(value, date | datetime):
        return value.isoformat()
    raise TypeError(f"{type(value).__name__} is not JSON serializable")


__all__ = [
    "BUNDLES_DIR",
    "BUNDLE_SCHEMA",
    "LAB_DIR",
    "Bundle",
    "BundleCorruptError",
    "BundleError",
    "BundleExistsError",
    "BundleManifest",
    "BundleNotFoundError",
    "BundleReferenceError",
    "History",
    "build_manifest",
    "check_bundle_name",
    "encode_bundle",
    "load_bundle",
    "read_bundle",
    "reference_requirements",
    "requirements_as_dict",
    "resolve_bundle_path",
    "synthetic_bundle",
    "write_bundle",
]
