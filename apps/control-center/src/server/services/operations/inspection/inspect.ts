import type { OperationsSource } from '../../../../shared/types.js';
import type { ControlCenterConfig } from '../../../config/env.js';
import { parseOperationalFingerprint } from './fingerprint.js';
import { inspectFlySignal } from './fly.js';
import { inspectGithubSignal } from './github.js';
import {
  messageOf,
  unavailableInspection,
  unsupportedInspection,
  type InspectorInput,
} from './result.js';
import { inspectSentrySignal } from './sentry.js';
import type { SignalInspection } from './types.js';

type Inspector = (input: InspectorInput) => Promise<SignalInspection>;

const INSPECTORS: Partial<Record<OperationsSource, Inspector>> = {
  'github-actions': inspectGithubSignal,
  sentry: inspectSentrySignal,
  fly: inspectFlySignal,
};

export async function inspectOperationalSignal(input: {
  config: ControlCenterConfig;
  fingerprint: string;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}): Promise<SignalInspection> {
  const inspectedAt = input.now?.() ?? new Date();
  const parsed = parseOperationalFingerprint(input.fingerprint);
  if (!parsed) {
    return unsupportedInspection({
      fingerprint: input.fingerprint,
      source: null,
      inspectedAt,
      summary: 'Fingerprint must use source:kind/key form.',
    });
  }

  const source = inspectionSource(parsed.source);
  const inspector = source ? INSPECTORS[source] : undefined;
  if (!source || !inspector) {
    return unsupportedInspection({
      fingerprint: input.fingerprint,
      source: null,
      inspectedAt,
      summary: `Deep inspection is not implemented for ${parsed.source}.`,
      evidence: { source: parsed.source, kind: parsed.kind, key: parsed.key },
    });
  }

  try {
    return await inspector({
      config: input.config,
      fingerprint: input.fingerprint,
      parsed,
      inspectedAt,
      fetchImpl: input.fetchImpl ?? globalThis.fetch,
    });
  } catch (error) {
    const reason = messageOf(error);
    return unavailableInspection({
      fingerprint: input.fingerprint,
      source,
      inspectedAt,
      summary: `Deep inspection failed: ${reason}`,
      reason,
    });
  }
}

function inspectionSource(source: string): OperationsSource | null {
  if (source === 'github-actions' || source === 'sentry' || source === 'fly') {
    return source;
  }
  return null;
}
