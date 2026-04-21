# Analytics Engine Coding Standards

This document defines coding standards and best practices for the Analytics Engine codebase.

## SQL Query Standards

### Parameter Naming

**Convention**: All SQL parameters must use `:snake_case` (lowercase with underscores)

**Valid Examples**:
- `:user_id` ✅
- `:start_date` ✅
- `:end_date` ✅
- `:wallet_address` ✅
- `:min_value_usd` ✅

**Invalid Examples**:
- `:userId` ❌ (camelCase)
- `:StartDate` ❌ (PascalCase)
- `:user-id` ❌ (kebab-case)
- `:USER_ID` ❌ (SCREAMING_CASE)

### Verification

Run the SQL parameter audit to verify compliance:

```bash
uv run python scripts/quality/audit_sql_params.py
```

**Current Status** (as of January 2025):
- ✅ All 11 SQL files compliant
- ✅ Zero violations found
- ✅ 100% adherence to `:snake_case` convention

See `docs/sql_parameter_audit.md` for detailed audit results.

---

## Python Method Naming Standards

### Private Method Naming Convention

Private methods (starting with `_`) should use **clear action verbs** that indicate their purpose. The codebase uses these established patterns:

#### Data Operations
| Prefix | Purpose | Example |
|--------|---------|---------|
| `_get_*` | Retrieves data from database/cache | `_get_drawdown_base_data()` |
| `_fetch_*` | Fetches data from external sources | `_fetch_wallet_summary()` |
| `_load_*` | Loads configuration or resources | `_load_queries()` |
| `_execute_*` | Executes database queries | `_execute_query()` |

#### Construction & Transformation
| Prefix | Purpose | Example |
|--------|---------|---------|
| `_build_*` | Constructs response objects | `_build_empty_response()` |
| `_create_*` | Creates new instances | `_create_service()` |
| `_transform_*` | Transforms data format | `_transform_response()` |
| `_convert_*` | Converts between types | `_convert_to_percentage()` |
| `_coerce_*` | Type coercion | `_coerce_wallet_summary()` |

#### Calculations & Processing
| Prefix | Purpose | Example |
|--------|---------|---------|
| `_calculate_*` | Performs calculations | `_calculate_trend_summary()` |
| `_compute_*` | Computes derived values | `_compute_financials()` |
| `_aggregate_*` | Aggregates multiple values | `_aggregate_daily_totals()` |
| `_normalize_*` | Normalizes data | `_normalize_filter()` |

#### Validation & Selection
| Prefix | Purpose | Example |
|--------|---------|---------|
| `_validate_*` | Validates data integrity | `_validate_snapshot_totals()` |
| `_ensure_*` | Ensures preconditions | `_ensure_aggregates()` |
| `_select_*` | Selects from options | `_select_recommended()` |
| `_choose_*` | Chooses best option | `_choose_lowest_positive()` |
| `_filter_*` | Filters data | `_filter_outliers()` |
| `_evaluate_*` | Evaluates conditions | `_evaluate_windows()` |

#### Utilities & Helpers
| Prefix | Purpose | Example |
|--------|---------|---------|
| `_format_*` | Formats output | `_format_period_info()` |
| `_parse_*` | Parses input | `_parse_windows()` |
| `_prepare_*` | Prepares data/resources | `_prepare_query()` |
| `_handle_*` | Handles errors/events | `_handle_timeout_error()` |
| `_apply_*` | Applies transformations | `_apply_wallet_override()` |
| `_store_*` | Stores data | `_store_in_cache()` |
| `_perform_*` | Performs operations | `_perform_cache_operation()` |
| `_cache_*` | Cache operations | `_cache_key()` |

#### Special Patterns
| Pattern | Purpose | Example |
|---------|---------|---------|
| `_with_*` | Context/wrapper methods | `_with_cache()`, `_with_async_cache()` |
| `_safe_*` | Safe operations with fallbacks | `_safe_call()`, `_safe_float()` |
| `_empty_*` | Empty/default constructors | `_empty_wallet_summary()` |
| `_default_*` | Default values | `_default_period()` |

**Audit Results** (January 2025):
- ✅ 64 methods follow established patterns
- ✅ 29 methods use clear action verbs (compute, aggregate, normalize, etc.)
- ✅ 93 total private methods - 100% clarity and consistency

### Examples from Codebase

**Data Retrieval**:
```python
def _get_daily_returns_base_data(self, user_id: UUID, days: int) -> list[dict[str, Any]]:
    """Retrieve daily returns data from database."""
    ...

def _get_drawdown_base_data(self, user_id: UUID, days: int) -> list[dict[str, Any]]:
    """Get base drawdown data shared across services."""
    ...
```

**Response Building**:
```python
def _build_allocation_timeseries(self, rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Build allocation timeseries response from query results."""
    ...

def _build_empty_response(self, user_id: UUID, days: int) -> dict[str, Any]:
    """Build empty response when no data available."""
    ...
```

**Calculations**:
```python
def _calculate_trend_summary(self, daily_values: list[dict[str, Any]]) -> dict[str, Any]:
    """Calculate trend summary statistics."""
    ...

def _calculate_aggregation_stats(self, data: list[dict[str, Any]]) -> dict[str, Any]:
    """Calculate aggregation statistics."""
    ...
```

---

## File Organization Standards

### Service Files

- Keep service files under 400 lines when possible
- Extract complex logic into separate utility classes or helper methods
- Use protocol-based interfaces for dependency injection

### Test Files

- Organize tests into directories: `unit/`, `integration/`, `regression/`
- Use descriptive test class names: `TestServiceName::test_method_name`
- Maintain minimum 90% code coverage

### SQL Files

- Add CTE organization section headers (see examples in existing SQL files)
- Document query purpose, parameters, and output in file header
- Group CTEs by logical sections: Input Filtering → Transformation → Aggregation → Final Projection

---

## Quality Gates

All code must pass these checks before merging:

```bash
make format      # Auto-format with ruff
make lint        # Run ruff linting
make type-check  # Run mypy type checking
make test        # Run pytest with coverage
```

**Minimum Standards**:
- ✅ Zero linting errors
- ✅ Zero type checking errors
- ✅ 90%+ test coverage
- ✅ All tests passing

---

## References

- SQL Parameter Audit: `docs/sql_parameter_audit.md`
- Project Architecture: `CLAUDE.md`
- Development Commands: `Makefile`
