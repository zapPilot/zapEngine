# Database Tests

Unit tests for database service layer.

## Running

```bash
pnpm test tests/unit/services/database/
```

## Test Coverage

- `poolWriter.test.ts` — 99% coverage
- Batch upsert, validation, connection pooling
- Query methods: `getPoolsByIds`, `getPoolById`, `getTableStats`
- Error handling, data integrity

## Mock Strategy

- `database.js` — Pool client
- `logger.js` — Structured logging
- `environment.js` — Config