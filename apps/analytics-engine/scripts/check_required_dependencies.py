#!/usr/bin/env python3
"""Fail fast when required dependency contracts drift."""

from __future__ import annotations

import sys
import tomllib
from pathlib import Path
from typing import Any

REQUIRED_DEP = "psycopg2-binary"
ROOT = Path(__file__).resolve().parents[1]
PYPROJECT_PATH = ROOT / "pyproject.toml"
LOCK_PATH = ROOT / "uv.lock"


def _report_failures(failures: list[str]) -> int:
    print("Dependency contract check failed:", file=sys.stderr)
    for failure in failures:
        print(f"- {failure}", file=sys.stderr)
    return 1


def _has_required_dep_in_pyproject() -> bool:
    data = tomllib.loads(PYPROJECT_PATH.read_text(encoding="utf-8"))
    dependencies = data.get("project", {}).get("dependencies", [])
    if not isinstance(dependencies, list):
        return False

    for dep in dependencies:
        if isinstance(dep, str) and dep.strip().startswith(REQUIRED_DEP):
            return True
    return False


def _has_required_dep_in_lock() -> bool:
    lock_data = tomllib.loads(LOCK_PATH.read_text(encoding="utf-8"))
    packages = lock_data.get("package")
    if not isinstance(packages, list):
        return False

    app_package = _find_app_package(packages)
    if app_package is None:
        return False

    dependencies = app_package.get("dependencies")
    if not isinstance(dependencies, list):
        return False

    for dependency in dependencies:
        if not isinstance(dependency, dict):
            continue
        name = dependency.get("name")
        if isinstance(name, str) and name == REQUIRED_DEP:
            return True
    return False


def _find_app_package(packages: list[object]) -> dict[str, Any] | None:
    for package in packages:
        if not isinstance(package, dict):
            continue
        name = package.get("name")
        if isinstance(name, str) and name == "analytics-engine":
            return package
    return None


def main() -> int:
    failures: list[str] = []

    if not PYPROJECT_PATH.exists():
        failures.append(f"missing file: {PYPROJECT_PATH}")
    if not LOCK_PATH.exists():
        failures.append(f"missing file: {LOCK_PATH}")

    if failures:
        return _report_failures(failures)

    if not _has_required_dep_in_pyproject():
        failures.append(
            "pyproject.toml: [project].dependencies must include 'psycopg2-binary'"
        )

    if not _has_required_dep_in_lock():
        failures.append(
            "uv.lock: analytics-engine dependencies must include '{ name = \"psycopg2-binary\" }'"
        )

    if failures:
        return _report_failures(failures)

    print("Dependency contract check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
