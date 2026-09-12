import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';
import { canRestartRender } from '../../podcast-retry-eligibility.js';

export const OPERATOR_EXECUTOR = 'ops-operator-runner';
export const OPERATOR_CATALOG_NOTE =
  'This catalog describes unattended server runner actions. allowed:false means the runner does not execute the action; agents may deliver reviewed pull requests under the backlog or incident skill.';

export interface RenderTarget {
  episodeId: string;
  localizationId: string;
  renderStatus: string;
  renderLeaseExpiresAt: string | null;
  visualStatus: string | null;
  visualVersion: string | null;
  deploymentOpen: boolean;
  previousAttempt: boolean;
}
export function renderAction(
  target: RenderTarget,
  enabled: boolean,
  now = new Date(),
) {
  const blockers: string[] = [];
  if (!enabled) {
    blockers.push('Automatic mutations are disabled.');
  }
  if (!target.episodeId || !target.localizationId) {
    blockers.push('Exact target is missing.');
  }
  if (!target.deploymentOpen) {
    blockers.push('Deployment gate is closed or unknown.');
  }
  if (target.previousAttempt) {
    blockers.push('One-repair budget is consumed.');
  }
  if (
    target.renderStatus !== 'failed' ||
    !canRestartRender({ ...target, now })
  ) {
    blockers.push('Render is not eligible for retry.');
  }
  return {
    kind: 'retry-render',
    executor: OPERATOR_EXECUTOR,
    target: target.localizationId,
    tier: 1,
    policyVersion: 'ops-actions-v1',
    allowed: blockers.length === 0,
    blockers,
    preconditions: [
      'exact target',
      'failed render',
      'current completed checkpoint',
      'no active lease',
      'deployment gate open',
      'one repair budget',
    ],
    idempotency: 'one attempt per incident; transactional queue mutation',
    blastRadius: 'one localization render',
    requiredEvidence: ['queue row', 'visual checkpoint', 'deployment gate'],
    verification:
      'exact job completed on an identified runtime; no matching post-deploy errors',
    visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
  };
}
export const manualActions = [
  { kind: 'patch-and-pr', tier: 2 },
  { kind: 'deploy-or-rollback', tier: 3 },
  { kind: 'destructive-or-investment', tier: 4 },
].map((action) => ({
  ...action,
  executor: OPERATOR_EXECUTOR,
  allowed: false,
  target: 'explicit human-selected target',
  preconditions: ['explicit approval', 'exact target', 'verification plan'],
  idempotency: 'not automatically executed',
  blastRadius: 'requires human assessment',
  requiredEvidence: ['root cause', 'tested repair'],
  verification: 'production recovery evidence',
  blockers: [
    'Not executed by the ops-operator runner: outside its automatic Tier 1 policy. Deliver this change through a reviewed pull request instead.',
  ],
}));
