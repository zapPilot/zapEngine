import type { ControlCenterConfig } from '../../../config/env.js';
import { fixSchema, observeRecovery } from './observe.js';
import { randomUUID } from 'node:crypto';
import type { OpsMcpOperations } from '../../../mcp/types.js';
import { renderAction } from './actions.js';
import type { OperatorStore } from './store.js';

export async function runOperatorCycle(input: {
  operations: Pick<
    OpsMcpOperations,
    'getOperations' | 'investigate' | 'resolveSentryIssue'
  >;
  store: OperatorStore;
  config: ControlCenterConfig;
  actor: string;
  mutationsEnabled: boolean;
}) {
  // Record liveness before reading the operational snapshot. GitHub run history
  // cannot safely monitor this workflow from inside itself: the current run is
  // still in progress, so completed-run streaks are necessarily one cycle late.
  await input.store.recordHeartbeat(input.actor);

  const open = await input.store.history();
  const pending = open.find(
    (row) =>
      row['state'] !== 'verified' && fixSchema.safeParse(row['fix']).success,
  );
  if (pending) {
    const verdict = await observeRecovery({
      store: input.store,
      config: input.config,
      fix: fixSchema.parse(pending['fix']),
    });
    const fix = fixSchema.parse(pending['fix']);
    await input.store.rpc('ops_record_cycle', {
      p_id: randomUUID(),
      p_fingerprint: pending['fingerprint'],
      p_actor: input.actor,
      p_correlation: pending['correlation'],
      p_evidence: { verification: verdict, fix },
      p_decision: verdict.verified
        ? 'Production recovery verified.'
        : verdict.blockers.join(' '),
    });
    if (verdict.verified && fix.authorizeResolve && input.mutationsEnabled) {
      await input.operations.resolveSentryIssue(
        fix.issueId,
        'Persisted deploy-aware production verification passed.',
      );
    }
    return { state: verdict.verified ? 'verified' : 'observing', verdict };
  }
  const awaitingDiagnosis = open.find(
    (row) =>
      row['state'] === 'deployed_observing' &&
      !fixSchema.safeParse(row['fix']).success,
  );
  if (awaitingDiagnosis) {
    const blockers = [
      'Repair result requires a registered diagnosis and exact fix/deployment identity before production verification.',
    ];
    await input.store.rpc('ops_record_verification', {
      p_incident: awaitingDiagnosis['id'],
      p_verified: false,
      p_evidence: {},
      p_blockers: blockers,
    });
    await input.store.rpc('ops_record_cycle', {
      p_id: randomUUID(),
      p_fingerprint: awaitingDiagnosis['fingerprint'],
      p_actor: input.actor,
      p_correlation: awaitingDiagnosis['correlation'],
      p_evidence: { blockers },
      p_decision: blockers[0],
    });
    return { state: 'needs_human', blockers };
  }
  const snapshot = await input.operations.getOperations(false);
  const targets = await input.store.renderTargets();
  const target = targets.find(
    (candidate) => candidate.renderStatus === 'failed',
  );
  const fingerprint = target
    ? `social-queue:render/${target.localizationId}`
    : snapshot.priorities[0]?.signal.fingerprint;
  if (!fingerprint) {
    return { state: 'idle' };
  }
  const packet = await input.operations.investigate(fingerprint, false);
  const history = await input.store.history(fingerprint);
  const priorActions = history[0]?.['actions'];
  const action = target
    ? renderAction(
        {
          ...target,
          previousAttempt:
            Array.isArray(priorActions) && priorActions.length > 0,
        },
        input.mutationsEnabled,
      )
    : null;
  if (action && packet.remediation.blockers.length > 0) {
    action.blockers.push(...packet.remediation.blockers);
    action.allowed = false;
  }
  const cycleId = randomUUID();
  await input.store.rpc('ops_record_cycle', {
    p_id: cycleId,
    p_fingerprint: fingerprint,
    p_actor: input.actor,
    p_correlation: target
      ? {
          episodeId: target.episodeId,
          localizationId: target.localizationId,
          renderJobId: target.localizationId,
        }
      : {},
    p_evidence: {
      generatedAt: snapshot.generatedAt,
      remediation: packet.remediation,
      action,
    },
    p_decision: action?.allowed
      ? 'One bounded render retry is authorized.'
      : (action?.blockers.join(' ') ?? 'No autonomous action is allowed.'),
  });
  if (!target || !action?.allowed) {
    return { state: 'needs_human', fingerprint, action };
  }
  // The RPC rechecks target state under the deployment gate and persists failures.
  const result = await input.store.rpc('ops_retry_render', {
    p_cycle_id: cycleId,
    p_episode_id: target.episodeId,
    p_localization_id: target.localizationId,
    p_visual_version: action.visualVersion,
  });
  const succeeded =
    typeof result === 'object' &&
    result !== null &&
    'state' in result &&
    result.state === 'succeeded';
  return {
    state: succeeded ? 'observing' : 'needs_human',
    fingerprint,
    action,
    result,
  };
}
