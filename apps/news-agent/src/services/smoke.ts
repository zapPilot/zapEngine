import type { createChain } from '../lib/chain.js';
import type { TransactionSigner } from '../lib/multibaas.js';
import { txmOutcome, withReceipt } from './txm.js';
export async function smoke(
  chain: ReturnType<typeof createChain>,
  signer: TransactionSigner,
  wallet: `0x${string}`,
  sleep: (ms: number) => Promise<void>,
): Promise<void> {
  const nonce = await chain.nonce(wallet, 'pending');
  const tx = await chain.prepare(
    {
      chainId: 8453,
      to: wallet,
      value: '0',
      data: '0x',
      meta: { intentType: 'smoke' },
    },
    wallet,
    nonce,
  );
  console.log(
    JSON.stringify({ smoke: 'submitting', wallet, nonce, payload: tx }),
  );
  const hash = await signer.submit(tx);
  console.log(JSON.stringify({ smoke: 'submitted', hash, nonce }));
  for (let i = 0; i < 36; i++) {
    const records = await signer.txmByNonce(wallet, nonce);
    const active = records.filter((row) => row.status !== 'replaced');
    if (
      active.length === 1 &&
      active[0]!.tx.to.toLowerCase() === wallet.toLowerCase() &&
      active[0]!.tx.input === '0x' &&
      BigInt(active[0]!.tx.value) === 0n
    ) {
      const record = await withReceipt(active[0]!, chain.receipt);
      const outcome = txmOutcome(record);
      if (outcome !== 'pending') {
        console.log(JSON.stringify({ smoke: outcome, hash: record.tx.hash }));
        if (outcome !== 'confirmed') throw new Error('Smoke did not succeed');
        return;
      }
    }
    await sleep(5_000);
  }
  throw new Error('Smoke outcome unresolved; inspect TXM before another smoke');
}
