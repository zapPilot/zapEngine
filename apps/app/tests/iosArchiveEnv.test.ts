import { describe, expect, it } from 'vitest';

import {
  buildIosArchiveEnv,
  renderIosArchiveXcodeEnv,
} from '../scripts/ios-archive-env.mjs';

const canonicalMobileEnv = {
  ACCOUNT_API_URL: 'https://api.example.com',
  PODCAST_API_URL: 'https://podcast.example.com',
  PRIVY_MOBILE_APP_ID: 'mobile-app-id',
  PRIVY_MOBILE_CLIENT_ID: 'mobile-client-id',
  PRIVY_APP_SECRET: 'server-only-secret',
  PLAN_SIMULATION_REQUIRED: 'true',
};

describe('iOS archive production environment', () => {
  it('projects canonical prod values for Expo without leaking server-only values', () => {
    const archiveEnv = buildIosArchiveEnv(canonicalMobileEnv);

    expect(archiveEnv).toMatchObject({
      EXPO_PUBLIC_ACCOUNT_API_URL: 'https://api.example.com',
      EXPO_PUBLIC_PODCAST_API_URL: 'https://podcast.example.com',
      EXPO_PUBLIC_PRIVY_APP_ID: 'mobile-app-id',
      EXPO_PUBLIC_PRIVY_CLIENT_ID: 'mobile-client-id',
      EAS_BUILD_PROFILE: 'production',
    });
    expect(archiveEnv).not.toHaveProperty('PRIVY_APP_SECRET');
  });

  it('fails before Xcode when required mobile Privy config is missing', () => {
    expect(() =>
      buildIosArchiveEnv({
        ...canonicalMobileEnv,
        PRIVY_MOBILE_CLIENT_ID: '',
      }),
    ).toThrow(/PRIVY_MOBILE_CLIENT_ID is required for expo:base/u);
  });

  it('writes a replaceable generated block while preserving local Xcode settings', () => {
    const first = renderIosArchiveXcodeEnv(
      'export NODE_BINARY=/opt/homebrew/bin/node\n',
      {
        EXPO_PUBLIC_PRIVY_APP_ID: 'first-app',
        EXPO_PUBLIC_PRIVY_CLIENT_ID: "client'one",
        EAS_BUILD_PROFILE: 'production',
      },
    );
    const second = renderIosArchiveXcodeEnv(first, {
      EXPO_PUBLIC_PRIVY_APP_ID: 'second-app',
      EXPO_PUBLIC_PRIVY_CLIENT_ID: 'second-client',
      EAS_BUILD_PROFILE: 'production',
    });

    expect(second).toContain('export NODE_BINARY=/opt/homebrew/bin/node');
    expect(second).toContain("export EXPO_PUBLIC_PRIVY_APP_ID='second-app'");
    expect(second).toContain(
      "export EXPO_PUBLIC_PRIVY_CLIENT_ID='second-client'",
    );
    expect(second).not.toContain('first-app');
    expect(second.match(/zap-engine production Expo env/gu)).toHaveLength(2);
  });
});
