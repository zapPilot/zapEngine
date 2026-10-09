"""JSON Schema and vocabulary guide generated from the spec models.

The models are the single source of truth. Two artifacts are derived from them
and committed next to the reference specs, so a reviewer sees what a model
change does to the format and an LLM author can be handed one file:

- ``strategy-spec.schema.json``: the schema in the ``llm`` profile (every ref
  inlined, every property required, no unknown keys), the shape structured
  output modes accept;
- ``VOCABULARY.md``: every rule kind, field, range and meaning in prose.
"""

from __future__ import annotations

import json
from typing import Any, Literal

from src.services.backtesting.spec.model import SPEC_FORMAT, StrategySpec

Profile = Literal["llm", "full"]
SCHEMA_FILENAME = "strategy-spec.schema.json"
VOCABULARY_FILENAME = "VOCABULARY.md"
_JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema"
_NOISE = frozenset({"title", "default", "discriminator"})

# What each kind does, in the terms an author needs. Fields are listed from the
# models, so this only carries what a field description cannot.
KIND_SEMANTICS: dict[str, str] = {
    "dma_cross_down_exit": (
        "Fires on a day an asset's price crosses below its 200-day DMA (the "
        "signal's cross cooldown applies). The crossing asset and its peers go "
        "to zero and the cash goes to stable, or where `proceeds` routes it."
    ),
    "dma_cross_up_rebalance": (
        "Fires on a day an asset crosses above its DMA. The portfolio is "
        "re-weighted equally across every asset currently above its DMA, the "
        "rest in stable. The cooldown is tracked per asset that triggered it."
    ),
    "ratio_cross_rotation": (
        "Fires when the ETH/BTC ratio crosses its own 200-day DMA. A cross up "
        "sweeps `cross_up.sources` into `cross_up.destination`, a cross down "
        "does the same with `cross_down`. It starts the ratio cross cooldown "
        "(`signals.ratio`)."
    ),
    "ratio_deviation_rotation": (
        "Fires when the ETH/BTC ratio sits far from its DMA, whether or not it "
        "just crossed. The tier is the first whose threshold the distance "
        "reaches, tried from the strongest, and `rotation_fraction` of the "
        "source holding moves to the destination. Each tier keeps its own "
        "cooldown and the rule does not start the ratio cross cooldown."
    ),
    "dma_overextension_trim": (
        "Fires when an asset above its DMA is further above than its threshold "
        "times the multiplier of its regime (BTC and ETH use the crypto fear "
        "and greed index, SPY the macro one). Sells `sell_step` of the "
        "portfolio from each such asset."
    ),
    "fgi_downshift_trim": (
        "Fires when an asset's fear/greed regime was in `from_regimes` the day "
        "before and is in `to_regimes` today. Sells `sell_step` of the "
        "portfolio from each such asset."
    ),
}

_GUARD_SEMANTICS = (
    "`trade_quota` turns the day into a hold when a trade-frequency limit is "
    "reached, whichever rule decided."
)
_OVERLAY_SEMANTICS = (
    "`spy_latch` runs after the rules and guards. When SPY crosses up it moves "
    "the stable already held into SPY, then keeps routing new stable into SPY "
    "for `follow_through_days`."
)


def spec_json_schema(profile: Profile = "llm") -> dict[str, Any]:
    schema = StrategySpec.model_json_schema()
    if profile == "full":
        return schema
    inlined = _inline(schema, schema.get("$defs", {}))
    return {
        "$schema": _JSON_SCHEMA_DIALECT,
        **_tighten(inlined),
    }


def render_schema(profile: Profile = "llm") -> str:
    return json.dumps(spec_json_schema(profile), indent=2) + "\n"


def _inline(node: Any, defs: dict[str, Any]) -> Any:
    if isinstance(node, list):
        return [_inline(item, defs) for item in node]
    if not isinstance(node, dict):
        return node
    if "$ref" in node:
        target = defs[node["$ref"].rsplit("/", 1)[-1]]
        siblings = {key: value for key, value in node.items() if key != "$ref"}
        return _inline({**target, **siblings}, defs)
    return {key: _inline(value, defs) for key, value in node.items() if key != "$defs"}


def _tighten(node: Any) -> Any:
    """Strip noise keywords and close every object, recursing through schemas."""
    if isinstance(node, list):
        return [_tighten(item) for item in node]
    if not isinstance(node, dict):
        return node
    tightened: dict[str, Any] = {}
    for key, value in node.items():
        if key in _NOISE:
            continue
        if key == "properties":
            tightened[key] = {name: _tighten(child) for name, child in value.items()}
        else:
            tightened[key] = _tighten(value)
    if "properties" in tightened:
        tightened["required"] = list(tightened["properties"])
        tightened["additionalProperties"] = False
    return tightened


