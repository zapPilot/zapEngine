import { describe, expect, it } from 'vitest';

import { resolveOperationalTopology } from './topology.js';

describe('operational topology branches', () => {
  it('returns unmapped for an unknown fingerprint', () => {
    expect(resolveOperationalTopology('posthog:events/product')).toEqual({
      service: null,
      entities: [],
      relatedFingerprints: { github: null, sentry: null, fly: null },
    });
    expect(resolveOperationalTopology('not-a-fingerprint')).toEqual({
      service: null,
      entities: [],
      relatedFingerprints: { github: null, sentry: null, fly: null },
    });
  });

  it('resolves a known github workflow to its service', () => {
    const result = resolveOperationalTopology(
      'github-actions:workflow/alpha-etl-daily-refresh.yml',
    );
    expect(result.service?.workspace).toBe('@zapengine/alpha-etl');
    expect(result.entities.map((entity) => entity.type)).toContain(
      'github-workflow',
    );
  });

  it('returns unmapped for an unknown github workflow', () => {
    expect(
      resolveOperationalTopology('github-actions:workflow/unknown.yml').service,
    ).toBeNull();
  });

  it('resolves sentry issues and stale history to the same service', () => {
    const issues = resolveOperationalTopology('sentry:issues/account-engine');
    expect(issues.service?.workspace).toBe('@zapengine/account-engine');
    const stale = resolveOperationalTopology(
      'sentry:stale-unresolved/account-engine',
    );
    expect(stale.service?.workspace).toBe('@zapengine/account-engine');
  });

  it('returns unmapped for an unknown sentry project', () => {
    expect(
      resolveOperationalTopology('sentry:issues/unknown-project').service,
    ).toBeNull();
  });

  it('resolves a fly app fingerprint to its service', () => {
    const result = resolveOperationalTopology('fly:app/alpha-etl');
    expect(result.service?.workspace).toBe('@zapengine/alpha-etl');
    expect(result.relatedFingerprints.fly).toBeNull();
  });

  it('resolves a fly process-group through the app boundary', () => {
    const result = resolveOperationalTopology(
      'fly:process-group/from-fed-to-chain-api/render',
    );
    expect(result.service?.workspace).toBe('@zapengine/podcast-pipeline');
    expect(result.relatedFingerprints.fly).toBeNull();
  });

  it('returns unmapped for an unknown fly app', () => {
    expect(resolveOperationalTopology('fly:app/unknown').service).toBeNull();
  });

  it('routes product-health and customer freshness to portfolio-freshness', () => {
    expect(
      resolveOperationalTopology('product-health:portfolio-freshness/main')
        .service?.impact,
    ).toBe('portfolio-freshness');
    expect(
      resolveOperationalTopology('customer-economics:freshness/main').service
        ?.impact,
    ).toBe('portfolio-freshness');
  });

  it('routes social-queue and social-daemon to social-media', () => {
    expect(
      resolveOperationalTopology('social-queue:waiting-media/podcast').service
        ?.impact,
    ).toBe('social-media');
    expect(
      resolveOperationalTopology('social-daemon:heartbeat/main').service
        ?.impact,
    ).toBe('social-media');
  });

  it('maps a sentry social-media service without a render key to its fly app', () => {
    const result = resolveOperationalTopology('sentry:issues/podcast-pipeline');
    expect(result.service?.impact).toBe('social-media');
    expect(result.relatedFingerprints.fly).toBe(
      'fly:app/from-fed-to-chain-api',
    );
  });

  it('maps a non-render service to its fly app fingerprint', () => {
    const result = resolveOperationalTopology(
      'github-actions:workflow/alpha-etl-daily-refresh.yml',
    );
    expect(result.relatedFingerprints.fly).toBe('fly:app/alpha-etl');
  });

  it('returns unmapped for an unsupported source', () => {
    expect(
      resolveOperationalTopology('posthog:audience/main').service,
    ).toBeNull();
  });
});
