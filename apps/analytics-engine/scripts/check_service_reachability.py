#!/usr/bin/env python3
"""Validate service dependency reachability and dead-code risk.

Checks:
1. Every `*ServiceDep` symbol used by routers resolves to a valid dependency
   function in `src/services/dependencies.py`.
2. No service module is only test-referenced (or fully unreferenced) unless it is
   explicitly allowlisted.
"""

from __future__ import annotations

import ast
import sys
from collections import defaultdict, deque
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
TESTS_DIR = PROJECT_ROOT / "tests"
DEPENDENCIES_PATH = SRC_DIR / "services" / "dependencies.py"
API_DIR = SRC_DIR / "api"

SERVICE_MODULE_EXCLUDE_PREFIXES = {
    "src.services.interfaces",
    "src.services.backtesting",
    "src.services.aggregators",
    "src.services.query_builders",
    "src.services.transformers",
}

# Modules that are intentionally framework glue or discovery roots and may have
# atypical static reference patterns.
SERVICE_MODULE_ALLOWLIST = {
    "src.services.dependencies",
}


class ReachabilityError(Exception):
    """Raised when reachability checks fail."""


def module_name_for(path: Path) -> str:
    """Convert a Python file path to a dotted module path."""
    relative = path.relative_to(PROJECT_ROOT)
    return relative.with_suffix("").as_posix().replace("/", ".")


def build_module_index(root: Path) -> dict[str, Path]:
    """Build an index of dotted module path -> file path."""
    index: dict[str, Path] = {}
    for file in root.rglob("*.py"):
        if "__pycache__" in file.parts:
            continue
        index[module_name_for(file)] = file
    return index


def parse_python(path: Path) -> ast.AST:
    """Parse a python file to AST."""
    return ast.parse(path.read_text())


def name_of(node: ast.AST) -> str | None:
    """Extract simple name from AST node."""
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def parse_dependencies(
    dependencies_path: Path,
) -> tuple[dict[str, str], dict[str, set[str]], set[str]]:
    """Parse dependencies.py into alias/get-function mappings and dependency graph."""
    tree = parse_python(dependencies_path)
    get_to_get, defined_get_functions = _collect_dependency_function_graph(tree)
    alias_to_get = _collect_service_dep_aliases(tree)
    return alias_to_get, get_to_get, defined_get_functions


def parse_router_dependency_usage(api_dir: Path) -> set[str]:
    """Collect dependency symbols imported from dependencies.py and actually used."""
    used_symbols: set[str] = set()

    for router_file in api_dir.rglob("*.py"):
        tree = parse_python(router_file)
        imported_from_dependencies = _collect_dependency_import_aliases(tree)

        if not imported_from_dependencies:
            continue

        used_symbols.update(
            _collect_used_dependency_symbols(tree, imported_from_dependencies)
        )

    return used_symbols


def validate_router_dep_resolution(
    used_symbols: set[str],
    alias_to_get: dict[str, str],
    get_to_get: dict[str, set[str]],
    defined_get_functions: set[str],
) -> list[str]:
    """Validate that used dependency symbols resolve to reachable get functions."""
    seed_get_functions, errors = _resolve_seed_get_functions(
        used_symbols=used_symbols,
        alias_to_get=alias_to_get,
        defined_get_functions=defined_get_functions,
    )
    reachable_get = _expand_reachable_get_functions(
        seed_get_functions=seed_get_functions,
        get_to_get=get_to_get,
        defined_get_functions=defined_get_functions,
    )
    errors.extend(_collect_unreachable_seed_errors(seed_get_functions, reachable_get))
    return errors


def collect_module_references(
    modules: dict[str, Path],
) -> dict[str, set[str]]:
    """Return map: target_module -> set(referrer module names)."""
    reverse_refs: dict[str, set[str]] = defaultdict(set)

    for module_name, module_path in modules.items():
        tree = parse_python(module_path)
        _collect_import_references(
            tree=tree,
            module_name=module_name,
            modules=modules,
            reverse_refs=reverse_refs,
        )

    return reverse_refs


