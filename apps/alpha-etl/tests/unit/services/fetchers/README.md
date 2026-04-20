# Fetcher Tests

This directory contains comprehensive unit tests for the DeFi data fetcher services.

## Test Files

### `defillama.test.ts`
Comprehensive tests for the DeFiLlama fetcher service covering:
- **API Integration**: HTTP requests with proper headers, URL construction, and response handling
- **Data Transformation**: Converting DeFiLlama pools to standardized PoolData format
- **Error Handling**: Network errors, API errors, malformed responses, and invalid data
- **Rate Limiting**: Request throttling with 1-second delays between requests
- **Filtering**: TVL threshold filtering and chain-based filtering
- **Symbol Matching**: Pool matching by chain, project, version, and symbol lists
- **Edge Cases**: Zero values, null fields, special characters, extreme numbers
- **Concurrent Operations**: Multiple simultaneous requests with rate limiting

### `pendle.test.ts`
Comprehensive tests for the Pendle fetcher service covering:
- **Chain Support**: All supported chains (Ethereum, Arbitrum, BNB, Optimism, etc.)
- **Market Types**: PT tokens vs LP tokens with different APY calculations
- **Data Transformation**: Converting Pendle markets to standardized PoolData format
- **Error Handling**: Network errors, API errors, unsupported chains, transformation failures
- **Rate Limiting**: Request throttling with 1-second delays between requests
- **Symbol Matching**: Market matching for single tokens (PT) vs pairs (LP)
- **Exposure Detection**: Single, multi, and stable exposure classification
- **IL Risk Assessment**: Impermanent loss risk based on underlying assets
- **Reward Calculations**: Pendle token rewards and swap fee APY calculations
- **Edge Cases**: Large numbers, empty responses, null values, concurrent requests

## Test Patterns

Both test suites follow consistent patterns:
- Mock HTTP fetch globally with different response scenarios
- Use fixture data for realistic API responses
- Test both success and failure paths comprehensively
- Verify rate limiting behavior with timing assertions
- Validate data transformation accuracy
- Handle edge cases and boundary conditions
- Test concurrent request handling

## Key Testing Features

1. **Comprehensive Mocking**: Global fetch mocking with realistic API responses
2. **Rate Limiting Tests**: Timing-based tests to verify request throttling
3. **Error Scenarios**: Network errors, API errors, malformed JSON, HTTP status codes
4. **Data Validation**: Ensuring correct transformation of complex nested data structures
5. **Edge Case Coverage**: Zero values, null fields, extreme numbers, special characters
6. **Concurrent Testing**: Multiple simultaneous requests with proper async handling

## Running Tests

```bash
# Run all fetcher tests
pnpm test tests/unit/services/fetchers/

# Run specific fetcher tests
pnpm test tests/unit/services/fetchers/defillama.test.ts
pnpm test tests/unit/services/fetchers/pendle.test.ts

# Run with coverage
pnpm test tests/unit/services/fetchers/ -- --coverage
```

## Test Coverage Goals

The tests aim to achieve:
- **Line Coverage**: >95% of all executable code lines
- **Function Coverage**: 100% of all public and private methods
- **Branch Coverage**: >90% of all conditional branches
- **Statement Coverage**: >95% of all statements

These tests provide comprehensive coverage of the fetcher services, ensuring reliability and correctness of the DeFi data collection pipeline.
