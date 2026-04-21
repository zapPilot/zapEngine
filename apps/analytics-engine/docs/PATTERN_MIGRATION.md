# Regex Pattern Migration for Simple Regime Strategy

## Overview

This document describes the migration of the Simple Regime Rebalance Strategy from tuple-based pattern matching to regex-based pattern matching, completed in January 2026.

## Motivation: Why Regex Patterns?

### Problem with Tuple-Based Patterns

The original system used exact tuple matching:
```python
SIMPLE_REGIME_RULES_3 = {
    ("fear", "fear", "neutral"): {"allocation": "heavy_spot", "reason": ""},
    # ... 35 total patterns
}
```

**Limitations:**
- **Fixed length only**: Cannot match "any number of fear followed by neutral"
- **Rigid matching**: Every regime must be explicitly listed
- **Limited expressiveness**: Complex sequences require many redundant patterns
- **Maintenance burden**: Adding variable-length patterns requires exponential pattern growth

### Solution: Regex Patterns

Regex patterns enable variable-length matching:
```python
SIMPLE_REGIME_PATTERNS = [
    {
        "pattern": r"(^|\|\|)(fear\|\|){2,}neutral$",  # Matches 2+ fears followed by neutral
        "allocation": "heavy_spot",
        "reason": "Extended fear period, accumulate"
    }
]
```

**Benefits:**
- **Variable-length matching**: `(fear\|\|){2,}` matches 2 or more fears
- **Pattern reuse**: One regex can replace multiple tuple patterns
- **Future extensibility**: Enables complex sequence detection as strategies evolve
- **Maintainability**: Fewer patterns to manage

## Migration Process

### Historical Automated Conversion Tool

A one-off migration tool was created to convert existing tuple patterns to
regex. It is no longer kept in `scripts/`; this section documents the completed
conversion process for historical context.

**Conversion algorithm:**
1. Escape special regex characters in regime names using `re.escape()`
2. Join regimes with escaped delimiter `"\|\|"`
3. Add end-anchor `$` to match end of history
4. Wrap with start anchor `(^|\|\|)` for end-matching patterns
5. Validate that converted pattern compiles successfully

**Example conversions:**
- `("fear", "fear", "neutral")` → `r"(^|\|\|)fear\|\|fear\|\|neutral$"`
- `("greed", "extreme_greed")` → `r"(^|\|\|)greed\|\|extreme_greed$"`

### Golden Dataset Verification

**Critical Step:** 100% behavioral compatibility was verified before deployment.

**Verification Process:**
1. **Capture baseline:** Generate golden dataset with 180 test cases covering all edge cases using the OLD tuple-based system
2. **Convert patterns:** Run migration tool to generate regex patterns
3. **Verify behavior:** Run SAME 180 test cases through NEW regex-based system
4. **Compare results:** Assert 100% match on allocation, hold, and reason fields

**Verification Results:**
- **Test file:** `tests/services/backtesting/test_pattern_migration.py`
- **Test cases:** 180 (diverse regime histories from length 0 to 100)
- **Match rate:** 100% (0 mismatches)
- **Patterns verified:** All 39 patterns (35 3-regime + 4 2-regime)
- **Status:** ✅ VERIFIED SAFE - No behavioral regressions

## Pattern Format Reference

### New Format: `SIMPLE_REGIME_PATTERNS`

```python
SIMPLE_REGIME_PATTERNS: list[dict[str, Any]] = [
    {
        "pattern": r"(^|\|\|)fear\|\|neutral$",  # Regex pattern
        "allocation": "heavy_spot",  # Target allocation state (mutually exclusive with 'hold')
        "reason": "Fear easing, accumulate"  # Human-readable explanation
    },
    {
        "pattern": r"(^|\|\|)neutral\|\|neutral\|\|neutral$",
        "hold": True,  # Maintain current allocation (mutually exclusive with 'allocation')
        "reason": ""
    }
]
```

### Pattern Authoring Guide

**Delimiter:** `||` (escaped as `\|\|` in regex)

**Allowed Syntax:**
- Basic quantifiers: `+`, `*`, `?`, `{n,m}` (e.g., `(fear\|\|){2,}`)
- Grouping: `(...)`
- Regime names from `REGIME_ORDER`: `extreme_fear`, `fear`, `neutral`, `greed`, `extreme_greed`

**Forbidden Syntax** (validation will reject these):
- Lookaheads/lookbehinds: `(?=...)`, `(?!...)`, `(?<=...)`, `(?<!...)`
- Backreferences: `\1`, `\2`, etc.
- Alternation: `|` (create separate patterns instead)
  - Exception: Anchor group `(^|\|\|)` is permitted for end-matching

**Anchoring:**
- **End-anchored (recommended):** `(^|\|\|)pattern$` - Matches pattern at end of history
- **Exact match:** `^pattern$` - Matches entire history exactly
- **Start-anchored:** `^pattern` - Matches pattern at start of history

### Pattern Matching Rules

1. **Longest match wins:** If multiple patterns match, the pattern with the longest match is selected
2. **Tie-breaker:** For equal-length matches, the first-defined pattern in `SIMPLE_REGIME_PATTERNS` wins
3. **No match:** Returns `None` if no pattern matches (strategy maintains current allocation)

## Implementation Details

### File Changes

