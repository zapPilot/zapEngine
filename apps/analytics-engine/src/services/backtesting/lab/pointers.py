"""Pointers into a spec: JSON pointers where a rule can be named by its id.

``/rules/3/cooldown_days`` is a plain JSON pointer. ``/rules[eth_btc_deviation_dca]/
cooldown_days`` names the same value by the rule's id, which survives reordering
and is what diffs, liveness reports and sweep spaces show. A bracketed key
matches an element's ``id``.
"""

from __future__ import annotations

import copy
import re
from collections.abc import Mapping, Sequence
from typing import Any

_KEYED = re.compile(r"^([^\[\]]+)\[([^\[\]]+)\]$")


class PointerError(ValueError):
    """The pointer does not lead anywhere in the spec."""


def split(pointer: str) -> list[str]:
    if not pointer.startswith("/"):
        raise PointerError(f"'{pointer}' is not a pointer; it must start with '/'")
    return pointer[1:].split("/")


def get(raw: Any, pointer: str) -> Any:
    """The value at ``pointer``."""
    node = raw
    for token in split(pointer):
        node = _step(node, token, pointer)
    return node


def set_at(raw: Any, pointer: str, value: Any) -> Any:
    """A deep copy of ``raw`` with the value at ``pointer`` replaced."""
    parts = split(pointer)
    copied = copy.deepcopy(raw)
    node = copied
    for token in parts[:-1]:
        node = _step(node, token, pointer)
    last = parts[-1]
    if isinstance(node, Mapping) and _KEYED.match(last) is None:
        if last not in node:
            raise PointerError(f"'{pointer}': no '{last}' to replace")
        node[last] = value  # type: ignore[index]
    elif isinstance(node, list) and last.isdigit():
        index = int(last)
        if index >= len(node):
            raise PointerError(f"'{pointer}': no element {index}")
        node[index] = value
    else:
        raise PointerError(f"'{pointer}' does not end on a value that can be set")
    return copied


def _step(node: Any, token: str, pointer: str) -> Any:
    keyed = _KEYED.match(token)
    if keyed is not None:
        name, key = keyed.groups()
        if not isinstance(node, Mapping) or name not in node:
            raise PointerError(f"'{pointer}': no '{name}' at '{token}'")
        return _element(node[name], key, pointer)
    if isinstance(node, Mapping):
        if token not in node:
            raise PointerError(f"'{pointer}': no '{token}'")
        return node[token]
    if isinstance(node, Sequence) and not isinstance(node, str) and token.isdigit():
        index = int(token)
        if index >= len(node):
            raise PointerError(f"'{pointer}': no element {index}")
        return node[index]
    raise PointerError(f"'{pointer}': cannot read '{token}' here")


def _element(items: Any, key: str, pointer: str) -> Any:
    if isinstance(items, Sequence) and not isinstance(items, str):
        for item in items:
            if isinstance(item, Mapping) and item.get("id") == key:
                return item
    raise PointerError(f"'{pointer}': nothing is named '{key}'")


__all__ = ["PointerError", "get", "set_at", "split"]
