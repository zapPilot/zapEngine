import { z } from 'zod';

import type { createHttp } from './http.js';

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const txmSchema = z.array(
  z.object({
    tx: z.object({
      hash,
      nonce: z.string(),
      to: address,
      input: z.string(),
      value: z.string(),
    }),
    from: address,
    status: z.enum([
      'pending',
      'included',
      'replaced',
      'cancelled',
      'rejected',
      'exceeded retry limit',
    ]),
    failed: z.boolean().optional(),
  }),
);
export type TxmTransaction = z.infer<typeof txmSchema>[number];
export interface SigningPayload {
  from: string;
  to: string;
  value: string;
  data: string;
  gas: number;
  type: 2;
  nonce: number;
  gasFeeCap: string;
  gasTipCap: string;
}
export interface TransactionSigner {
  submit: (tx: SigningPayload) => Promise<string>;
  txmByNonce: (wallet: string, nonce: number) => Promise<TxmTransaction[]>;
}

function unwrap(value: unknown): unknown {
  return z.object({ status: z.literal(200), result: z.unknown() }).parse(value)
    .result;
}

export function createMultibaas(
  http: ReturnType<typeof createHttp>,
  baseUrl: string,
  key: string,
) {
  const base = `${baseUrl.replace(/\/$/, '').replace(/\/api\/v0$/, '')}/api/v0`;
  const headers = { Authorization: `Bearer ${key}` };
  return {
    async chainStatus() {
      return z
        .object({ chainID: z.literal(8453) })
        .parse(
          unwrap(await http.getJson(`${base}/chains/ethereum/status`, headers)),
        );
    },
    async listHsmWallets() {
      const wallets = z
        .array(z.object({ publicAddress: address }))
        .length(1)
        .parse(unwrap(await http.getJson(`${base}/hsm/wallets`, headers)));
      return wallets[0]!.publicAddress as `0x${string}`;
    },
    async submit(tx: SigningPayload) {
      return z
        .object({ tx: z.object({ hash }) })
        .parse(
          unwrap(
            await http.postJson(
              `${base}/chains/ethereum/hsm/submit`,
              { tx },
              headers,
            ),
          ),
        ).tx.hash;
    },
    async txmByNonce(wallet: string, nonce: number) {
      return txmSchema.parse(
        unwrap(
          await http.getJson(
            `${base}/chains/ethereum/txm/${wallet}?nonce=${nonce}&limit=100`,
            headers,
          ),
        ),
      );
    },
  };
}
