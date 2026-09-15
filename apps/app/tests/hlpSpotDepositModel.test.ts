import { describe, expect, it } from 'vitest';

import {
  hlpSpotDepositCta,
  hlpSpotDone,
  hlpSpotSignatureLabel,
} from '@/integration/hlpSpotDepositModel';

describe('HLP spot deposit presentation', () => {
  it('treats only terminal deposit outcomes as done', () => {
    expect(hlpSpotDone('deposited')).toBe(true);
    expect(hlpSpotDone('submittedUnverified')).toBe(true);
    expect(hlpSpotDone('idle')).toBe(false);
  });

  it('describes whether an agent signature is still required', () => {
    expect(hlpSpotSignatureLabel('ready')).toBe('None — signing enabled');
    expect(hlpSpotSignatureLabel('unapproved')).toBe(
      '1 — enable Hyperliquid signing',
    );
  });

  it.each([
    [true, 'ready', 'idle', 'Preparing deposit…'],
    [false, 'checking', 'idle', 'Checking Hyperliquid signing…'],
    [false, 'approving', 'idle', 'Confirm in your wallet…'],
    [false, 'unapproved', 'idle', 'Enable Hyperliquid signing'],
    [false, 'ready', 'confirming', 'Confirming deposit…'],
    [false, 'ready', 'idle', 'Deposit into HLP vault'],
  ] as const)(
    'selects the CTA for plan=%s agent=%s wizard=%s',
    (planLoading, agentStatus, wizardStatus, expected) => {
      expect(
        hlpSpotDepositCta({ planLoading, agentStatus, wizardStatus }),
      ).toBe(expected);
    },
  );
});
