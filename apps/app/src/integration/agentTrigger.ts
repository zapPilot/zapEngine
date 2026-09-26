/** Talks to the operator's local news agent (`pnpm agent serve`). */
import {
  AgentRunStatusSchema,
  type AgentRunStatus,
} from '@zapengine/types/api';

export interface AgentRunStart {
  result: 'started' | 'busy' | 'unreachable';
  /** The server's status with its answer; `null` when it sent none we can read. */
  status: AgentRunStatus | null;
}

const RUN_POLL_MS = 1_000;

/** `null` when no agent is serving; a bad answer from one that is, throws. */
export async function fetchAgentRunStatus(
  triggerUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AgentRunStatus | null> {
  let response: Response;
  try {
    response = await fetchImpl(`${triggerUrl}/runs/current`, {
      cache: 'no-store',
    });
  } catch {
    return null;
  }
  if (!response.ok) throw new Error(`Agent status failed: ${response.status}`);
  return AgentRunStatusSchema.parse(await response.json());
}

/**
 * Asks for one real run. Once the agent accepted (202) or refused as busy
 * (409), this never throws: a run may already be spending, so a caller must
 * not treat an unreadable body as a failure and try again.
 */
export async function startAgentRun(
  triggerUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AgentRunStart> {
  let response: Response;
  try {
    response = await fetchImpl(`${triggerUrl}/runs`, {
      method: 'POST',
      headers: { 'x-zap-trigger': '1' },
      cache: 'no-store',
    });
  } catch {
    return { result: 'unreachable', status: null };
  }
  if (response.status !== 202 && response.status !== 409) {
    throw new Error(`Agent trigger failed: ${response.status}`);
  }
  return {
    result: response.status === 202 ? 'started' : 'busy',
    status: await readStatus(response),
  };
}

async function readStatus(response: Response): Promise<AgentRunStatus | null> {
  try {
    return AgentRunStatusSchema.parse(await response.json());
  } catch {
    return null;
  }
}

export function runStatusRefetchInterval(
  status: AgentRunStatus | null | undefined,
): number | false {
  return status?.state === 'running' ? RUN_POLL_MS : false;
}

export function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}
