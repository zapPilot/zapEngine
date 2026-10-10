import type { Page } from '@playwright/test';
import {
  referenceConfigs,
  referenceResponse,
} from '../support/referenceStrategyFixtures';
/** Every public reference screen receives the same settled catalog and replay. */
export async function routeReferenceStrategy(page: Page) {
  await page.route('**/api/v3/strategy/configs', (route) =>
    route.fulfill({ json: referenceConfigs() }),
  );
  await page.route('**/api/v3/backtesting/compare', (route) =>
    route.fulfill({ json: referenceResponse() }),
  );
}
