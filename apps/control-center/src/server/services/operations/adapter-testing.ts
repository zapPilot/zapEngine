import { expect, vi } from 'vitest';

import type { OperationalSignal } from '../../../shared/types.js';
import {
  readControlCenterConfig,
  type ControlCenterConfig,
} from '../../config/env.js';

/**
 * A `fetch` that answers every call with the same JSON body.
 *
 * Deliberately blind to the URL: an adapter test is about what the adapter
 * does with a provider's answer, and a test that also needs to assert on the
 * request reads `mock.calls` rather than teaching this stub about routing.
 */
export function fetchReturning(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify(body), { status }),
  );
}

/**
 * The contract shared by every credential-gated adapter: with its credentials
 * missing it reports exactly one `unknown` signal and sends nothing.
 *
 * Both halves are easy to lose and neither loss is visible on the dashboard.
 * Reporting `healthy` for an integration nobody configured paints a green
 * domain out of silence, and calling a provider anonymously turns an unset
 * variable into a 401 that reads as the provider being broken.
 */
export async function expectUnconfigured(input: {
  env: NodeJS.ProcessEnv;
  fingerprint: string;
  collect: (
    config: ControlCenterConfig,
    fetchImpl: typeof fetch,
  ) => Promise<OperationalSignal[]>;
}): Promise<void> {
  const fetchImpl = vi.fn<typeof fetch>();

  const signals = await input.collect(
    readControlCenterConfig(input.env),
    fetchImpl,
  );

  expect(fetchImpl).not.toHaveBeenCalled();
  expect(signals).toHaveLength(1);
  expect(signals[0]?.status).toBe('unknown');
  expect(signals[0]?.fingerprint).toBe(input.fingerprint);
}
