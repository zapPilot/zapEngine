"""A small JSON Schema checker for the keywords the spec schema uses.

``jsonschema`` is not a dependency of this service, and the generated schema
only uses a handful of keywords, so the test checks them directly instead of
adding a package.
"""

from __future__ import annotations

import re
from typing import Any

_TYPES: dict[str, tuple[type, ...]] = {
    "string": (str,),
    "integer": (int,),
    "number": (int, float),
    "boolean": (bool,),
    "null": (type(None),),
    "object": (dict,),
    "array": (list,),
}


def violations(instance: Any, schema: dict[str, Any], path: str = "") -> list[str]:
    """Every way ``instance`` breaks ``schema``, as ``path: problem`` strings."""
    problems: list[str] = []
    problems.extend(_typed(instance, schema, path))
    problems.extend(_valued(instance, schema, path))
    problems.extend(_bounded(instance, schema, path))
    if "anyOf" in schema and not any(
        not violations(instance, option, path) for option in schema["anyOf"]
    ):
        problems.append(f"{path}: matches none of anyOf")
    if "oneOf" in schema:
        matching = [
            option
            for option in schema["oneOf"]
            if not violations(instance, option, path)
        ]
        if len(matching) != 1:
            problems.append(f"{path}: matches {len(matching)} of oneOf, not one")
    if isinstance(instance, dict):
        problems.extend(_object(instance, schema, path))
    if isinstance(instance, list) and "items" in schema:
        for index, item in enumerate(instance):
            problems.extend(violations(item, schema["items"], f"{path}/{index}"))
    return problems


def _typed(instance: Any, schema: dict[str, Any], path: str) -> list[str]:
    expected = schema.get("type")
    if expected is None:
        return []
    allowed = _TYPES[expected]
    is_bool_for_number = isinstance(instance, bool) and expected != "boolean"
    if not isinstance(instance, allowed) or is_bool_for_number:
        return [f"{path}: expected {expected}"]
    return []


def _valued(instance: Any, schema: dict[str, Any], path: str) -> list[str]:
    problems = []
    if "const" in schema and instance != schema["const"]:
        problems.append(f"{path}: expected {schema['const']!r}")
    if "enum" in schema and instance not in schema["enum"]:
        problems.append(f"{path}: not one of {schema['enum']}")
    if (
        "pattern" in schema
        and isinstance(instance, str)
        and not re.search(schema["pattern"], instance)
    ):
        problems.append(f"{path}: does not match {schema['pattern']}")
    return problems


def _bounded(instance: Any, schema: dict[str, Any], path: str) -> list[str]:
    problems = []
    if isinstance(instance, int | float) and not isinstance(instance, bool):
        if "minimum" in schema and instance < schema["minimum"]:
            problems.append(f"{path}: below {schema['minimum']}")
        if "exclusiveMinimum" in schema and instance <= schema["exclusiveMinimum"]:
            problems.append(f"{path}: not above {schema['exclusiveMinimum']}")
        if "maximum" in schema and instance > schema["maximum"]:
            problems.append(f"{path}: above {schema['maximum']}")
        if "exclusiveMaximum" in schema and instance >= schema["exclusiveMaximum"]:
            problems.append(f"{path}: not below {schema['exclusiveMaximum']}")
    if isinstance(instance, str):
        if "minLength" in schema and len(instance) < schema["minLength"]:
            problems.append(f"{path}: shorter than {schema['minLength']}")
        if "maxLength" in schema and len(instance) > schema["maxLength"]:
            problems.append(f"{path}: longer than {schema['maxLength']}")
    if isinstance(instance, list) and "minItems" in schema:
        if len(instance) < schema["minItems"]:
            problems.append(f"{path}: fewer than {schema['minItems']} items")
    return problems


def _object(instance: dict[str, Any], schema: dict[str, Any], path: str) -> list[str]:
    problems = [
        f"{path}/{name}: required"
        for name in schema.get("required", [])
        if name not in instance
    ]
    properties = schema.get("properties", {})
    for name, value in instance.items():
        if name in properties:
            problems.extend(violations(value, properties[name], f"{path}/{name}"))
        elif schema.get("additionalProperties") is False:
            problems.append(f"{path}/{name}: not allowed")
    return problems