def render_vocabulary() -> str:
    schema = spec_json_schema("llm")
    lines = [
        "# Strategy spec vocabulary",
        "",
        f"Generated from the spec models (format `{SPEC_FORMAT}`) by "
        "`pnpm strategy-lab schema`. Do not edit by hand.",
        "",
        "A strategy is one JSON document that spells out everything it does: no "
        "field has a default, so reading the spec is reading the strategy. It "
        "trades SPY, BTC and ETH against stable. Rules are listed in precedence "
        "order and the first one that matches, and is off cooldown, decides the "
        "day. The machine-readable form is "
        f"[`{SCHEMA_FILENAME}`]({SCHEMA_FILENAME}).",
        "",
        "## Top level",
        "",
        *_field_table(schema, skip={"rules", "guards", "overlays"}),
        "",
        "## Rules",
        "",
        str(schema["properties"]["rules"]["description"]),
        "",
    ]
    for branch in schema["properties"]["rules"]["items"]["oneOf"]:
        lines.extend(_kind_section(branch, KIND_SEMANTICS))
    lines.extend(
        [
            "## Guards",
            "",
            _GUARD_SEMANTICS,
            "",
            *_kind_section(schema["properties"]["guards"]["items"], None),
            "## Overlays",
            "",
            _OVERLAY_SEMANTICS,
            "",
            *_kind_section(schema["properties"]["overlays"]["items"], None),
        ]
    )
    return "\n".join(lines).rstrip() + "\n"


def _kind_section(
    branch: dict[str, Any],
    semantics: dict[str, str] | None,
) -> list[str]:
    kind = branch["properties"]["kind"]["const"]
    lines = [f"### `{kind}`", "", str(branch["description"]), ""]
    if semantics is not None:
        lines.extend([semantics[kind], ""])
    lines.extend(_field_table(branch, skip={"kind"}))
    lines.append("")
    return lines


def _field_table(node: dict[str, Any], *, skip: set[str]) -> list[str]:
    rows = [
        "| Field | Type | Meaning |",
        "| --- | --- | --- |",
    ]
    rows.extend(
        f"| `{path}` | {type_label} | {description} |"
        for path, type_label, description in _flatten(node, "", skip)
    )
    return rows


def _flatten(
    node: dict[str, Any],
    prefix: str,
    skip: set[str],
) -> list[tuple[str, str, str]]:
    rows: list[tuple[str, str, str]] = []
    for name, child in node["properties"].items():
        if not prefix and name in skip:
            continue
        path = f"{prefix}{name}"
        rows.append((path, _type_label(child), str(child.get("description", ""))))
        rows.extend(_children(child, path))
    return rows


def _children(node: dict[str, Any], path: str) -> list[tuple[str, str, str]]:
    if "properties" in node:
        return _flatten(node, f"{path}.", set())
    item = node.get("items")
    if isinstance(item, dict):
        return _children(item, f"{path}[]")
    options = [
        option
        for option in node.get("anyOf", [])
        if "properties" in option or "items" in option
    ]
    rows: list[tuple[str, str, str]] = []
    for option in options:
        rows.extend(_children(option, path))
    return rows


def _type_label(node: dict[str, Any]) -> str:
    if "const" in node:
        return f"`{json.dumps(node['const'])}`"
    if "enum" in node:
        return " \\| ".join(f"`{json.dumps(value)}`" for value in node["enum"])
    if "anyOf" in node:
        return " \\| ".join(_type_label(option) for option in node["anyOf"])
    kind = node["type"]
    if kind == "array":
        return f"array of {_type_label(node['items'])}"
    if kind in {"integer", "number"}:
        return f"{kind}{_bounds(node)}"
    if kind == "string" and "pattern" in node:
        return f"string `{node['pattern']}`"
    return str(kind)


def _bounds(node: dict[str, Any]) -> str:
    parts = []
    for keyword, symbol in (
        ("minimum", ">="),
        ("exclusiveMinimum", ">"),
        ("maximum", "<="),
    ):
        if keyword in node:
            parts.append(f"{symbol} {node[keyword]}")
    return f" ({', '.join(parts)})" if parts else ""


__all__ = [
    "KIND_SEMANTICS",
    "SCHEMA_FILENAME",
    "VOCABULARY_FILENAME",
    "render_schema",
    "render_vocabulary",
    "spec_json_schema",
]
