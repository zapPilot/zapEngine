import { parseOperationalFingerprint } from './inspection/fingerprint.js';
import type { OperationalEntityRef } from './inspection/types.js';

export type OperationalImpact =
  | 'portfolio-freshness'
  | 'analytics'
  | 'account-service'
  | 'social-media';

export interface ServiceTopology {
  workspace: string;
  flyApp: string | null;
  sentryProject: string;
  githubWorkflows: readonly string[];
  impact: OperationalImpact;
}

/**
 * Small, explicit service topology. The values are repository facts rather
 * than inferred naming conventions: workflow/workspace relationships come from
 * `.github/schedules.json`, while Fly app names come from each workspace's
 * deployment config (`fly.toml` / env destination). Tests hold this table to
 * those files so a rename fails loudly instead of teaching the agent a guess.
 */
export const SERVICE_TOPOLOGY: readonly ServiceTopology[] = [
  {
    workspace: '@zapengine/account-engine',
    flyApp: 'account-engine',
    sentryProject: 'account-engine',
    githubWorkflows: [
      'strategy-change-broadcast.yml',
      'telegram-token-cleanup.yml',
    ],
    impact: 'account-service',
  },
  {
    workspace: '@zapengine/alpha-etl',
    flyApp: 'alpha-etl',
    sentryProject: 'alpha-etl',
    githubWorkflows: ['alpha-etl-daily-refresh.yml'],
    impact: 'portfolio-freshness',
  },
  {
    workspace: '@zapengine/analytics-engine',
    flyApp: 'analytics-engine-xws3ra',
    sentryProject: 'analytics-engine',
    githubWorkflows: ['backtest-refresh.yml'],
    impact: 'analytics',
  },
  {
    workspace: '@zapengine/podcast-pipeline',
    flyApp: 'from-fed-to-chain-api',
    sentryProject: 'podcast-pipeline',
    githubWorkflows: ['distribution-snapshot.yml'],
    impact: 'social-media',
  },
];

export interface TopologyResolution {
  service: ServiceTopology | null;
  entities: OperationalEntityRef[];
  relatedFingerprints: {
    github: string | null;
    sentry: string | null;
    fly: string | null;
  };
}

export function resolveOperationalTopology(
  fingerprint: string,
): TopologyResolution {
  const parsed = parseOperationalFingerprint(fingerprint);
  const service = parsed
    ? serviceFor(parsed.source, parsed.kind, parsed.key)
    : null;
  if (!service) {
    return {
      service: null,
      entities: [],
      relatedFingerprints: { github: null, sentry: null, fly: null },
    };
  }

  const workflow = service.githubWorkflows[0] ?? null;
  const flyFingerprint = relatedFlyFingerprint(
    service,
    parsed?.source ?? '',
    parsed?.key ?? '',
  );
  return {
    service,
    entities: [
      { type: 'workspace', id: service.workspace },
      ...(workflow ? [{ type: 'github-workflow' as const, id: workflow }] : []),
      ...(service.flyApp
        ? [
            {
              type: 'fly-app' as const,
              id: service.flyApp,
              url: `https://fly.io/apps/${service.flyApp}`,
            },
          ]
        : []),
      { type: 'sentry-project', id: service.sentryProject },
    ],
    relatedFingerprints: {
      github: workflow ? `github-actions:workflow/${workflow}` : null,
      sentry: `sentry:issues/${service.sentryProject}`,
      fly: flyFingerprint,
    },
  };
}

function serviceFor(source: string, kind: string, key: string) {
  if (source === 'github-actions' && kind === 'workflow') {
    return (
      SERVICE_TOPOLOGY.find((service) =>
        service.githubWorkflows.includes(key),
      ) ?? null
    );
  }

  if (source === 'sentry' && kind === 'issues') {
    return (
      SERVICE_TOPOLOGY.find((service) => service.sentryProject === key) ?? null
    );
  }

  if (source === 'fly') {
    const app = kind === 'process-group' ? appFromProcessGroupKey(key) : key;
    return SERVICE_TOPOLOGY.find((service) => service.flyApp === app) ?? null;
  }

  if (
    (source === 'product-health' && kind === 'portfolio-freshness') ||
    (source === 'customer-economics' && kind === 'freshness')
  ) {
    return byImpact('portfolio-freshness');
  }

  if (source === 'social-queue' || source === 'social-daemon') {
    return byImpact('social-media');
  }

  return null;
}

function relatedFlyFingerprint(
  service: ServiceTopology,
  source: string,
  key: string,
): string | null {
  if (!service.flyApp) return null;
  if (source === 'fly') {
    return null;
  }
  if (service.impact === 'social-media' && source.startsWith('social-')) {
    return `fly:process-group/${service.flyApp}/render`;
  }
  if (service.impact === 'social-media' && key.includes('render')) {
    return `fly:process-group/${service.flyApp}/render`;
  }
  return `fly:app/${service.flyApp}`;
}

function appFromProcessGroupKey(key: string): string {
  const boundary = key.lastIndexOf('/');
  return boundary > 0 ? key.slice(0, boundary) : key;
}

function byImpact(impact: OperationalImpact): ServiceTopology | null {
  return SERVICE_TOPOLOGY.find((service) => service.impact === impact) ?? null;
}