def _collect_dependency_function_graph(
    tree: ast.AST,
) -> tuple[dict[str, set[str]], set[str]]:
    get_to_get: dict[str, set[str]] = defaultdict(set)
    defined_get_functions: set[str] = set()

    for node in getattr(tree, "body", []):
        if not isinstance(node, ast.FunctionDef):
            continue

        function_name = node.name
        if function_name.startswith("get_"):
            defined_get_functions.add(function_name)

        for default in node.args.defaults:
            referenced = _extract_depends_reference(default)
            if referenced is not None:
                get_to_get[function_name].add(referenced)

    return get_to_get, defined_get_functions


def _collect_service_dep_aliases(tree: ast.AST) -> dict[str, str]:
    alias_to_get: dict[str, str] = {}
    for node in getattr(tree, "body", []):
        if not isinstance(node, ast.Assign):
            continue
        if len(node.targets) != 1 or not isinstance(node.targets[0], ast.Name):
            continue

        target = node.targets[0].id
        if not target.endswith("ServiceDep"):
            continue

        dep_fn = _extract_annotated_depends_target(node.value)
        if dep_fn:
            alias_to_get[target] = dep_fn
    return alias_to_get


def _extract_annotated_depends_target(value: ast.AST) -> str | None:
    if not isinstance(value, ast.Subscript):
        return None
    if not isinstance(value.value, ast.Name) or value.value.id != "Annotated":
        return None

    slice_node: ast.AST = value.slice
    elements = slice_node.elts if isinstance(slice_node, ast.Tuple) else [slice_node]
    for element in elements:
        dep_fn = _extract_depends_reference(element)
        if dep_fn:
            return dep_fn
    return None


def _extract_depends_reference(node: ast.AST) -> str | None:
    if not isinstance(node, ast.Call):
        return None
    if name_of(node.func) != "Depends" or not node.args:
        return None
    return name_of(node.args[0])


def _collect_dependency_import_aliases(tree: ast.AST) -> dict[str, str]:
    imported_from_dependencies: dict[str, str] = {}
    for node in getattr(tree, "body", []):
        if (
            isinstance(node, ast.ImportFrom)
            and node.module == "src.services.dependencies"
        ):
            for alias in node.names:
                local_name = alias.asname or alias.name
                imported_from_dependencies[local_name] = alias.name
    return imported_from_dependencies


def _collect_used_dependency_symbols(
    tree: ast.AST, imported_from_dependencies: dict[str, str]
) -> set[str]:
    used_symbols: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.arg) and isinstance(node.annotation, ast.Name):
            symbol = imported_from_dependencies.get(node.annotation.id)
            if symbol:
                used_symbols.add(symbol)
        if isinstance(node, ast.Call):
            depends_target = _extract_depends_reference(node)
            if depends_target:
                symbol = imported_from_dependencies.get(depends_target)
                if symbol:
                    used_symbols.add(symbol)
    return used_symbols


def _resolve_seed_get_functions(
    *,
    used_symbols: set[str],
    alias_to_get: dict[str, str],
    defined_get_functions: set[str],
) -> tuple[set[str], list[str]]:
    seed_get_functions: set[str] = set()
    errors: list[str] = []

    for symbol in sorted(used_symbols):
        if symbol.endswith("ServiceDep"):
            dep_fn = alias_to_get.get(symbol)
            if dep_fn is None:
                errors.append(
                    f"Router uses '{symbol}' but it does not map to Depends(get_...) in dependencies.py"
                )
                continue
            if dep_fn not in defined_get_functions:
                errors.append(
                    f"Router uses '{symbol}' -> '{dep_fn}', but '{dep_fn}' is not defined"
                )
                continue
            seed_get_functions.add(dep_fn)
            continue

        if symbol.startswith("get_"):
            if symbol not in defined_get_functions:
                errors.append(f"Router uses '{symbol}' but no such function exists")
                continue
            seed_get_functions.add(symbol)

    return seed_get_functions, errors


