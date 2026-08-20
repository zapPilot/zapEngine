import { httpGet } from '@core/lib/http';
import { createApiServiceCaller } from '@core/lib/http/createServiceCaller';
import { pollUntil } from '@core/lib/polling';
import { createIntentEngine } from '@zapengine/intent-engine';
import { createPublicClient, type Hash, http, type PublicClient } from 'viem';
import { arbitrum, base, mainnet } from 'viem/chains';

export const intentEngine = createIntentEngine({
  lifi: { integrator: 'zap-pilot-frontend' },
});

const publicClients: Record<number, unknown> = {
  [mainnet.id]: createPublicClient({
    chain: mainnet,
    transport: http('https://ethereum-rpc.publicnode.com'),
  }),
  [arbitrum.id]: createPublicClient({
    chain: arbitrum,
    transport: http('https://arb1.arbitrum.io/rpc'),
  }),
  [base.id]: createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  }),
};

export function getPublicClient(chainId: number): PublicClient {
  const client = publicClients[chainId];
  if (!client) {
    throw new Error(`No public client configured for chain ${chainId}`);
  }
  return client as PublicClient;
}

export interface BridgeStatus {
  status: string;
  substatus?: string;
  receiving?: {
    txHash?: Hash;
    chainId?: number;
  };
}

// waitForBridgeCompletion treats every status failure as transient, so these
// messages only ever reach logs and the onStatus/onAttempt observers.
const callLifiStatusApi = createApiServiceCaller(
  {
    429: 'LI.FI rate limit reached while checking bridge status.',
    500: 'LI.FI bridge status request failed.',
    502: 'LI.FI returned an invalid bridge status response.',
    503: 'LI.FI bridge status is temporarily unavailable.',
    504: 'LI.FI bridge status request timed out.',
  },
  'Failed to fetch LI.FI bridge status',
);

export function getBridgeStatus({
  txHash,
  fromChain,
  toChain,
  signal,
}: {
  txHash: Hash;
  fromChain: number;
  toChain: number;
  signal?: AbortSignal;
}): Promise<BridgeStatus> {
  const params = new URLSearchParams({
    txHash,
    fromChain: fromChain.toString(),
    toChain: toChain.toString(),
  });

  return callLifiStatusApi(() =>
    httpGet<BridgeStatus>(
      `https://li.quest/v1/status?${params}`,
      signal ? { signal } : {},
    ),
  );
}

export class BridgeFailedError extends Error {
  readonly substatus?: string;
  readonly lifiScanUrl: string;

  constructor(params: { txHash: Hash; status: BridgeStatus }) {
    const scanUrl = `https://scan.li.fi/tx/${params.txHash}`;
    super(
      `Bridge transfer ${params.status.status}${
        params.status.substatus ? ` (${params.status.substatus})` : ''
      } — inspect ${scanUrl}`,
    );
    this.name = 'BridgeFailedError';
    if (params.status.substatus !== undefined) {
      this.substatus = params.status.substatus;
    }
    this.lifiScanUrl = scanUrl;
  }
}

// LI.FI /status values: NOT_FOUND and PENDING are transient (NOT_FOUND is
// normal in the first minutes after submission); DONE / FAILED / INVALID are
// terminal.
const TERMINAL_BRIDGE_STATUSES = new Set(['DONE', 'FAILED', 'INVALID']);

/**
 * Poll LI.FI until the bridge transfer reaches a terminal status. Resolves on
 * DONE; throws BridgeFailedError on FAILED/INVALID; transient fetch errors are
 * retried with backoff by pollUntil.
 */
export async function waitForBridgeCompletion({
  txHash,
  fromChain,
  toChain,
  signal,
  onStatus,
}: {
  txHash: Hash;
  fromChain: number;
  toChain: number;
  signal?: AbortSignal;
  onStatus?: (status: BridgeStatus) => void;
}): Promise<BridgeStatus> {
  const status = await pollUntil<BridgeStatus>({
    fn: () =>
      getBridgeStatus({
        txHash,
        fromChain,
        toChain,
        ...(signal ? { signal } : {}),
      }),
    shouldStop: (value) => TERMINAL_BRIDGE_STATUSES.has(value.status),
    ...(signal ? { signal } : {}),
    onAttempt: (value) => {
      if (value) {
        onStatus?.(value);
      }
    },
  });

  if (status.status !== 'DONE') {
    throw new BridgeFailedError({ txHash, status });
  }

  return status;
}
