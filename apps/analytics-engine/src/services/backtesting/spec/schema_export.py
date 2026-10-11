"""JSON Schema and vocabulary guide generated from the spec models.

The models are the single source of truth. Two artifacts are derived from them
and committed next to the reference specs, so a reviewer sees what a model
change does to the format and an LLM author can be handed one file:

- ``strategy-spec.schema.json``: the schema in the ``llm`` profile (every ref
  inlined, every property required, no unknown keys), the shape structured
  output modes accept. A knob added after the first reference has a default in
  the models and is required here too, so an author spells it out; the default
  is kept as ``x-default``;
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
_NOISE = frozenset({"title", "discriminator"})

# What each kind does, in the terms an author needs. Fields are listed from the
# models, so this only carries what a field description cannot.
KIND_SEMANTICS: dict[str, str] = {
    "dma_cross_down_exit": (
        "Fires on a day an asset's price crosses below its 200-day DMA (the "
        "signal's cross cooldown applies). The crossing asset and its peers go "
        "to zero and the cash goes to stable, or where `proceeds` routes it. "
        "Its own cooldown is kept for the whole rule or for each asset that "
        "crossed (`cooldown_scope`)."
    ),
    "dma_cross_up_rebalance": (
        "Fires on a day an asset crosses above its DMA. Under `equal_weight` "
        "the portfolio is re-weighted equally across every asset currently "
        "above its DMA, the rest in stable; under `deploy_stable` every holding "
        "is kept and only the stable is split equally across those assets. The "
        "cooldown is tracked per asset that triggered it."
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
        "and greed index, SPY the macro one). Sells `sell_step` from each such "
        "asset: of the portfolio, or of the position under relative `sizing`."
    ),
    "fgi_downshift_trim": (
        "Fires when an asset's fear/greed regime was in `from_regimes` the day "
        "before and is in `to_regimes` today. Sells `sell_step` from each such "
        "asset: of the portfolio, or of the position under relative `sizing`."
    ),
    "trend_dca_entry": (
        "Fires when an asset is above its DMA, the signal's cross cooldown no "
        "longer bars entering it, it holds less than `max_weight` of the "
        "portfolio and there is stable to spend. Buys `buy_step` of the "
        "portfolio into each such asset out of stable, never taking an asset "
        "above `max_weight` (scaled down together when stable is short). It "
        "enters in steps where `dma_cross_up_rebalance` enters at once."
    ),
}

# What each overlay does. Fields are listed from the models.
OVERLAY_SEMANTICS: dict[str, str] = {
    "trend_guard": (
        "Acts every day and has the last word. An asset counts as below its "
        "DMA once it has closed more than `below_dma_buffer` under it for "
        "`confirm_days` days in a row. `block_adds` undoes any purchase of such "
        "an asset (the cash stays in stable); `force_exit` also sells what is "
        "held of it. Because it looks at the level, not at the day of the "
        "cross, it holds whatever route a position took."
    ),
}

_OVERLAY_INTRO = (
    "Overlays adjust the decision after the rules have made it. They apply in "
    "the order listed, at most one of each kind."
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
        if key == "default":
            tightened["x-default"] = value
            continue
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
        "field has a default, so reading the spec is reading the strategy. The "
        "exception is a knob added after the first reference spec: it is marked "
        "*optional*, its default is what the strategy did before the knob "
        "existed, and leaving it out is the same strategy as spelling the "
        "default out. The schema asks for every field, optional ones included. "
        "The strategy trades SPY, BTC and ETH against stable. Rules are listed "
        "in precedence order and the first one that matches, and is off "
        "cooldown, decides the day. The machine-readable form is "
        f"[`{SCHEMA_FILENAME}`]({SCHEMA_FILENAME}).",
        "",
        "## Top level",
        "",
        *_field_table(schema, skip={"rules", "overlays"}),
        "",
        "## Rules",
        "",
        str(schema["properties"]["rules"]["description"]),
        "",
    ]
    for branch in _branches(schema["properties"]["rules"]["items"]):
        lines.extend(_kind_section(branch, KIND_SEMANTICS))
    lines.extend(["## Overlays", "", _OVERLAY_INTRO, ""])
    for branch in _branches(schema["properties"]["overlays"]["items"]):
        lines.extend(_kind_section(branch, OVERLAY_SEMANTICS))
    return "\n".join(lines).rstrip() + "\n"


def _branches(items: dict[str, Any]) -> list[dict[str, Any]]:
    """The kinds a list may hold: a ``oneOf`` union, or a single object."""
    branches: list[dict[str, Any]] = items.get("oneOf", [items])
    return branches


def _kind_section(branch: dict[str, Any], semantics: dict[str, str]) -> list[str]:
    kind = branch["properties"]["kind"]["const"]
    lines = [f"### `{kind}`", "", str(branch["description"]), ""]
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
        meaning = str(child.get("description", ""))
        if child.get("x-tunable"):
            meaning = f"{meaning} *(tunable)*".strip()
        if "x-default" in child:
            default = json.dumps(child["x-default"])
            meaning = f"{meaning} *(optional, default `{default}`)*".strip()
        rows.append((path, _type_label(child), meaning))
        rows.extend(_children(child, path))
    return rows


def _children(node: dict[str, Any], path: str) -> list[tuple[str, str, str]]:
    if "properties" in node:
        return _flatten(node, f"{path}.", set())
    tag = _union_tag(node)
    if tag is not None:
        return _union_children(node["oneOf"], path, tag)
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


def _union_tag(node: dict[str, Any]) -> str | None:
    """The property that tells the branches of a ``oneOf`` apart, if there is one."""
    branches = node.get("oneOf")
    if not branches:
        return None
    shared = set.intersection(
        *(
            {
                name
                for name, child in branch.get("properties", {}).items()
                if "const" in child
            }
            for branch in branches
        )
    )
    return next(iter(sorted(shared)), None)


def _union_children(
    branches: list[dict[str, Any]],
    path: str,
    tag: str,
) -> list[tuple[str, str, str]]:
    rows: list[tuple[str, str, str]] = []
    for branch in branches:
        value = json.dumps(branch["properties"][tag]["const"])
        rows.extend(
            (name, label, f"With `{tag}` `{value}`: {meaning}")
            for name, label, meaning in _flatten(branch, f"{path}.", set())
            if name != f"{path}.{tag}"
        )
    return rows


def _type_label(node: dict[str, Any]) -> str:
    if "const" in node:
        return f"`{json.dumps(node['const'])}`"
    if "enum" in node:
        return " \\| ".join(f"`{json.dumps(value)}`" for value in node["enum"])
    if "oneOf" in node:
        tag = _union_tag(node)
        assert tag is not None, "every union in the spec is tagged"
        values = " \\| ".join(
            f"`{json.dumps(branch['properties'][tag]['const'])}`"
            for branch in node["oneOf"]
        )
        return f"object, `{tag}` is {values}"
    if "anyOf" in node:
        return " \\| ".join(_type_label(option) for option in node["anyOf"])
    kind = node["type"]
    if kind == "array" and node.get("maxItems") == 0:
        return "array, always empty"
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
        ("exclusiveMaximum", "<"),
    ):
        if keyword in node:
            parts.append(f"{symbol} {node[keyword]}")
    return f" ({', '.join(parts)})" if parts else ""


__all__ = [
    "KIND_SEMANTICS",
    "OVERLAY_SEMANTICS",
    "SCHEMA_FILENAME",
    "VOCABULARY_FILENAME",
    "render_schema",
    "render_vocabulary",
    "spec_json_schema",
]
