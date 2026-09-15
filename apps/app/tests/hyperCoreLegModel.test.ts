import { describe, expect, it } from 'vitest';

import {
  hyperCoreLegReviewRows,
  investAgentDisclaimer,
  investSignatureSummary,
  HYPERCORE_LEG_NOT_SIMULATED,
} from '@/integration/hyperCoreLegModel';

describe('hyperCoreLegReviewRows', () => {
  it('states the deposit, the live balance, and the lock the vault imposes', () => {
    expect(
      hyperCoreLegReviewRows({
        requestedUsd6: 57_000_000n,
        spendableUsd6: 60_000_000n,
        accountMode: 'unified',
        lockupDays: 4,
        agentStatus: 'ready',
      }),
    ).toEqual([
      { label: 'Deposit', value: '57 USDC' },
      { label: 'Available on Hyperliquid', value: '60 USDC' },
      { label: 'Account mode', value: 'Unified' },
      { label: 'Route', value: 'Hyperliquid balance → HLP vault' },
      { label: 'Destination', value: 'Official HLP vault' },
      { label: 'Withdrawal lock', value: '4 days after deposit' },
      { label: 'Network fee', value: 'None — no gas' },
      { label: 'Signatures', value: 'None — signing enabled' },
    ]);
  });

  it('shows a dash rather than inventing facts the plan has not returned', () => {
    const rows = hyperCoreLegReviewRows({
      requestedUsd6: 10_000_000n,
      spendableUsd6: null,
      accountMode: null,
      lockupDays: null,
      agentStatus: 'idle',
    });
    expect(
      rows.filter((row) => row.value === '—').map((row) => row.label),
    ).toEqual(['Available on Hyperliquid', 'Account mode', 'Withdrawal lock']);
    expect(rows.at(-1)).toEqual({
      label: 'Signatures',
      value: '1 — enable Hyperliquid signing',
    });
  });

  it('never claims simulation coverage it does not have', () => {
    expect(HYPERCORE_LEG_NOT_SIMULATED).toContain('Not simulated');
  });
});

describe('investSignatureSummary', () => {
  it('counts the agent-signed leg separately from the wallet batches', () => {
    expect(
      investSignatureSummary({ batchCount: 2, hasHyperCoreLeg: false }),
    ).toBe(
      "You'll sign 2 transactions, one per chain — each later one continues on its own after a quick re-check.",
    );
    expect(
      investSignatureSummary({ batchCount: 1, hasHyperCoreLeg: true }),
    ).toBe(
      "You'll sign 1 transaction, one per chain — each later one continues on its own after a quick re-check. The HLP deposit needs no wallet transaction: your approved Hyperliquid agent signs it.",
    );
  });
});

describe('investAgentDisclaimer', () => {
  it('drops the bridge wording when there is no bridge to wait for', () => {
    expect(
      investAgentDisclaimer({ hasBridgedHlp: true, hasHyperCoreLeg: false }),
    ).toContain('once USDC arrives on Hyperliquid');
    expect(
      investAgentDisclaimer({ hasBridgedHlp: false, hasHyperCoreLeg: true }),
    ).toContain('straight from the USDC already on Hyperliquid');
    expect(
      investAgentDisclaimer({ hasBridgedHlp: false, hasHyperCoreLeg: false }),
    ).toBe('.');
  });
});
