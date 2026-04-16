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
from sqlalchemy.orm import Session
from src.services.sentiment_database_service import SentimentDatabaseService

# Get database session from dependency injection
def get_sentiment_data(db: Session):
    service = SentimentDatabaseService(db)

    # Get current sentiment
    current = await service.get_current_sentiment()

    # Get historical data (last 24 hours)
    history = await service.get_sentiment_history(hours=24)
```

### With FastAPI Dependency Injection

```python
from fastapi import FastAPI, Depends
from src.core.database import get_db

app = FastAPI()

@app.get("/api/sentiment/current")
async def get_current_sentiment(db: Session = Depends(get_db)):
    service = SentimentDatabaseService(db)
    sentiment = await service.get_current_sentiment()
    return sentiment.model_dump()
```

### Integration with Landing Page Service

```python
from src.services.sentiment_database_service import SentimentDatabaseService
from src.services.landing_page_service import LandingPageService

async def get_landing_page(db: Session):
    sentiment_service = SentimentDatabaseService(db)
    landing_service = LandingPageService(db, sentiment_service=sentiment_service)

    return await landing_service.build_landing_page()
```

## API Methods

### `get_current_sentiment() -> MarketSentimentResponse`

Returns the most recent sentiment snapshot from the database.

**Query:**
```sql
SELECT * FROM alpha_raw.sentiment_snapshots
WHERE source = 'alternative.me'
ORDER BY snapshot_time DESC
LIMIT 1
```

**Example Response:**
```python
MarketSentimentResponse(
    value=45,
    status="Fear",
    timestamp=datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC),
    source="alternative.me",
    cached=True
)
```

**Raises:**
- `InternalError` (500): If no data available or database error occurs

### `get_sentiment_history(hours: int = 24) -> list[MarketSentimentResponse]`

Returns all sentiment snapshots from the last N hours, ordered by timestamp ascending.

**Query:**
```sql
SELECT * FROM alpha_raw.sentiment_snapshots
WHERE source = 'alternative.me'
  AND snapshot_time >= NOW() AT TIME ZONE 'UTC' - INTERVAL '{hours} hours'
ORDER BY snapshot_time ASC
```

**Parameters:**
- `hours` (int, default=24): Number of hours of history to retrieve (must be >= 1)

**Returns:**
- List of `MarketSentimentResponse` objects in chronological order
- Empty list if no data available

**Example:**
```python
# Get last 7 days of sentiment data
week_history = await service.get_sentiment_history(hours=168)

# Each snapshot every 10 minutes = ~1,008 snapshots per week
assert len(week_history) <= 1008
```

**Raises:**
- `ValueError`: If hours < 1
- `InternalError` (500): If database error occurs

### `get_sentiment_at_time(target_time: datetime) -> MarketSentimentResponse | None`

Returns the sentiment snapshot closest to the specified time (within 24-hour window).

**Query:**
```sql
SELECT * FROM alpha_raw.sentiment_snapshots
WHERE source = 'alternative.me'
  AND snapshot_time >= :target_time - INTERVAL '24 hours'
  AND snapshot_time <= :target_time + INTERVAL '24 hours'
ORDER BY ABS(EXTRACT(EPOCH FROM (snapshot_time - :target_time)))
LIMIT 1
```

**Parameters:**
- `target_time` (datetime): The time to find sentiment data for

**Returns:**
- `MarketSentimentResponse`: Closest sentiment snapshot
- `None`: If no data found within 24-hour window

**Example:**
```python
# Find sentiment at a specific point in time
from datetime import datetime, UTC

target = datetime(2025, 1, 15, 12, 30, 0, tzinfo=UTC)
sentiment = await service.get_sentiment_at_time(target)

if sentiment:
    print(f"Sentiment at {target}: {sentiment.value}")
else:
    print(f"No sentiment data found near {target}")
```

**Raises:**
- `ValueError`: If target_time is not a datetime or is invalid
- `InternalError` (500): If database error occurs

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

### Naive Datetimes

If a naive datetime is passed (no timezone info), it's assumed to be UTC:

```python
naive_time = datetime(2025, 1, 15, 12, 0, 0)  # No tzinfo
sentiment = await service.get_sentiment_at_time(naive_time)
# Treated as 2025-01-15 12:00:00 UTC
```

### Non-UTC Timezones

Non-UTC timezones are automatically converted to UTC:

```python
from datetime import datetime, timezone, timedelta

utc_plus_2 = timezone(timedelta(hours=2))
time_with_tz = datetime(2025, 1, 15, 14, 0, 0, tzinfo=utc_plus_2)

sentiment = await service.get_sentiment_at_time(time_with_tz)
# Converted to 2025-01-15 12:00:00 UTC
```

### Database Timestamps

All timestamps from the database are converted to UTC if not already:

```python
# Database stores TIMESTAMPTZ (timezone-aware)
# Service automatically converts to UTC for consistency
response = await service.get_current_sentiment()
assert response.timestamp.tzinfo == UTC  # Always true
```

## Error Handling

### Graceful Degradation

When processing historical data, malformed rows are skipped:

```python
# If one row has invalid sentiment_value (e.g., 150)
history = await service.get_sentiment_history(hours=24)
# Returns only valid rows, skips the malformed one
# Logs a warning for each skipped row
```

### Error Types

| Error | Status Code | When |
|-------|-------------|------|
| `ValueError` | None | Invalid parameters (hours < 1, wrong timestamp type) |
| `InternalError` | 500 | Database connection failure, no data available, transformation errors |

### Error Response Example

```python
try:
    sentiment = await service.get_current_sentiment()
