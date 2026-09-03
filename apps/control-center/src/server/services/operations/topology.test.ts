import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { findRepoRoot } from './repo-root.js';
import { resolveOperationalTopology, SERVICE_TOPOLOGY } from './topology.js';

const repoRoot = findRepoRoot(import.meta.dirname);

describe('operational topology', () => {
  it('keeps GitHub workflow relationships aligned with schedules.json', () => {
    const schedules = JSON.parse(
      readFileSync(join(repoRoot, '.github', 'schedules.json'), 'utf8'),
    ) as Array<{ workspace?: string; entrypoint?: string }>;

    for (const service of SERVICE_TOPOLOGY) {
      for (const workflow of service.githubWorkflows) {
        expect(
          schedules.some(
            (entry) =>
              entry.workspace === service.workspace &&
              entry.entrypoint === `.github/workflows/${workflow}`,
          ),
          `${workflow} should belong to ${service.workspace}`,
        ).toBe(true);
      }
    }
  });

  it('keeps Fly app names aligned with each workspace fly.toml', () => {
    const directories: Record<string, string> = {
      '@zapengine/account-engine': 'account-engine',
      '@zapengine/alpha-etl': 'alpha-etl',
      '@zapengine/analytics-engine': 'analytics-engine',
      '@zapengine/podcast-pipeline': 'podcast-pipeline',
    };

    for (const service of SERVICE_TOPOLOGY) {
      if (!service.flyApp) {
        continue;
      }
      const directory = directories[service.workspace];
      expect(directory).toBeTruthy();
      const toml = readFileSync(
        join(repoRoot, 'apps', directory!, 'fly.toml'),
        'utf8',
      );
      expect(toml).toMatch(
        new RegExp(`^app\\s*=\\s*['"]${service.flyApp}['"]$`, 'mu'),
      );
    }
  });

  it('resolves alpha-etl cron failures across providers deterministically', () => {
    const result = resolveOperationalTopology(
      'github-actions:workflow/alpha-etl-daily-refresh.yml',
    );

    expect(result.service).toMatchObject({
      workspace: '@zapengine/alpha-etl',
      flyApp: 'alpha-etl',
      sentryProject: 'alpha-etl',
      impact: 'portfolio-freshness',
    });
    expect(result.relatedFingerprints).toEqual({
      github: 'github-actions:workflow/alpha-etl-daily-refresh.yml',
      sentry: 'sentry:issues/alpha-etl',
      fly: 'fly:app/alpha-etl',
    });
  });

  it('routes social incidents to the podcast render process group', () => {
    const result = resolveOperationalTopology(
      'social-queue:waiting-media/podcast',
    );

    expect(result.service?.workspace).toBe('@zapengine/podcast-pipeline');
    expect(result.relatedFingerprints.fly).toBe(
      'fly:process-group/from-fed-to-chain-api/render',
    );
    expect(result.relatedFingerprints.sentry).toBe(
      'sentry:issues/podcast-pipeline',
    );
  });
});
