import { afterEach, describe, expect, it } from 'vitest';

import {
  resolveOperationalTopology,
  SERVICE_TOPOLOGY,
  type ServiceTopology,
} from './topology.js';
import { parseFlyBillingHtml } from '../fly-billing/parse.js';

const topology = SERVICE_TOPOLOGY as ServiceTopology[];
const original = [...SERVICE_TOPOLOGY];

afterEach(() => {
  topology.splice(0, topology.length, ...original);
});

describe('coverage handoff: topology edge contracts', () => {
  it('supports a declared service without Fly or scheduled workflows', () => {
    topology.push({
      workspace: '@zapengine/local-only',
      flyApp: null,
      sentryProject: 'local-only',
      githubWorkflows: [],
      impact: 'analytics',
    });

    expect(resolveOperationalTopology('sentry:issues/local-only')).toEqual({
      service: expect.objectContaining({ workspace: '@zapengine/local-only' }),
      entities: [
        { type: 'workspace', id: '@zapengine/local-only' },
        { type: 'sentry-project', id: 'local-only' },
      ],
      relatedFingerprints: {
        github: null,
        sentry: 'sentry:issues/local-only',
        fly: null,
      },
    });
  });

  it('returns unmapped when an impact has no declared owner', () => {
    topology.splice(
      0,
      topology.length,
      ...original.filter((service) => service.impact !== 'portfolio-freshness'),
    );

    expect(
      resolveOperationalTopology('product-health:portfolio-freshness/main'),
    ).toEqual({
      service: null,
      entities: [],
      relatedFingerprints: { github: null, sentry: null, fly: null },
    });
  });

  it('keeps a process-group key without a slash intact', () => {
    topology.push({
      workspace: '@zapengine/singleton',
      flyApp: 'singleton',
      sentryProject: 'singleton',
      githubWorkflows: [],
      impact: 'analytics',
    });

    const result = resolveOperationalTopology('fly:process-group/singleton');
    expect(result.service?.workspace).toBe('@zapengine/singleton');
    expect(result.relatedFingerprints.fly).toBeNull();
  });

  it('uses the app-level Fly signal for a non-social render key', () => {
    const result = resolveOperationalTopology(
      'github-actions:workflow/backtest-refresh.yml',
    );
    expect(result.relatedFingerprints.fly).toBe(
      'fly:app/analytics-engine-xws3ra',
    );
  });

  it('maps a render workflow key to the process-group Fly signal', () => {
    topology.push({
      workspace: '@zapengine/render-worker',
      flyApp: 'render-worker',
      sentryProject: 'render-worker',
      githubWorkflows: ['video-render.yml'],
      impact: 'social-media',
    });

    const result = resolveOperationalTopology(
      'github-actions:workflow/video-render.yml',
    );
    expect(result.relatedFingerprints.fly).toBe(
      'fly:process-group/render-worker/render',
    );
  });
});

describe('coverage handoff: Fly billing parser numeric boundaries', () => {
  it('rejects a labelled amount too large to be finite', () => {
    const digits = '9'.repeat(400);
    expect(() =>
      parseFlyBillingHtml(
        `<dl><dt>Upcoming Invoice</dt><dd>$${digits}</dd></dl>`,
      ),
    ).toThrow(/no "Upcoming Invoice" amount/);
  });

  it('parses negative amounts and one-decimal optional neighbours', () => {
    expect(
      parseFlyBillingHtml(`
        <dl>
          <dt>Upcoming Invoice</dt><dd>$ -12.3</dd>
          <dt>Last Invoice</dt><dd>$ 1.2</dd>
          <dt>Credit Balance</dt><dd>$ -0.5</dd>
        </dl>
      `),
    ).toEqual({
      upcomingInvoiceUsd: -12.3,
      lastInvoiceUsd: 1.2,
      creditBalanceUsd: -0.5,
    });
  });
});