except InternalError as e:
    # e.status_code == 500
    # e.error_code == "INTERNAL_ERROR"
    # e.details contains reason and additional info
    print(f"Failed: {e.details['reason']}")
```

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

Since this service returns database-sourced data, the application should:

1. Use React Query caching at the API layer
2. Set appropriate cache TTLs (e.g., 5-10 minutes) since data updates every 10 minutes
3. Avoid re-querying for current sentiment multiple times per request

```python
# In React Query
const useCurrentSentiment = () => {
  return useQuery({
    queryKey: ['sentiment', 'current'],
    queryFn: () => fetch('/api/sentiment/current').then(r => r.json()),
    staleTime: 5 * 60 * 1000,  // 5 minutes
    gcTime: 10 * 60 * 1000,     // 10 minutes
  })
}
```

## Integration with Other Services

### With LandingPageService

```python
from src.services.landing_page_service import LandingPageService

# Inject sentiment service as optional parameter
landing_service = LandingPageService(
    db=db,
    sentiment_service=SentimentDatabaseService(db)
)

landing_page = await landing_service.build_landing_page()
```

### With DashboardService

```python
from src.services.dashboard_service import DashboardService

dashboard_service = DashboardService(db)

# Dashboard automatically includes sentiment data if service is initialized
dashboard = await dashboard_service.get_dashboard(user_id)
```

## Testing

Comprehensive test suite with 31 test cases covering:

- Service initialization
- Data transformation and validation
- Timezone handling (naive, UTC, and other timezones)
- Sentiment value boundaries (0, 100, invalid ranges)
- Classification validation
- All query methods with success/failure scenarios
- Error handling and logging
- Edge cases (empty results, malformed data, large hour ranges)

Run tests:

```bash
cd analytics-engine
source .venv/bin/activate
pytest tests/services/test_sentiment_database_service.py -v
```

Expected output: **31 passed**

## Logging

All operations are logged at INFO or ERROR levels using Python's standard logging:

```python
import logging

logger = logging.getLogger(__name__)

# Example log messages
# "Querying database for current sentiment snapshot"
# "Current sentiment retrieved: value=45, status=Fear, timestamp=2025-01-15T12:00:00+00:00"
# "Querying sentiment history for last 24 hours"
# "Retrieved 144 sentiment snapshots from last 24 hours"
# "Database error during get_current_sentiment: connection timeout"
```

Configure logging level:

```python
import logging

logging.getLogger('src.services.sentiment_database_service').setLevel(logging.DEBUG)
```

## Migration from External API

### Before (Using alternative.me API)

```python
from src.services.market_sentiment_service import MarketSentimentService

service = MarketSentimentService()
sentiment = await service.get_market_sentiment()  # HTTP request to external API
```

### After (Using Database)

```python
from src.services.sentiment_database_service import SentimentDatabaseService

service = SentimentDatabaseService(db)
sentiment = await service.get_current_sentiment()  # Local database query
```

### Compatibility

Both services return the same `MarketSentimentResponse` model, so no changes needed in consumers:

```python
# Same response model
response: MarketSentimentResponse
print(f"Value: {response.value}")
print(f"Status: {response.status}")
print(f"Timestamp: {response.timestamp}")
print(f"Cached: {response.cached}")
```

## Troubleshooting

### "No sentiment data available in database"

**Cause:** No rows in `alpha_raw.sentiment_snapshots` table
**Solution:** Check alpha-etl is running and ingesting sentiment snapshots

```sql
SELECT COUNT(*) FROM alpha_raw.sentiment_snapshots
WHERE source = 'alternative.me';

SELECT MAX(snapshot_time) FROM alpha_raw.sentiment_snapshots
WHERE source = 'alternative.me';
```

### "Database error during get_sentiment_history: connection timeout"

**Cause:** Database connection pooling issue or long query
**Solution:** Check connection pool settings and query performance

```python
# Increase timeout for large history queries
import logging
logger = logging.getLogger('src.services.sentiment_database_service')
logger.setLevel(logging.DEBUG)  # See detailed error info
```

### Empty history results for valid time range

**Cause:** No snapshots collected during the requested period
**Solution:** Verify alpha-etl was running during the time range

```sql
SELECT DISTINCT source, COUNT(*) as count
FROM alpha_raw.sentiment_snapshots
WHERE snapshot_time >= NOW() - INTERVAL '7 days'
GROUP BY source;
```

## Related Files

- **Models:** `src/models/market_sentiment.py` (MarketSentimentResponse)
- **Exceptions:** `src/exceptions/market_sentiment.py` (InternalError)
- **Database:** `src/core/database.py` (session management)
- **External API Service:** `src/services/market_sentiment_service.py` (legacy)
- **Tests:** `tests/services/test_sentiment_database_service.py`
