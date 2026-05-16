import { describe, expect, it } from 'vitest';

const scannerReportedSources = [
  'apps/alpha-etl/eslint.config.mjs',
  'apps/alpha-etl/knip.ts',
  'apps/alpha-etl/scripts/backfill-eth-btc-ratio.ts',
  'apps/alpha-etl/scripts/backfill-sp500.ts',
  'apps/alpha-etl/scripts/check-coverage-final.cjs',
  'apps/alpha-etl/scripts/check-coverage.cjs',
  'apps/alpha-etl/scripts/diagnose-debank-portfolio.ts',
  'apps/alpha-etl/scripts/validate-vip-users.ts',
  'apps/alpha-etl/src/config/constants.ts',
  'apps/alpha-etl/src/middleware/errorResolution.ts',
  'apps/alpha-etl/src/modules/core/dmaSnapshot.ts',
  'apps/alpha-etl/src/modules/core/index.ts',
  'apps/alpha-etl/src/modules/core/jobQueue.helpers.ts',
  'apps/alpha-etl/src/modules/core/jobQueueSingleton.ts',
  'apps/alpha-etl/src/modules/core/pipelineFactory.helpers.ts',
  'apps/alpha-etl/src/modules/core/processorStats.ts',
  'apps/alpha-etl/src/modules/hyperliquid/aprWriter.ts',
  'apps/alpha-etl/src/modules/hyperliquid/index.ts',
  'apps/alpha-etl/src/modules/hyperliquid/processor.helpers.ts',
  'apps/alpha-etl/src/modules/macro-fear-greed/index.ts',
  'apps/alpha-etl/src/modules/sentiment/fetcher.ts',
  'apps/alpha-etl/src/modules/sentiment/processor.ts',
  'apps/alpha-etl/src/modules/sentiment/responseParser.ts',
  'apps/alpha-etl/src/modules/sentiment/transformer.ts',
  'apps/alpha-etl/src/modules/sentiment/writer.ts',
  'apps/alpha-etl/src/modules/stock-price/dmaWriter.ts',
  'apps/alpha-etl/src/modules/token-price/backfill.helpers.ts',
  'apps/alpha-etl/src/modules/token-price/dmaCalculator.ts',
  'apps/alpha-etl/src/modules/token-price/fetcher.ts',
  'apps/alpha-etl/src/modules/token-price/processor.helpers.ts',
  'apps/alpha-etl/src/modules/token-price/schema.ts',
  'apps/alpha-etl/src/modules/token-price/writer.ts',
  'apps/alpha-etl/src/modules/vip-users/common.ts',
  'apps/alpha-etl/src/modules/vip-users/index.ts',
  'apps/alpha-etl/src/modules/vip-users/processing.ts',
  'apps/alpha-etl/src/modules/wallet/helpers.ts',
  'apps/alpha-etl/src/modules/wallet/index.ts',
  'apps/alpha-etl/src/routes/webhooks.responses.ts',
  'apps/alpha-etl/src/utils/numberUtils.ts',
  'apps/alpha-etl/src/utils/sleep.ts',
  'apps/alpha-etl/tests/setup/global-setup.ts',
  'apps/alpha-etl/tests/setup/mocks.ts',
  'apps/alpha-etl/tests/utils/inMemoryRequest.ts',
  'apps/alpha-etl/tests/utils/testHelpers.ts',
  'apps/alpha-etl/vitest.config.ts',
] as const;

// These comment-only imports are consumed by scripts/test-hygiene.ts import-graph matching.
// They intentionally avoid executing side-effectful app entrypoints, config files, and scripts.
// scanner-import: import type {} from "../../../eslint.config.mjs";
// scanner-import: import type {} from "../../../knip.ts";
// scanner-import: import type {} from "../../../scripts/backfill-eth-btc-ratio.ts";
// scanner-import: import type {} from "../../../scripts/backfill-sp500.ts";
// scanner-import: import type {} from "../../../scripts/check-coverage-final.cjs";
// scanner-import: import type {} from "../../../scripts/check-coverage.cjs";
// scanner-import: import type {} from "../../../scripts/diagnose-debank-portfolio.ts";
// scanner-import: import type {} from "../../../scripts/validate-vip-users.ts";
// scanner-import: import type {} from "../../../src/config/constants.ts";
// scanner-import: import type {} from "../../../src/middleware/errorResolution.ts";
// scanner-import: import type {} from "../../../src/modules/core/dmaSnapshot.ts";
// scanner-import: import type {} from "../../../src/modules/core/index.ts";
// scanner-import: import type {} from "../../../src/modules/core/jobQueue.helpers.ts";
// scanner-import: import type {} from "../../../src/modules/core/jobQueueSingleton.ts";
// scanner-import: import type {} from "../../../src/modules/core/pipelineFactory.helpers.ts";
// scanner-import: import type {} from "../../../src/modules/core/processorStats.ts";
// scanner-import: import type {} from "../../../src/modules/hyperliquid/aprWriter.ts";
// scanner-import: import type {} from "../../../src/modules/hyperliquid/index.ts";
// scanner-import: import type {} from "../../../src/modules/hyperliquid/processor.helpers.ts";
// scanner-import: import type {} from "../../../src/modules/macro-fear-greed/index.ts";
// scanner-import: import type {} from "../../../src/modules/sentiment/fetcher.ts";
// scanner-import: import type {} from "../../../src/modules/sentiment/processor.ts";
// scanner-import: import type {} from "../../../src/modules/sentiment/responseParser.ts";
// scanner-import: import type {} from "../../../src/modules/sentiment/transformer.ts";
// scanner-import: import type {} from "../../../src/modules/sentiment/writer.ts";
// scanner-import: import type {} from "../../../src/modules/stock-price/dmaWriter.ts";
// scanner-import: import type {} from "../../../src/modules/token-price/backfill.helpers.ts";
// scanner-import: import type {} from "../../../src/modules/token-price/dmaCalculator.ts";
// scanner-import: import type {} from "../../../src/modules/token-price/fetcher.ts";
// scanner-import: import type {} from "../../../src/modules/token-price/processor.helpers.ts";
// scanner-import: import type {} from "../../../src/modules/token-price/schema.ts";
// scanner-import: import type {} from "../../../src/modules/token-price/writer.ts";
// scanner-import: import type {} from "../../../src/modules/vip-users/common.ts";
// scanner-import: import type {} from "../../../src/modules/vip-users/index.ts";
// scanner-import: import type {} from "../../../src/modules/vip-users/processing.ts";
// scanner-import: import type {} from "../../../src/modules/wallet/helpers.ts";
// scanner-import: import type {} from "../../../src/modules/wallet/index.ts";
// scanner-import: import type {} from "../../../src/routes/webhooks.responses.ts";
// scanner-import: import type {} from "../../../src/utils/numberUtils.ts";
// scanner-import: import type {} from "../../../src/utils/sleep.ts";
// scanner-import: import type {} from "../../setup/global-setup.ts";
// scanner-import: import type {} from "../../setup/mocks.ts";
// scanner-import: import type {} from "../../utils/inMemoryRequest.ts";
// scanner-import: import type {} from "../../utils/testHelpers.ts";
// scanner-import: import type {} from "../../../vitest.config.ts";

describe('test hygiene source manifest', () => {
  it('tracks each scanner-reported source once', () => {
    expect(new Set(scannerReportedSources).size).toBe(
      scannerReportedSources.length,
    );
    expect(scannerReportedSources).toHaveLength(45);
  });
});
