import type { ControlCenterConfig } from '../../../config/env.js';
import { parseOperationalFingerprint } from './fingerprint.js';
import { inspectFlySignal } from './fly.js';
import { inspectGithubSignal } from './github.js';
import { inspectSentrySignal } from './sentry.js';
import type { SignalInspection } from './types.js';

export async function inspectOperationalSignal(input: {
  config: ControlCenterConfig;
  fingerprint: string;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}): Promise<SignalInspection> {
  const inspectedAt = input.now?.() ?? new Date();
  const parsed = parseOperationalFingerprint(input.fingerprint);
  if (!parsed) {
    return {
      fingerprint: input.fingerprint,
      source: null,
      status: 'unsupported',
      inspectedAt: inspectedAt.toISOString(),
      // eslint-disable-next-line no-template-curly-in-string
      summary: 'Fingerprint is not in `${source}:${kind}/${key}` form.',
      entities: [],
      evidence: {},
      gaps: [],
    };
  }

  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  try {
    if (parsed.source === 'github-actions') {
      return await inspectGithubSignal({
        config: input.config,
        fingerprint: input.fingerprint,
        parsed,
        inspectedAt,
        fetchImpl,
      });
    }
    if (parsed.source === 'sentry') {
      return await inspectSentrySignal({
        config: input.config,
        fingerprint: input.fingerprint,
        parsed,
        inspectedAt,
        fetchImpl,
      });
    }
    if (parsed.source === 'fly') {
      return await inspectFlySignal({
        config: input.config,
        fingerprint: input.fingerprint,
        parsed,
        inspectedAt,
        fetchImpl,
      });
    }

    return {
      fingerprint: input.fingerprint,
      source: null,
      status: 'unsupported',
      inspectedAt: inspectedAt.toISOString(),
      summary: `Deep inspection is not implemented for ${parsed.source}.`,
      entities: [],
      evidence: { source: parsed.source, kind: parsed.kind, key: parsed.key },
      gaps: [],
    };
  } catch (error) {
    const source =
      parsed.source === 'github-actions'
        ? 'github-actions'
        : parsed.source === 'sentry'
          ? 'sentry'
          : parsed.source === 'fly'
            ? 'fly'
            : null;
    return {
      fingerprint: input.fingerprint,
      source,
      status: 'unavailable',
      inspectedAt: inspectedAt.toISOString(),
      summary: `Deep inspection failed: ${messageOf(error)}`,
      entities: [],
      evidence: {},
      gaps: source ? [{ source, reason: messageOf(error) }] : [],
    };
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
