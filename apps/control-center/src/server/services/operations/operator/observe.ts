import { z } from 'zod';
import {
  opsCorrelationSchema,
  type OpsVerification,
} from '@zapengine/types/shared';
import type { ControlCenterConfig } from '../../../config/env.js';
import { fetchJson } from '../http.js';
import type { OperatorStore } from './store.js';
import { verifyRecovery } from './verification.js';

export const fixSchema = z.object({
  incidentId: z.uuid(),
  rootCause: z.string().min(1),
  fixSha: z.string().regex(/^[a-f0-9]{40}$/),
  prNumber: z.number().int().positive().nullable(),
  issueId: z.string().regex(/^\d+$/),
  machineId: z.string().regex(/^[a-zA-Z0-9]+$/),
  localizationId: z.uuid(),
  app: z.literal('from-fed-to-chain-api'),
  authorizeResolve: z.boolean().default(false),
});
const machineSchema = z.object({
  id: z.string(),
  state: z.string(),
  instance_id: z.string(),
  config: z.object({
    env: z.record(z.string(), z.string()).optional(),
    metadata: z.record(z.string(), z.string()),
  }),
  events: z.array(
    z.object({ status: z.string().optional(), timestamp: z.number() }),
  ),
});

/** Provider reads happen here; callers cannot submit a claimed clean observation. */
export async function observeRecovery(input: {
  store: OperatorStore;
  config: ControlCenterConfig;
  fix: z.infer<typeof fixSchema>;
  now?: Date;
  fetchImpl?: typeof fetch;
}) {
  const { fix, config, store } = input;
  const now = input.now ?? new Date();
  try {
    if (!config.FLY_OPS_TOKEN || !config.SENTRY_OPS_AUTH_TOKEN) {
      throw new Error('Verification provider credentials are missing.');
    }
    const machine = await fetchJson({
      label: 'Verification runtime',
      url: `https://api.machines.dev/v1/apps/${fix.app}/machines/${fix.machineId}`,
      token: config.FLY_OPS_TOKEN,
      schema: machineSchema,
      fetchImpl: input.fetchImpl ?? fetch,
    });
    const started = machine.events
      .filter((event) => event.status === 'started')
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    const release = machine.config.metadata['fly_release_id'];
    if (!started || !release || machine.id !== fix.machineId) {
      throw new Error('Active runtime identity is incomplete.');
    }
    const activeAt = new Date(started.timestamp).toISOString();
    const targets = await store.renderTargets(fix.localizationId);
    const target = targets.find(
      (row) => row.localizationId === fix.localizationId,
    );
    const records = await store.runtime('localizationId', fix.localizationId);
    const runtime = records.find(
      (row) =>
        row.correlation.flyMachineId === fix.machineId &&
        Date.parse(row.observedAt) >= started.timestamp,
    );
    const sha = runtime?.correlation.gitSha;
    if (!sha) {
      throw new Error('Producer has not attested the running commit.');
    }
    const issueEvent = await fetchJson({
      label: 'Verification issue identity',
      url: `https://sentry.io/api/0/issues/${fix.issueId}/events/latest/`,
      token: config.SENTRY_OPS_AUTH_TOKEN,
      fetchImpl: input.fetchImpl ?? fetch,
      schema: z.object({
        contexts: z.object({ opsCorrelation: opsCorrelationSchema }),
      }),
    });
    if (
      issueEvent.contexts.opsCorrelation.localizationId !== fix.localizationId
    ) {
      throw new Error('Sentry issue does not attest the exact failed job.');
    }
    let truncated = false;
    const events = await fetchJson({
      label: 'Verification Sentry events',
      url: `https://sentry.io/api/0/issues/${fix.issueId}/events/?start=${encodeURIComponent(activeAt)}&end=${encodeURIComponent(now.toISOString())}&full=false`,
      token: config.SENTRY_OPS_AUTH_TOKEN,
      schema: z.array(
        z.object({ eventID: z.string().optional(), dateCreated: z.string() }),
      ),
      fetchImpl: input.fetchImpl ?? fetch,
      onResponseHeaders: (headers) => {
        truncated = /rel="next"[^,]*results="true"/.test(
          headers.get('link') ?? '',
        );
      },
    });
    const base = {
      target: fix.localizationId,
      from: activeAt,
      until: now.toISOString(),
      deployedSha: sha,
    };
    const evidence: OpsVerification = {
      policyVersion: 'ops-verification-v1',
      rootCause: fix.rootCause,
      fixSha: fix.fixSha,
      prNumber: fix.prNumber,
      deploymentId: machine.instance_id,
      deployedSha: sha,
      release,
      target: fix.localizationId,
      activeAt,
      observedUntil: now.toISOString(),
      minimumObservationSeconds: 900,
      signals: [
        {
          ...base,
          kind: 'sentry',
          status: truncated
            ? 'unavailable'
            : events.length === 0
              ? 'recovered'
              : 'failed',
          evidenceId: fix.issueId,
        },
        {
          ...base,
          kind: 'queue',
          status:
            target?.renderStatus === 'completed' &&
            runtime &&
            target.renderCompletedAt &&
            Date.parse(target.renderCompletedAt) >=
              Date.parse(runtime.observedAt) &&
            Date.parse(target.renderCompletedAt) <= now.getTime()
              ? 'recovered'
              : 'failed',
          evidenceId: fix.localizationId,
        },
        {
          ...base,
          kind: 'runtime',
          status: machine.state === 'started' ? 'recovered' : 'failed',
          evidenceId: machine.id,
        },
      ],
    };
    const verdict = verifyRecovery(
      evidence,
      ['sentry', 'queue', 'runtime'],
      now,
    );
    await store.rpc('ops_record_verification', {
      p_incident: fix.incidentId,
      p_verified: verdict.verified,
      p_evidence: evidence,
      p_blockers: verdict.blockers,
    });
    return verdict;
  } catch {
    const blockers = ['Production verification is unavailable or incomplete.'];
    await store.rpc('ops_record_verification', {
      p_incident: fix.incidentId,
      p_verified: false,
      p_evidence: {},
      p_blockers: blockers,
    });
    return { verified: false, blockers };
  }
}
