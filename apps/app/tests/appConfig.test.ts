import { describe, expect, it } from 'vitest';

import appConfig from '../app.config';

describe('Android store identity', () => {
  it('preserves the existing Google Play application while using the Zap Pilot name', () => {
    expect(appConfig.name).toBe('Zap Pilot');
    expect(appConfig.android?.package).toBe('com.fromfedtochain.app');
  });

  it('uses the next user-facing version after the final Flutter release', () => {
    expect(appConfig.version).toBe('2.1.0');
    expect(appConfig.android?.versionCode).toBeUndefined();
  });
});
