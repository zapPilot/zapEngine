import { describe, expect, it } from 'vitest';

import { productAcquisitionFromOperations } from '../product-acquisition.js';
import { ruleProductDemand } from './product-demand.js';
import type { StatementInputs } from './types.js';

const EVIDENCE = {
  uniqueUsers7d: 107,
  uniqueUsers30d: 115,
  landingVisitors7d: 101,
  landingVisitors30d: 109,
  ctaUsers7d: 1,
  ctaUsers30d: 1,
  appVisitors7d: 5,
  appVisitors30d: 6,
  walletConnectedUsers7d: 4,
  walletConnectedUsers30d: 5,
  landingDeadClickUsers7d: 7,
};

function operations(status = 'healthy') {
  return {
    generatedAt: '2026-09-08T07:00:00.000Z',
    domains: [],
    priorities: [],
    signals: [
      {
        fingerprint: 'posthog:audience/project',
        source: 'posthog',
        domain: 'analytics',
        kind: 'audience',
        key: 'project',
        status,
        title: 'PostHog audience',
        detail: 'reachable',
        evidence: EVIDENCE,
        observedAt: '2026-09-08T07:00:00.000Z',
        url: 'https://us.posthog.com/project/4242',
      },
    ],
  };
}

describe('product acquisition projection', () => {
  it('reads typed acquisition metrics from the healthy PostHog signal', () => {
    const result = productAcquisitionFromOperations(operations() as never);

    expect(result).toEqual(EVIDENCE);
  });

  it('does not treat degraded analytics as product truth', () => {
    expect(
      productAcquisitionFromOperations(operations('degraded') as never),
    ).toBe(null);
  });
});

describe('ruleProductDemand', () => {
  it('turns the acquisition read into a decision-oriented Product insight', () => {
    const finding = ruleProductDemand({
      operations: operations(),
    } as unknown as StatementInputs);

    const sentence = finding.segments
      .map((segment) => ('value' in segment ? segment.value : segment.text))
      .join('');

    expect(sentence).toBe(
      '109 landing visitors in 30d; 1 showed waitlist CTA intent (0.9%). 6 app visitors overall; 5 wallet connects were observed overall, not attributed to the waitlist.',
    );
    expect(finding.fact).toEqual({
      kicker: 'Because · product demand',
      value: '109 landing visitors · 30d',
      note: 'Waitlist telemetry unavailable · 1 waitlist CTA intent (0.9%) · 6 app visitors · 5 wallet connects overall · 7 landing dead-click users · 7d',
    });
    expect(finding.status).toBe('healthy');
  });

  it('stays silent when PostHog acquisition is unavailable', () => {
    const finding = ruleProductDemand({
      operations: operations('degraded'),
    } as unknown as StatementInputs);

    expect(finding.segments).toEqual([]);
    expect(finding.fact).toBeNull();
  });
  it.each(['healthy', 'degraded'])(
    'shows persisted demand with %s PostHog',
    (status) => {
      const finding = ruleProductDemand({
        operations: operations(status),
        socialGrowth: {
          waitlist: {
            status: 'ok',
            message: null,
            total: 42,
            signups7d: 5,
            signups30d: 12,
            attributedSocial7d: 3,
            directOrUnknown7d: 2,
            conversions: [],
          },
        },
      } as unknown as StatementInputs);
      const sentence = finding.segments
        .map((s) => ('value' in s ? s.value : s.text))
        .join('');
      expect(sentence).toContain(
        '42 total waitlist signups; 12 new in 30d, 5 in 7d (3 social-attributed; 2 direct / unknown).',
      );
      expect(sentence.includes('109 landing visitors')).toBe(
        status === 'healthy',
      );
      expect(finding.status).toBe('healthy');
      expect(finding.fact?.value).toBe('42 total waitlist signups');
    },
  );
});
