"""
Simple duplicate code detector.

This script detects duplicate code blocks across Python files (services, core, models).
It's used as a workaround for the pylint 4.x duplicate-code detection bug.

IMPORTANT: Not all duplicates should be "fixed":
- ✅ Logic duplication (algorithms, business rules): SHOULD be consolidated
- ✅ Boilerplate without justification (repeated __init__ patterns): SHOULD be consolidated
- ❌ Import statements: ACCEPTABLE and should NOT be consolidated
  - Explicit imports are Python best practice
  - Self-documenting module dependencies
  - Prevents circular dependencies
  - No performance penalty (Python caches imports)

As of the latest refactoring:
- Removed redundant __init__ methods from 3 services (now inherit from base class)
- Kept __init__ in 2 services that need additional initialization (CategoryDataTransformer)
- Remaining import duplicates are EXPECTED and CORRECT
"""

import sys
from pathlib import Path

# Patterns to ignore - acceptable architectural duplicates
IGNORE_PATTERNS = [
    "services/interfaces/",  # Protocol definitions (interface contracts)
    "yield_summary_service.py",  # Contains _NullQueryService stub implementation
    "token_price_service.py",  # DB-backed service with session DI
    "sentiment_database_service.py",  # DB-backed service with session DI
    "regime_tracking_service.py",  # DB-backed service with session DI
    "backtesting/strategies/",  # Template Method pattern (base class hooks)
    "backtesting/execution/pacing/",  # Pacing policies with similar imports (refactored to base class)
    "backtesting/tactics/rules/",  # Explicit Rule protocol implementations share the same class shape
]


def get_code_lines(filepath):
    """Get non-empty, non-comment lines from a file."""
    with open(filepath) as f:
        lines = []
        in_import_block = False
        import_paren_depth = 0
        for line in f:
            stripped = line.strip()
            # Skip empty lines and comments
            if not stripped or stripped.startswith("#"):
                continue

            # Skip import blocks entirely; import duplication is acceptable.
            if in_import_block:
                import_paren_depth += line.count("(") - line.count(")")
                if import_paren_depth <= 0 and not stripped.endswith("\\"):
                    in_import_block = False
                    import_paren_depth = 0
                continue

            if stripped.startswith("import ") or stripped.startswith("from "):
                import_paren_depth = line.count("(") - line.count(")")
                in_import_block = import_paren_depth > 0 or stripped.endswith("\\")
                continue

            lines.append(stripped)
        return lines


def find_duplicates(files, min_lines=7):
    """Find duplicate sequences across files."""
    file_lines = {}
    for filepath in files:
        file_lines[filepath] = get_code_lines(filepath)

    duplicates = []

    # Compare each pair of files
    for f1_path in files:
        for f2_path in files:
            if f1_path >= f2_path:  # Avoid duplicate comparisons
                continue

            f1_lines = file_lines[f1_path]
            f2_lines = file_lines[f2_path]

            # Find matching sequences
            for i in range(len(f1_lines) - min_lines + 1):
                for j in range(len(f2_lines) - min_lines + 1):
                    # Check for exact match
                    match_len = 0
                    while (
                        i + match_len < len(f1_lines)
                        and j + match_len < len(f2_lines)
                        and f1_lines[i + match_len] == f2_lines[j + match_len]
                    ):
                        match_len += 1

                    if match_len >= min_lines:
                        dup = {
                            "file1": f1_path,
                            "line1": i + 1,
                            "file2": f2_path,
                            "line2": j + 1,
                            "length": match_len,
                            "code": f1_lines[i : i + min(match_len, 10)],
                        }
                        duplicates.append(dup)

    return duplicates


def should_ignore_duplicate(dup):
    """Check if duplicate matches ignore patterns.

    Args:
        dup: Duplicate dict with 'file1' and 'file2' keys

    Returns:
        True if duplicate should be ignored, False otherwise
    """
    for pattern in IGNORE_PATTERNS:
        if pattern in dup["file1"] or pattern in dup["file2"]:
            return True
    return False


def collect_target_files() -> list[Path]:
    """
    Collect python files to scan for duplication.

    Coverage is intentionally broader than just *_service.py to catch
    copy/paste across shared helpers and aggregators, while still keeping
    scope limited to production code (no tests).
    """
    source_dirs = [
        Path("src/services"),
        Path("src/core"),
        Path("src/models"),
    ]

    files: list[Path] = []
    for directory in source_dirs:
        for file in directory.rglob("*.py"):
            # Skip package markers and cache artifacts
            if file.name.startswith("__") or file.name.endswith(".pyc"):
                continue
            files.append(file)
    return files


if __name__ == "__main__":
    target_files = collect_target_files()

    print(f"Checking {len(target_files)} files for duplicates...")
    print(f"Files: {[f.name for f in target_files]}\n")

    all_duplicates = find_duplicates([str(f) for f in target_files], min_lines=7)

    # Separate ignored from actionable duplicates
    ignored_duplicates = [d for d in all_duplicates if should_ignore_duplicate(d)]
    actionable_duplicates = [
        d for d in all_duplicates if not should_ignore_duplicate(d)
    ]

    # Report results
    if actionable_duplicates:
        print(f"Found {len(actionable_duplicates)} actionable duplicate code blocks")
        if ignored_duplicates:
            print(
                f"({len(ignored_duplicates)} duplicates ignored - protocol patterns)\n"
            )
        else:
            print()

        for i, dup in enumerate(actionable_duplicates[:10], 1):  # Show first 10
            print(
                f"{i}. {dup['file1']}:{dup['line1']} <--> {dup['file2']}:{dup['line2']}"
            )
            print(f"   Length: {dup['length']} lines")
            print("   Sample code:")
            for line in dup["code"][:5]:
                print(f"      {line}")
            print()
        sys.exit(1)
    else:
        if ignored_duplicates:
            print(
                f"✓ No actionable duplicates found ({len(ignored_duplicates)} ignored - protocol patterns)"
            )
        else:
            print("✓ No duplicates found with threshold of 7 lines")
        sys.exit(0)
