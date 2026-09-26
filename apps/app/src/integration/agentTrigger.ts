/** Asks the operator's local news agent (`pnpm agent serve`) for one real run. */

export type AgentRunStart = 'started' | 'busy' | 'unreachable';

export async function startAgentRun(
  triggerUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AgentRunStart> {
  let response: Response;
  try {
    response = await fetchImpl(`${triggerUrl}/runs`, {
      method: 'POST',
      headers: { 'x-zap-trigger': '1' },
    });
  } catch {
    return 'unreachable';
  }
  if (response.status === 202) return 'started';
  if (response.status === 409) return 'busy';
  throw new Error(`Agent trigger failed: ${response.status}`);
}

export function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}
