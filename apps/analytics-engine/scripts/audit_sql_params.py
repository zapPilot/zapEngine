#!/usr/bin/env python3
"""Audit SQL parameter naming consistency.

Checks all SQL files for consistent :snake_case parameter naming.
Any violations (camelCase, PascalCase, kebab-case) are reported.

Usage:
    python scripts/audit_sql_params.py

Output:
    ✓ file.sql: param1, param2, param3  (no violations)
    ✗ file.sql: validParam, BadParam    (violations found)
      Violations: validParam, BadParam
"""

import re
from pathlib import Path

SQL_DIR = Path("src/queries/sql")
PARAM_PATTERN = r":([a-z_][a-z0-9_]*)"


def audit_sql_files():
    """Audit all SQL files for parameter naming violations."""
    total_files = 0
    total_violations = 0
    all_violations = []

    print("=" * 80)
    print("SQL Parameter Naming Audit")
    print("=" * 80)
    print(f"Directory: {SQL_DIR}")
    print("Pattern: :snake_case (lowercase with underscores)")
    print("=" * 80)
    print()

    for sql_file in sorted(SQL_DIR.glob("*.sql")):
        total_files += 1
        with open(sql_file) as f:
            content = f.read()

        # Extract all parameter names
        params = set(re.findall(PARAM_PATTERN, content))

        # Check for violations
        violations = [
            p
            for p in params
            if not p.islower() or "-" in p or any(c.isupper() for c in p)
        ]

        # Report results
        status = "✓" if not violations else "✗"
        param_list = ", ".join(sorted(params)) if params else "(no parameters)"

        print(f"{status} {sql_file.name}")
        print(f"  Parameters: {param_list}")

        if violations:
            total_violations += len(violations)
            print(f"  ❌ Violations: {', '.join(sorted(violations))}")
            all_violations.extend([(sql_file.name, v) for v in violations])
        print()

    # Summary
    print("=" * 80)
    print("AUDIT SUMMARY")
    print("=" * 80)
    print(f"Total files scanned: {total_files}")
    print(f"Files with violations: {len(all_violations)}")
    print(f"Total violations: {total_violations}")

    if total_violations == 0:
        print()
        print("✅ SUCCESS: All SQL files use consistent :snake_case parameters!")
    else:
        print()
        print("❌ VIOLATIONS FOUND:")
        for file, param in all_violations:
            print(f"   - {file}: :{param}")
        print()
        print("Fix these violations to match :snake_case convention")

    return total_violations


if __name__ == "__main__":
    violations = audit_sql_files()
    exit(0 if violations == 0 else 1)