def _expand_reachable_get_functions(
    *,
    seed_get_functions: set[str],
    get_to_get: dict[str, set[str]],
    defined_get_functions: set[str],
) -> set[str]:
    reachable_get: set[str] = set()
    queue = deque(seed_get_functions)
    while queue:
        function_name = queue.popleft()
        if function_name in reachable_get:
            continue
        reachable_get.add(function_name)
        for downstream in get_to_get.get(function_name, set()):
            if downstream in defined_get_functions and downstream not in reachable_get:
                queue.append(downstream)
    return reachable_get


def _collect_unreachable_seed_errors(
    seed_get_functions: set[str], reachable_get: set[str]
) -> list[str]:
    errors: list[str] = []
    for function_name in sorted(seed_get_functions):
        if function_name not in reachable_get:
            errors.append(
                f"Dependency function '{function_name}' is not reachable from router dependency graph"
            )
    return errors


def _collect_import_references(
    *,
    tree: ast.AST,
    module_name: str,
    modules: dict[str, Path],
    reverse_refs: dict[str, set[str]],
) -> None:
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                target = alias.name
                if target in modules:
                    reverse_refs[target].add(module_name)
            continue

        if not isinstance(node, ast.ImportFrom) or not node.module:
            continue

        base = node.module
        if base in modules:
            reverse_refs[base].add(module_name)

        for alias in node.names:
            if alias.name == "*":
                continue
            target = f"{base}.{alias.name}"
            if target in modules:
                reverse_refs[target].add(module_name)


def validate_service_references(
    all_modules: dict[str, Path],
    reverse_refs: dict[str, set[str]],
) -> list[str]:
    """Ensure service modules have production references, not tests-only usage."""
    errors: list[str] = []

    for module_name, module_path in sorted(all_modules.items()):
        if not module_name.startswith("src.services."):
            continue
        if module_name.endswith(".__init__"):
            continue
        if any(
            module_name.startswith(prefix) for prefix in SERVICE_MODULE_EXCLUDE_PREFIXES
        ):
            continue
        if module_name in SERVICE_MODULE_ALLOWLIST:
            continue

        referrers = {
            ref for ref in reverse_refs.get(module_name, set()) if ref != module_name
        }
        prod_referrers = sorted(ref for ref in referrers if ref.startswith("src."))
        test_referrers = sorted(ref for ref in referrers if ref.startswith("tests."))

        if not prod_referrers and test_referrers:
            errors.append(
                f"{module_name} is only referenced by tests ({', '.join(test_referrers[:3])})"
            )
        elif not prod_referrers and not test_referrers:
            errors.append(
                f"{module_name} is not referenced by production code or tests"
            )

        # Ensure file still exists in expected location.
        if not module_path.exists():
            errors.append(f"Indexed module path missing on disk: {module_path}")

    return errors


def main() -> int:
    """Run checks and exit non-zero on violations."""
    src_modules = build_module_index(SRC_DIR)
    test_modules = build_module_index(TESTS_DIR) if TESTS_DIR.exists() else {}
    all_modules = {**src_modules, **test_modules}

    alias_to_get, get_to_get, defined_get_functions = parse_dependencies(
        DEPENDENCIES_PATH
    )
    used_symbols = parse_router_dependency_usage(API_DIR)

    errors: list[str] = []
    errors.extend(
        validate_router_dep_resolution(
            used_symbols,
            alias_to_get,
            get_to_get,
            defined_get_functions,
        )
    )

    reverse_refs = collect_module_references(all_modules)
    errors.extend(validate_service_references(src_modules, reverse_refs))

    if errors:
        print("Service reachability check failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Service reachability check passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
