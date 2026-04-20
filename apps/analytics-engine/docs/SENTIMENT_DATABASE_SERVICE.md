# SentimentDatabaseService

## Overview

`SentimentDatabaseService` provides read-only access to market sentiment snapshots stored in the `alpha_raw.sentiment_snapshots` database table. This replaces external API calls to the alternative.me Fear & Greed Index, with data collected by alpha-etl every 10 minutes.

**File:** `src/services/sentiment_database_service.py`
**Tests:** `tests/services/test_sentiment_database_service.py` (31 test cases)

## Key Design Principles

1. **Database-First**: All data comes from `alpha_raw.sentiment_snapshots` table
2. **Always Cached**: All responses have `cached=True` (data is pre-fetched and stored)
3. **Timezone-Aware**: All timestamps are converted to UTC
4. **Error Resilient**: Graceful handling of malformed rows and database errors
5. **Comprehensive Logging**: All operations logged at INFO/ERROR levels

## Database Schema

```sql
CREATE TABLE alpha_raw.sentiment_snapshots (
    id UUID PRIMARY KEY,
    sentiment_value INTEGER NOT NULL,        -- 0-100 Fear & Greed Index
    classification TEXT NOT NULL,             -- e.g., 'Fear', 'Greed'
    source TEXT NOT NULL,                     -- Always 'alternative.me'
    snapshot_time TIMESTAMPTZ NOT NULL,      -- UTC timestamp of snapshot
    raw_data JSONB,                           -- Original API response
    created_at TIMESTAMPTZ NOT NULL           -- When record was created
);
```

## Usage

### Basic Initialization

```python
from src.services.sentiment_database_service import SentimentDatabaseService

service = SentimentDatabaseService(db)
current = await service.get_current_sentiment()
history = await service.get_sentiment_history(hours=24)
```

### FastAPI Integration

```python
from fastapi import Depends
from src.core.database import get_db

@app.get("/api/sentiment/current")
async def get_current_sentiment(db = Depends(get_db)):
    return await SentimentDatabaseService(db).get_current_sentiment()
```

### Service Integration

```python
from src.services.landing_page_service import LandingPageService

landing_service = LandingPageService(
    db=db,
    sentiment_service=SentimentDatabaseService(db)
)
landing_page = await landing_service.build_landing_page()
```

## API Methods

### `get_current_sentiment() -> MarketSentimentResponse`

Returns the most recent sentiment snapshot. Raises `InternalError` (500) if no data available.

**Query:** `SELECT ... ORDER BY snapshot_time DESC LIMIT 1`

### `get_sentiment_history(hours: int = 24) -> list[MarketSentimentResponse]`

Returns snapshots from the last N hours (default 24). ~144 rows per day (10-min intervals).

**Query:** Time-range query on `snapshot_time` with `source = 'alternative.me'`

**Raises:** `ValueError` if hours < 1; `InternalError` (500) on DB error

### `get_sentiment_at_time(target_time: datetime) -> MarketSentimentResponse | None`

Returns snapshot closest to the specified time (within 24-hour window). Returns `None` if no data found.

**Query:** Nearest-match query using `ABS(EXTRACT(EPOCH FROM ...))`

**Raises:** `ValueError` for invalid input; `InternalError` (500) on DB error

## Response Model

All methods return `MarketSentimentResponse` objects:

```python
class MarketSentimentResponse(BaseModel):
    value: int                          # 0-100 Fear & Greed Index
    status: str                         # e.g., 'Fear', 'Greed', 'Neutral'
    timestamp: datetime                 # ISO 8601 UTC timestamp
    source: str = "alternative.me"      # Always "alternative.me"
    cached: bool = True                 # Always True for database responses
```

## Timezone Handling

| Input Type | Behavior |
|------------|----------|
| Naive datetime | Assumed UTC |
| Non-UTC timezone | Auto-converted to UTC |
| Database timestamps | Already UTC from TIMESTAMPTZ |

All response timestamps have `tzinfo == UTC`.

## Error Handling

**Graceful Degradation:** Malformed rows in history queries are skipped with warnings.

| Error | Code | When |
|-------|------|------|
| `ValueError` | - | Invalid parameters |
| `InternalError` | 500 | DB failures, no data, transformation errors |

**Error Response:** `e.details['reason']` contains failure cause.

## Performance Considerations

### Query Performance

- **Current sentiment**: O(1) with index on `(source, snapshot_time DESC)`
- **History (24h)**: ~144 rows returned (10-min intervals)
- **History (1 week)**: ~1,008 rows returned (10-min intervals)
- **History (1 month)**: ~4,320 rows returned (10-min intervals)

### Recommended Indexes

```sql
-- Primary query optimization
CREATE INDEX idx_sentiment_snapshots_source_time
ON alpha_raw.sentiment_snapshots(source, snapshot_time DESC);

-- Time range queries
CREATE INDEX idx_sentiment_snapshots_time_range
ON alpha_raw.sentiment_snapshots(snapshot_time)
WHERE source = 'alternative.me';
```

### Caching Strategy

Use React Query with 5-10 min TTL since data updates every 10 minutes.

## Integration

Inject into `LandingPageService` or `DashboardService` as optional `sentiment_service` parameter. Dashboard auto-includes sentiment if service is provided.

## Testing

31 test cases covering: initialization, data validation, timezone handling, boundaries, error cases, edge cases.

```bash
pytest tests/services/test_sentiment_database_service.py -v  # Expected: 31 passed
```

## Logging

Operations logged at INFO/ERROR levels via standard Python logging. Set debug level:

```python
logging.getLogger('src.services.sentiment_database_service').setLevel(logging.DEBUG)
```

## Migration from External API

**Before:** `MarketSentimentService().get_market_sentiment()` → HTTP request  
**After:** `SentimentDatabaseService(db).get_current_sentiment()` → DB query

Both return the same `MarketSentimentResponse` model - no consumer changes needed.

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "No sentiment data" | Empty table | Check alpha-etl is running |
| Connection timeout | Pool issues | Check pool settings; enable debug logging |
| Empty history | No data in range | Verify alpha-etl was running |

**Debug SQL:**
```sql
SELECT COUNT(*), MAX(snapshot_time) FROM alpha_raw.sentiment_snapshots 
WHERE source = 'alternative.me';
```

## Related Files

- **Models:** `src/models/market_sentiment.py` (MarketSentimentResponse)
- **Exceptions:** `src/exceptions/market_sentiment.py` (InternalError)
- **Database:** `src/core/database.py` (session management)
- **External API Service:** `src/services/market_sentiment_service.py` (legacy)
- **Tests:** `tests/services/test_sentiment_database_service.py`
