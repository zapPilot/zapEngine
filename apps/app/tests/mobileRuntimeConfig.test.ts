import { describe, expect, it } from 'vitest';

import { getMobileRuntimeConfig } from '../src/config/mobileRuntimeConfig';

describe('getMobileRuntimeConfig', () => {
  it('returns Privy config when both mobile credentials are present', () => {
    expect(
      getMobileRuntimeConfig({
        privyAppId: ' privy-app ',
        privyClientId: ' privy-client ',
      }),
    ).toEqual({
      runtime: 'app',
      privy: {
        appId: 'privy-app',
        clientId: 'privy-client',
      },
    });
  });

  it('requires both Privy mobile credentials', () => {
    expect(
      getMobileRuntimeConfig({
        privyAppId: 'privy-app',
      }),
    ).toEqual({
      runtime: 'app',
      privy: null,
    });
  });
});