| File | Change | Status |
|------|--------|--------|
| `src/services/backtesting/constants.py` | Replaced `SIMPLE_REGIME_RULES_3` and `SIMPLE_REGIME_RULES_2` with `SIMPLE_REGIME_PATTERNS` | ✅ Done |
| `src/services/backtesting/strategies/simple_regime_orchestration.py` | Refactored `_match_pattern()` to use regex matching | ✅ Done |
| `tests/services/backtesting/test_pattern_migration.py` | Added golden dataset verification (11 tests) | ✅ Done |
| Historical conversion script | Created one-off migration tool | ✅ Done |
| `tests/fixtures/regime_patterns_golden.json` | Captured baseline behavior (180 test cases) | ✅ Done |

### Performance Characteristics

**Pattern Compilation:**
- Patterns compiled once at strategy initialization (not per-day)
- Compilation time: O(n) where n = number of patterns (39 patterns)
- Memory: ~5KB for 39 compiled patterns

**Pattern Matching:**
- Time complexity: O(n×m) where n = number of patterns, m = average history length
- Space complexity: O(1) (in-place matching)
- Measured performance: ~0.77ms per day for 39 patterns (252-day backtest)

**Note:** Performance is slower than the original O(1) dict lookup, but acceptable for backtesting (not hot path). If performance becomes an issue, consider:
- Caching match results
- Pattern ordering optimization (most common patterns first)
- Pattern compilation at module level

## Rollback Procedure

If issues are discovered with regex matching, rollback is straightforward:

### Option 1: Git Revert (Recommended)

```bash
# Find the regex migration commit
git log --oneline --grep="regex pattern"

# Revert the specific commits (in reverse order)
git revert <commit-sha-task-7>  # Golden dataset verification
git revert <commit-sha-task-6>  # Performance benchmarks
git revert <commit-sha-task-5>  # Integration tests
git revert <commit-sha-task-4>  # Validation and error handling
git revert <commit-sha-task-3>  # Regex matching implementation
git revert <commit-sha-task-2>  # Pattern storage refactor
git revert <commit-sha-task-1>  # Migration tool
git revert <commit-sha-task-0>  # Golden dataset creation

# Or revert the entire range (verify commits first!)
git revert <first-migration-commit>^..<last-migration-commit>
```

### Option 2: Manual Rollback

The original tuple patterns are preserved in git history:

```bash
# View the tuple-based patterns
git show <pre-migration-commit>:src/services/backtesting/constants.py > constants_backup.py

# Extract the SIMPLE_REGIME_RULES_3 and SIMPLE_REGIME_RULES_2 sections
# Restore them to constants.py

# Revert the _match_pattern() method
git show <pre-migration-commit>:src/services/backtesting/strategies/simple_regime_orchestration.py > strategy_backup.py

# Extract the _match_pattern() method and restore
```

### Verification After Rollback

```bash
# Run the same golden dataset verification
pytest tests/services/backtesting/test_pattern_migration.py -v

# Expected: Should still show 100% match (behavior preserved)
```

## Migration Timeline

| Date | Task | Status |
|------|------|--------|
| 2026-01-24 | Create golden dataset (180 test cases) | ✅ Complete |
| 2026-01-24 | Build tuple-to-regex migration tool | ✅ Complete |
| 2026-01-24 | Refactor pattern storage to regex format | ✅ Complete |
| 2026-01-24 | Implement regex pattern matching logic | ✅ Complete |
| 2026-01-24 | Add pattern validation and error handling | ✅ Complete |
| 2026-01-24 | Integration testing (full backtest) | ✅ Complete |
| 2026-01-24 | Performance benchmarking | ✅ Complete |
| 2026-01-25 | Golden dataset verification (100% match) | ✅ Complete |
| 2026-01-25 | Documentation and cleanup | ✅ Complete |

## Future Enhancements

With regex patterns now in place, future improvements are possible:

### Potential New Features

1. **Complex Sequence Detection:**
   - "3 consecutive fears followed by any neutral period" → `(fear\|\|){3}(neutral\|\|)+`
   - "Alternating fear/greed cycles" → `(fear\|\|greed\|\|){2,}`

2. **Momentum Patterns:**
   - "Accelerating fear (extreme_fear → fear → neutral)" → `extreme_fear\|\|fear\|\|neutral$`
   - "Sustained greed (3+ greed periods)" → `(greed\|\|){3,}$`

3. **Drift Detection:**
   - "Regime instability (4+ changes in 10 days)" → Requires history window analysis

### Migration to Advanced Patterns

When ready to add variable-length patterns:

1. Add new pattern to `SIMPLE_REGIME_PATTERNS`
2. Validate with `validate_pattern_syntax()`
3. Test with diverse histories
4. Update golden dataset if behavior changes intentionally

## References

- **Migration Tool:** one-off historical conversion script (removed after migration)
- **Golden Dataset:** `tests/fixtures/regime_patterns_golden.json`
- **Verification Tests:** `tests/services/backtesting/test_pattern_migration.py`
- **Pattern Constants:** `src/services/backtesting/constants.py`
- **Strategy Implementation:** `src/services/backtesting/strategies/simple_regime_orchestration.py`
- **Pattern Authoring Guide:** See `_match_pattern()` docstring in strategy file

## Questions?

For questions about this migration, see:
- Pattern authoring examples in `_match_pattern()` docstring
- Test cases in `tests/services/backtesting/test_simple_regime_patterns.py`
- Integration examples in `tests/services/backtesting/test_simple_regime_integration.py`
