import { z } from 'zod';

import type { Http } from './http.js';

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hex = z.string().regex(/^0x[0-9a-fA-F]*$/);
const integer = z.union([z.string(), z.number()]).transform((v) => BigInt(v));

const toSignSchema = z.object({
  kind: z.literal('TransactionToSignResponse'),
  submitted: z.literal(false),
  tx: z.object({
    from: address,
    to: address,
    value: z.string(),
    data: hex,
    gas: z.number().int().positive(),
    nonce: z.number().int().nonnegative(),
    gasFeeCap: z.string(),
    gasTipCap: z.string(),
    type: z.literal(2),
  }),
});
export type ComposedTx = z.infer<typeof toSignSchema>['tx'];

const eventSchema = z.object({
  name: z.string(),
  signature: z.string(),
  inputs: z.array(z.object({ name: z.string(), value: z.unknown() })),
  contract: z.object({ address: z.string(), label: z.string().optional() }),
});

const receiptSchema = z.object({
  data: z.object({ status: z.string(), blockNumber: z.string() }),
  events: z.array(eventSchema).nullish(),
});
const transactionSchema = z.object({
  from: address,
  isPending: z.boolean(),
  data: z.object({ to: address.nullable(), input: hex }),
});
const indexedEventSchema = z.array(
  z.object({
    triggeredAt: z.string(),
    event: eventSchema,
    transaction: z.object({ txHash: z.string(), from: z.string() }),
  }),
);
const addressSchema = z.object({
  alias: z.string(),
  address,
  contracts: z.array(z.object({ label: z.string() })).nullish(),
});

function unwrap(value: unknown): unknown {
  return z
    .object({ status: z.number().int().min(200).max(299), result: z.unknown() })
    .parse(value).result;
}

export function createMultibaas(http: Http, baseUrl: string, key: string) {
  const base = `${baseUrl.replace(/\/$/, '').replace(/\/api\/v0$/, '')}/api/v0`;
  const chain = `${base}/chains/ethereum`;
  const headers = { Authorization: `Bearer ${key}` };
  const get = async (url: string) => unwrap(await http.getJson(url, headers));
  const post = async (url: string, body: unknown) =>
    unwrap(await http.postJson(url, body, headers));
  // MultiBaas answers 404 for receipts it has not seen yet and unknown aliases.
  const getOrNull = async <T>(url: string, schema: z.ZodType<T>) => {
    try {
      return schema.parse(await get(url));
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('HTTP 404'))
        return null;
      throw error;
    }
  };
  const method = (alias: string, label: string, name: string) =>
    `${chain}/addresses/${alias}/contracts/${label}/methods/${name}`;
  return {
    status: async () =>
      z
        .object({ chainID: z.literal(8453), blockNumber: z.number().int() })
        .parse(await get(`${chain}/status`)),
    compose: async (
      alias: string,
      label: string,
      name: string,
      args: string[],
      from: string,
    ): Promise<ComposedTx> =>
      toSignSchema.parse(await post(method(alias, label, name), { args, from }))
        .tx,
    call: async (
      alias: string,
      label: string,
      name: string,
      args: string[],
    ): Promise<bigint> =>
      z
        .object({ kind: z.literal('MethodCallResponse'), output: integer })
        .parse(await post(method(alias, label, name), { args })).output,
    submitSigned: async (signedTx: string): Promise<void> => {
      await post(`${chain}/transactions/submit`, { signedTx });
    },
    receipt: (hash: string) =>
      getOrNull(`${chain}/transactions/receipt/${hash}`, receiptSchema),
    transaction: async (hash: string) =>
      transactionSchema.parse(await get(`${chain}/transactions/${hash}`)),
    events: async (query: {
      tx_hash: string;
      contract_label: string;
      event_signature: string;
    }) =>
      indexedEventSchema.parse(
        await get(`${base}/events?${new URLSearchParams(query).toString()}`),
      ),
    contracts: async () =>
      z
        .array(z.object({ label: z.string(), version: z.string() }))
        .parse(await get(`${base}/contracts`)),
    createContract: async (contract: {
      label: string;
      contractName: string;
      version: string;
      bin: string;
      rawAbi: string;
    }) => {
      await post(`${base}/contracts/${contract.label}`, contract);
    },
    address: (alias: string) =>
      getOrNull(`${chain}/addresses/${alias}`, addressSchema),
    createAddress: async (alias: string, value: string) => {
      await post(`${chain}/addresses`, { alias, address: value });
    },
    linkContract: async (
      alias: string,
      link: { label: string; version: string; startingBlock: string },
    ) => {
      await post(`${chain}/addresses/${alias}/contracts`, link);
    },
  };
}
export type Multibaas = ReturnType<typeof createMultibaas>;
