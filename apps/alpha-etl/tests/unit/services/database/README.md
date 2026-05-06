# Database Tests

Unit tests for database service layer.

## Running

```bash
pnpm test tests/unit/services/database/
```

## Test Coverage

- Writer batch upsert, validation, connection pooling
- Error handling, data integrity

## Mock Strategy

- `database.js` — Pool client
- `logger.js` — Structured logging
- `environment.js` — Config
