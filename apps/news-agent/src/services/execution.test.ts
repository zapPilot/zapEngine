import { describe, expect, it, vi } from 'vitest';

import type { SigningPayload } from '../lib/multibaas.js';
import {
  action,
  approvedReview,
  deposit,
  hash,
  memoryStore,
  now,
  payload,
  persistedStep,
  txm,
  wallet,
} from '../test-utils/fixtures.js';
import { execute } from './execution.js';
import { txmOutcome } from './txm.js';

function harness(initial = action()) {
  const memory = memoryStore(initial);
  let clock = now;
  let nextNonce = 7;
  const submitted = new Map<number, SigningPayload>();
  const d = {
    store: memory.store,
    wallet,
    now: () => clock,
    sleep: vi.fn(async (ms: number) => {
      clock += ms;
    }),
    review: vi.fn().mockResolvedValue(approvedReview()),
    chain: {
      assertChain: vi.fn(),
      nonce: vi.fn(async () => nextNonce),
      prepare: vi.fn(
        async (
          tx: ReturnType<typeof deposit>,
          _wallet: string,
          nonce: number,
        ) => payload(tx, nonce),
      ),
      receipt: vi.fn(async (): Promise<'success' | 'reverted' | null> => null),
    },
    signer: {
      submit: vi.fn(async (p: SigningPayload) => {
        const persisted = memory.row.steps.find(
          (step) => step.nonce === p.nonce,
        );
        expect(persisted?.status).toBe('submitting');
        expect(persisted?.payload).toEqual(p);
        submitted.set(p.nonce, p);
        nextNonce = p.nonce + 1;
        return hash;
      }),
      txmByNonce: vi.fn(async (_wallet: string, nonce: number) =>
        submitted.has(nonce) ? [txm(submitted.get(nonce))] : [],
      ),
    },
  };
  return { memory, d, submitted };
}
describe('at-most-once execution', () => {
  it('persists each payload before signing and executes approval before deposit', async () => {
    const h = harness();
    h.d.review.mockResolvedValue(approvedReview(true));
    await execute(h.memory.row, h.d);
    expect(h.memory.row.status).toBe('confirmed');
    expect(h.d.signer.submit).toHaveBeenCalledTimes(2);
    expect(h.memory.row.steps.map((step) => step.nonce)).toEqual([7, 8]);
  });
  it('dry-run reviews without claiming or submitting', async () => {
    const h = harness();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await execute(h.memory.row, h.d, true);
    log.mockRestore();
    expect(h.memory.writes).toEqual([]);
    expect(h.d.signer.submit).not.toHaveBeenCalled();
  });
  it('blocks rejected reviews and wallet changes without consuming an arm', async () => {
    for (const wrongWallet of [false, true]) {
      const h = harness(
        action({
          wallet_address: wrongWallet
            ? '0x2222222222222222222222222222222222222222'
            : wallet,
        }),
      );
      if (!wrongWallet) {
        const review = approvedReview();
        review.expiresAt = now;
        h.d.review.mockResolvedValue(review);
      }
      await execute(h.memory.row, h.d);
      expect(h.memory.row.status).toBe('blocked');
      expect(h.d.signer.submit).not.toHaveBeenCalled();
    }
  });
  it('bounds review retries and respects backoff', async () => {
    const h = harness(action({ attempt_count: 2 }));
    h.d.review.mockRejectedValue(new Error('500'));
    await execute(h.memory.row, h.d);
    expect(h.memory.row.status).toBe('blocked');
    const pending = harness();
    pending.d.review.mockRejectedValue(new Error('500'));
    await execute(pending.memory.row, pending.d);
    expect(pending.memory.row.attempt_count).toBe(1);
    await execute(pending.memory.row, pending.d);
    expect(pending.d.review).toHaveBeenCalledTimes(1);
    await expect(execute(action(), pending.d, true)).rejects.toThrow(
      'Review unavailable',
    );
  });
  it('does not submit when another daemon won the CAS', async () => {
    const h = harness();
    vi.mocked(h.d.store.cas).mockResolvedValueOnce(null);
    await expect(execute(h.memory.row, h.d)).rejects.toThrow('Claim lost');
    expect(h.d.signer.submit).not.toHaveBeenCalled();
  });
  it('skips an arm rejected by the database unique constraint', async () => {
    const h = harness();
    vi.mocked(h.d.store.cas).mockRejectedValueOnce(
      Object.assign(new Error('duplicate'), { code: '23505' }),
    );
    await execute(h.memory.row, h.d);
    expect(h.memory.row.status).toBe('skipped');
    expect(h.d.signer.submit).not.toHaveBeenCalled();
  });
  it.each(['submitting', 'submitted'] as const)(
    'does not steal a live %s claim',
    async (status) => {
      const h = harness(
        action({
          status,
          lease_expires_at: new Date(now + 10000).toISOString(),
        }),
      );
      await execute(h.memory.row, h.d);
      expect(h.memory.writes).toEqual([]);
    },
  );
  it('recovers an unrecorded submission from TXM without sending again', async () => {
    const h = harness(
      action({
        status: 'submitting',
        review: approvedReview(),
        steps: [persistedStep()],
      }),
    );
    h.submitted.set(7, payload());
    await execute(h.memory.row, h.d);
    expect(h.memory.row.status).toBe('confirmed');
    expect(h.d.signer.submit).not.toHaveBeenCalled();
  });
  it('resubmits the exact persisted payload and same nonce when chain is unchanged', async () => {
    const h = harness(
      action({
        status: 'submitting',
        review: approvedReview(),
        steps: [persistedStep()],
      }),
    );
    await execute(h.memory.row, h.d);
    expect(h.d.signer.submit).toHaveBeenCalledWith(payload());
    expect(h.d.chain.prepare).not.toHaveBeenCalled();
  });
  it('requires attention for an occupied nonce, stale review or mismatched persisted payload', async () => {
    for (const reason of ['nonce', 'expired', 'payload', 'wallet', 'missing']) {
      const initial = action({
        status: 'submitting',
        review: approvedReview(),
        steps: [persistedStep()],
      });
      if (reason === 'expired') initial.review!.expiresAt = now;
      if (reason === 'payload') initial.steps[0]!.payload.data = '0x';
      if (reason === 'wallet')
        initial.wallet_address = '0x2222222222222222222222222222222222222222';
      if (reason === 'missing') initial.review = null;
      const h = harness(initial);
      if (reason === 'nonce') h.d.chain.nonce.mockResolvedValue(8);
      await execute(h.memory.row, h.d);
      expect(h.memory.row.status).toBe('needs_attention');
      expect(h.d.signer.submit).not.toHaveBeenCalled();
    }
  });
  it('never adopts a different transaction using the same nonce', async () => {
    const h = harness(
      action({
        status: 'submitting',
        review: approvedReview(),
        steps: [persistedStep()],
      }),
    );
    h.d.signer.txmByNonce.mockResolvedValue([
      txm({ ...payload(), data: '0x' }),
    ]);
    await execute(h.memory.row, h.d);
    expect(h.memory.row.status).toBe('needs_attention');
    expect(h.d.signer.submit).not.toHaveBeenCalled();
  });
  it('keeps a timeout ambiguous and never retries a timed-out submit', async () => {
    const h = harness();
    h.d.signer.submit.mockRejectedValue(new Error('timeout'));
    await execute(h.memory.row, h.d);
    expect(h.memory.row.status).toBe('needs_attention');
    await execute(h.memory.row, h.d);
    expect(h.d.signer.submit).toHaveBeenCalledTimes(1);
  });
  it('does not resend a known hash missing temporarily from TXM', async () => {
    const h = harness(
      action({
        status: 'submitted',
        review: approvedReview(),
        steps: [{ ...persistedStep(), hash }],
      }),
    );
    await execute(h.memory.row, h.d);
    expect(h.memory.row.status).toBe('needs_attention');
    expect(h.d.signer.submit).not.toHaveBeenCalled();
    expect(h.d.sleep).toHaveBeenCalled();
  });
  it.each([
    ['included', false, 'confirmed'],
    ['included', true, 'failed'],
    ['included', undefined, 'pending'],
    ['cancelled', undefined, 'failed'],
    ['rejected', undefined, 'failed'],
    ['exceeded retry limit', undefined, 'needs_attention'],
    ['pending', undefined, 'pending'],
    ['replaced', undefined, 'pending'],
  ] as const)('maps TXM %s/%s to %s', async (status, failed, expected) => {
    const record = { ...txm(), status, failed };
    expect(txmOutcome(record)).toBe(expected);
    const h = harness(
      action({
        status: 'submitted',
        review: approvedReview(),
        steps: [persistedStep()],
      }),
    );
    h.d.signer.txmByNonce.mockResolvedValue([record]);
    await execute(h.memory.row, h.d);
    expect(h.memory.row.status).toBe(
      expected === 'pending' ? 'needs_attention' : expected,
    );
  });
  it.each([
    ['success', 'confirmed', 'included'],
    ['reverted', 'failed', 'reverted'],
  ] as const)(
    'resolves TXM inclusion without a failed flag from the %s receipt',
    async (receipt, status, outcome) => {
      const h = harness(
        action({
          status: 'submitted',
          review: approvedReview(),
          steps: [persistedStep()],
        }),
      );
      h.d.signer.txmByNonce.mockResolvedValue([
        { ...txm(), failed: undefined },
      ]);
      h.d.chain.receipt.mockResolvedValue(receipt);
      await execute(h.memory.row, h.d);
      expect(h.d.chain.receipt).toHaveBeenCalledWith(hash);
      expect(h.memory.row.status).toBe(status);
      expect(h.memory.row.steps[0]!.outcome).toBe(outcome);
    },
  );
  it('waits for a trailing RPC to mine the approval before preparing the deposit', async () => {
    const h = harness();
    h.d.review.mockResolvedValue(approvedReview(true));
    const lagging = h.d.chain.nonce.getMockImplementation()!;
    let lagReads = 0;
    h.d.chain.nonce.mockImplementation(async (...args) => {
      const value = await lagging(...args);
      return value === 8 && lagReads++ < 2 ? 7 : value;
    });
    await execute(h.memory.row, h.d);
    expect(h.memory.row.status).toBe('confirmed');
    expect(h.memory.row.steps.map((step) => step.nonce)).toEqual([7, 8]);
    expect(h.d.sleep).toHaveBeenCalledWith(2_500);
  });
  it.each([
    ['never catches up', 7],
    ['was used by another transaction', 9],
  ])(
    'requires attention without signing when the wallet nonce %s',
    async (_case, observed) => {
      const review = approvedReview(true);
      const h = harness(
        action({
          status: 'submitted',
          review,
          steps: [
            {
              ...persistedStep(review.plan.approvals[0], 7),
              status: 'confirmed',
              hash,
            },
          ],
        }),
      );
      h.d.chain.nonce.mockResolvedValue(observed);
      await execute(h.memory.row, h.d);
      expect(h.memory.row.status).toBe('needs_attention');
      expect(h.memory.row.last_error).toBe(
        'Wallet nonce did not follow the previous step',
      );
      expect(h.d.chain.prepare).not.toHaveBeenCalled();
      expect(h.d.signer.submit).not.toHaveBeenCalled();
    },
  );
  it('follows a replacement hash and skips already-confirmed approvals on recovery', async () => {
    const review = approvedReview(true);
    const approval = review.plan.approvals[0]!;
    const h = harness(
      action({
        status: 'submitted',
        review,
        steps: [
          { ...persistedStep(approval, 6), status: 'confirmed', hash },
          persistedStep(),
        ],
      }),
    );
    const replacement = {
      ...txm(),
      tx: { ...txm().tx, hash: `0x${'cd'.repeat(32)}` },
    };
    h.d.signer.txmByNonce
      .mockResolvedValueOnce([{ ...txm(), status: 'replaced' }])
      .mockResolvedValue([replacement]);
    await execute(h.memory.row, h.d);
    expect(h.memory.row.status).toBe('confirmed');
    expect(h.memory.row.steps[1]!.hash).toBe(replacement.tx.hash);
  });
  it('requires attention if remaining deposit review expired after approval', async () => {
    const review = approvedReview(true);
    review.expiresAt = now;
    const h = harness(
      action({
        status: 'submitted',
        review,
        steps: [
          {
            ...persistedStep(review.plan.approvals[0], 6),
            status: 'confirmed',
            hash,
          },
        ],
      }),
    );
    await execute(h.memory.row, h.d);
    expect(h.memory.row.status).toBe('needs_attention');
    expect(h.d.signer.submit).not.toHaveBeenCalled();
  });
});
