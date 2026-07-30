import { isRecord } from '../lib/typeGuards.js';

/**
 * Minimal Fly Machines API client, used by the always-on `app` process group to
 * start the on-demand `render` group. Only the two calls that wake a machine are
 * modelled — this is not a general Fly SDK.
 */

// Reachable only from inside the Fly private network, so waking a machine never
// leaves the WireGuard mesh — which is also why it is plain HTTP: Fly publishes
// no TLS listener for the in-mesh endpoint.
// https://fly.io/docs/machines/api/working-with-machines-api/
// eslint-disable-next-line sonarjs/no-clear-text-protocols -- documented in-mesh endpoint; no HTTPS equivalent exists
export const FLY_INTERNAL_API_BASE_URL = 'http://_api.internal:4280';

const FLY_API_TIMEOUT_MS = 10_000;

export interface FlyMachineSummary {
  id: string;
  state: string;
  processGroup: string | null;
}

export class FlyApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'FlyApiError';
    this.status = status;
  }
}

export interface FlyMachinesClient {
  listMachines(): Promise<FlyMachineSummary[]>;
  startMachine(machineId: string): Promise<void>;
}

export interface FlyMachinesClientOptions {
  appName: string;
  token: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function createFlyMachinesClient(
  options: FlyMachinesClientOptions,
): FlyMachinesClient {
  const baseUrl = options.baseUrl ?? FLY_INTERNAL_API_BASE_URL;
  const timeoutMs = options.timeoutMs ?? FLY_API_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const appPath = `${baseUrl}/v1/apps/${encodeURIComponent(options.appName)}`;

  const request = async (method: string, path: string): Promise<unknown> => {
    const response = await fetchImpl(`${appPath}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${options.token}`,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      // Surface the status so callers can tell an expired token (401/403) apart
      // from a transient Fly outage.
      throw new FlyApiError(
        `Fly Machines API ${method} ${path} failed: ${response.status}`,
        response.status,
      );
    }

    return response.status === 204 ? null : await response.json();
  };

  return {
    async listMachines(): Promise<FlyMachineSummary[]> {
      const payload = await request('GET', '/machines');
      if (!Array.isArray(payload)) {
        throw new Error('Fly Machines API returned a non-array machine list');
      }
      return payload.flatMap((entry) => {
        const machine = toMachineSummary(entry);
        return machine ? [machine] : [];
      });
    },

    async startMachine(machineId: string): Promise<void> {
      await request('POST', `/machines/${encodeURIComponent(machineId)}/start`);
    },
  };
}

function toMachineSummary(entry: unknown): FlyMachineSummary | null {
  if (!isRecord(entry)) return null;
  const { id, state } = entry;
  if (typeof id !== 'string' || typeof state !== 'string') return null;

  const config = isRecord(entry['config']) ? entry['config'] : null;
  const metadata =
    config && isRecord(config['metadata']) ? config['metadata'] : null;
  const processGroup = metadata?.['fly_process_group'];

  return {
    id,
    state,
    processGroup: typeof processGroup === 'string' ? processGroup : null,
  };
}
