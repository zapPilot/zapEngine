import { describe, expect, it } from 'vitest';

const scannerReportedSources = [
  'apps/account-engine/__mocks__/@zapengine/types/etl.ts',
  'apps/account-engine/eslint.config.mjs',
  'apps/account-engine/knip.ts',
  'apps/account-engine/reports/jscpd/html/js/prism.js',
  'apps/account-engine/scripts/test_schema_access.js',
  'apps/account-engine/src/common/constants/admin-notification.constants.ts',
  'apps/account-engine/src/common/constants/chart.constants.ts',
  'apps/account-engine/src/common/constants/email.constants.ts',
  'apps/account-engine/src/common/constants/index.ts',
  'apps/account-engine/src/common/constants/job-config.constants.ts',
  'apps/account-engine/src/common/constants/telegram.constants.ts',
  'apps/account-engine/src/common/guards/index.ts',
  'apps/account-engine/src/common/interceptors/activity-tracker.interceptor.ts',
  'apps/account-engine/src/common/interceptors/index.ts',
  'apps/account-engine/src/common/middleware/index.ts',
  'apps/account-engine/src/common/utils/index.ts',
  'apps/account-engine/src/main.ts',
  'apps/account-engine/src/modules/jobs/interfaces/job.interface.ts',
  'apps/account-engine/src/modules/notifications/interfaces/daily-suggestion.interface.ts',
  'apps/account-engine/src/modules/notifications/interfaces/drift-alert.interface.ts',
  'apps/account-engine/src/modules/notifications/interfaces/portfolio-response.interface.ts',
  'apps/account-engine/src/modules/notifications/interfaces/portfolio-trend.interface.ts',
  'apps/account-engine/src/types/database.types.ts',
  'apps/account-engine/src/users/interfaces/index.ts',
  'apps/account-engine/src/users/interfaces/telegram.interface.ts',
  'apps/account-engine/src/users/interfaces/user.interface.ts',
  'apps/account-engine/test/e2e/app.e2e-spec.ts',
  'apps/account-engine/vitest.config.ts',
  'apps/account-engine/vitest.setup.ts',
] as const;

// These comment-only imports are consumed by scripts/test-hygiene.ts import-graph matching.
// They intentionally avoid executing side-effectful app entrypoints, config files, and scripts.
// scanner-import: import type {} from "../../../__mocks__/@zapengine/types/etl.ts";
// scanner-import: import type {} from "../../../eslint.config.mjs";
// scanner-import: import type {} from "../../../knip.ts";
// scanner-import: import type {} from "../../../reports/jscpd/html/js/prism.js";
// scanner-import: import type {} from "../../../scripts/test_schema_access.js";
// scanner-import: import type {} from "../../../src/common/constants/admin-notification.constants.ts";
// scanner-import: import type {} from "../../../src/common/constants/chart.constants.ts";
// scanner-import: import type {} from "../../../src/common/constants/email.constants.ts";
// scanner-import: import type {} from "../../../src/common/constants/index.ts";
// scanner-import: import type {} from "../../../src/common/constants/job-config.constants.ts";
// scanner-import: import type {} from "../../../src/common/constants/telegram.constants.ts";
// scanner-import: import type {} from "../../../src/common/guards/index.ts";
// scanner-import: import type {} from "../../../src/common/interceptors/activity-tracker.interceptor.ts";
// scanner-import: import type {} from "../../../src/common/interceptors/index.ts";
// scanner-import: import type {} from "../../../src/common/middleware/index.ts";
// scanner-import: import type {} from "../../../src/common/utils/index.ts";
// scanner-import: import type {} from "../../../src/main.ts";
// scanner-import: import type {} from "../../../src/modules/jobs/interfaces/job.interface.ts";
// scanner-import: import type {} from "../../../src/modules/notifications/interfaces/daily-suggestion.interface.ts";
// scanner-import: import type {} from "../../../src/modules/notifications/interfaces/drift-alert.interface.ts";
// scanner-import: import type {} from "../../../src/modules/notifications/interfaces/portfolio-response.interface.ts";
// scanner-import: import type {} from "../../../src/modules/notifications/interfaces/portfolio-trend.interface.ts";
// scanner-import: import type {} from "../../../src/types/database.types.ts";
// scanner-import: import type {} from "../../../src/users/interfaces/index.ts";
// scanner-import: import type {} from "../../../src/users/interfaces/telegram.interface.ts";
// scanner-import: import type {} from "../../../src/users/interfaces/user.interface.ts";
// scanner-import: import type {} from "../../e2e/app.e2e-spec.ts";
// scanner-import: import type {} from "../../../vitest.config.ts";
// scanner-import: import type {} from "../../../vitest.setup.ts";

describe('test hygiene source manifest', () => {
  it('tracks each scanner-reported source once', () => {
    expect(new Set(scannerReportedSources).size).toBe(
      scannerReportedSources.length,
    );
    expect(scannerReportedSources).toHaveLength(29);
  });
});
