import type { PreparedTransaction } from '@zapengine/types/api';
import { keccak256 } from 'viem';

import { type ExecutionContext, leaseExpiry } from './execution-context.js';
import { guard } from './guard.js';
import { matches, txmDescription, txmOutcome, withReceipt } from './txm.js';
import type { Step } from './types.js';

function validPayload(
  step: Step,
  tx: PreparedTransaction,
  wallet: string,
): boolean {
  return (
    step.to.toLowerCase() === tx.to.toLowerCase() &&
    step.dataHash === keccak256(tx.data as `0x${string}`) &&
    BigInt(step.value) === BigInt(tx.value) &&
    step.payload.to === step.to &&
    step.payload.value === step.value &&
    step.payload.nonce === step.nonce &&
    step.payload.from.toLowerCase() === wallet.toLowerCase() &&
    keccak256(step.payload.data as `0x${string}`) === step.dataHash
  );
}
// A load-balanced RPC can trail TXM; wait until it has mined the previous step.
async function followingNonce(
  context: ExecutionContext,
  expected: number,
): Promise<number | null> {
  const { d } = context;
  for (let attempt = 0; attempt < 12; attempt++) {
    const [latest, pending] = await Promise.all([
      d.chain.nonce(d.wallet, 'latest'),
      d.chain.nonce(d.wallet, 'pending'),
    ]);
    if (latest === expected && pending === expected) return expected;
    if (latest > expected) return null;
    await d.sleep(2_500);
  }
  return null;
}
async function prepareStep(
  context: ExecutionContext,
  tx: PreparedTransaction,
  index: number,
): Promise<Step | null> {
  const { d, action } = context;
  const result = guard(action.review!, d.wallet, d.now());
  if (!result.allowed) {
    await context.attention(result.reason);
    return null;
  }
  const previous = action.steps[index - 1];
  const nonce = previous
    ? await followingNonce(context, previous.nonce + 1)
    : await d.chain.nonce(d.wallet, 'pending');
  if (nonce === null) {
    await context.attention('Wallet nonce did not follow the previous step');
    return null;
  }
  const payload = await d.chain.prepare(tx, d.wallet, nonce);
  const step: Step = {
    status: 'submitting',
    nonce,
    to: tx.to,
    value: tx.value,
    dataHash: keccak256(tx.data as `0x${string}`),
    payload,
  };
  await context.save({
    steps: [...action.steps, step],
    lease_expires_at: leaseExpiry(d.now()),
  });
  return step;
}
function stepUpdater(context: ExecutionContext, step: Step, index: number) {
  return async (patch: Partial<Step>) => {
    const updated = { ...step, ...patch };
    await context.save({
      steps: context.action.steps.map((entry, i) =>
        i === index ? updated : entry,
      ),
      lease_expires_at: leaseExpiry(context.d.now()),
    });
    Object.assign(step, updated);
  };
}
async function submitPersisted(
  context: ExecutionContext,
  step: Step,
  update: ReturnType<typeof stepUpdater>,
): Promise<boolean> {
  const { d } = context;
  const [latest, pending] = await Promise.all([
    d.chain.nonce(d.wallet, 'latest'),
    d.chain.nonce(d.wallet, 'pending'),
  ]);
  if (
    latest !== step.nonce ||
    pending !== step.nonce ||
    !guard(context.action.review!, d.wallet, d.now()).allowed
  ) {
    await context.attention(
      'Nonce changed or review expired; submit outcome unresolved',
    );
    return false;
  }
  await update({ status: 'submitting' });
  const hash = await d.signer.submit(step.payload);
  await update({ status: 'submitted', hash });
  await context.save({ status: 'submitted' });
  return true;
}
async function poll(
  context: ExecutionContext,
  step: Step,
  update: ReturnType<typeof stepUpdater>,
  initial: Awaited<ReturnType<ExecutionContext['d']['signer']['txmByNonce']>>,
): Promise<boolean> {
  const { d } = context;
  let records = initial;
  const deadline = d.now() + 180_000;
  for (;;) {
    if (records.some((record) => !matches(record, step))) {
      await context.attention('TXM payload changed');
      return false;
    }
    const active = records.filter((record) => record.status !== 'replaced');
    if (active.length > 1) {
      await context.attention('Ambiguous TXM records');
      return false;
    }
    const record = active[0] && (await withReceipt(active[0], d.chain.receipt));
    if (record) {
      const outcome = txmOutcome(record);
      await update({
        status: 'submitted',
        hash: record.tx.hash,
        outcome: txmDescription(record),
      });
      if (outcome === 'confirmed') {
        await update({ status: 'confirmed' });
        return true;
      }
      if (outcome !== 'pending') {
        if (outcome === 'failed') await update({ status: 'failed' });
        await context.save({
          status: outcome,
          last_error: txmDescription(record),
        });
        return false;
      }
    }
    if (d.now() >= deadline) {
      await context.attention('TXM timeout; outcome unresolved');
      return false;
    }
    await context.save({ lease_expires_at: leaseExpiry(d.now()) });
    await d.sleep(5_000);
    records = await d.signer.txmByNonce(d.wallet, step.nonce);
  }
}
export async function executeStep(
  context: ExecutionContext,
  tx: PreparedTransaction,
  index: number,
): Promise<boolean> {
  const step =
    context.action.steps[index] ?? (await prepareStep(context, tx, index));
  if (!step) return false;
  if (!validPayload(step, tx, context.d.wallet)) {
    await context.attention('Persisted payload mismatch');
    return false;
  }
  if (step.status === 'confirmed') return true;
  const update = stepUpdater(context, step, index);
  const records = await context.d.signer.txmByNonce(
    context.d.wallet,
    step.nonce,
  );
  if (records.some((record) => !matches(record, step))) {
    await context.attention('Nonce belongs to a different TXM payload');
    return false;
  }
  if (
    !records.length &&
    !step.hash &&
    !(await submitPersisted(context, step, update))
  )
    return false;
  return poll(context, step, update, records);
}
