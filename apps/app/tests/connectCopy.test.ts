import { describe, expect, it } from 'vitest';

import { CONNECT_GATE_COPY } from '@/components/connect/connectCopy';

describe('connect gate copy', () => {
  it('keeps the gate title pinned to the e2e smoke assertion', () => {
    expect(CONNECT_GATE_COPY.signInTitle).toBe('Sign in to continue');
  });
});
