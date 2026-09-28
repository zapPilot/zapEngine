import { describe, expect, it } from 'vitest';

import { ruleProductDemand } from './product-demand.js';
import type { StatementInputs } from './types.js';

const OBSERVED_AT = '2026-09-08T07:00:00.000Z';

function operations(evidence: Record<string, number>, status = 'healthy') {
  return {
    generatedAt: OBSERVED_AT,
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
        evidence,
        observedAt: OBSERVED_AT,
        url: 'https://us.posthog.com/project/4242',
      },
    ],
  };
}

function findingFor(evidence: Record<string, number>) {
  return ruleProductDemand({
    community: { status: 'unavailable' },
    operations: operations(evidence),
  } as unknown as StatementInputs);
}

function sentenceOf(finding: ReturnType<typeof ruleProductDemand>): string {
  return finding.segments
    .map((segment) => ('value' in segment ? segment.value : segment.text))
    .join('');
}

describe('ruleProductDemand coverage', () => {
  it('warns when landing visitors show zero waitlist intent', () => {
    const finding = findingFor({
      landingVisitors30d: 109,
      ctaUsers30d: 0,
    });

    expect(sentenceOf(finding)).toBe(
      '109 landing visitors in 30d; 0 showed waitlist CTA intent (0.0%).',
    );
    const cta = finding.segments.find(
      (segment) => 'value' in segment && segment.value.includes('CTA intent'),
    );
    expect(cta).toMatchObject({ tone: 'warning' });
    expect(finding.fact).toEqual({
      kicker: 'Because · product demand',
      value: '109 landing visitors · 30d',
      note: 'Waitlist telemetry unavailable · 0 waitlist CTA intent (0.0%)',
    });
  });

  it('reads zero landing traffic as no measurable conversion', () => {
    const finding = findingFor({ landingVisitors30d: 0, ctaUsers30d: 0 });

    expect(sentenceOf(finding)).toBe(
      '0 landing visitors in 30d; 0 showed waitlist CTA intent.',
    );
    const cta = finding.segments.find(
      (segment) => 'value' in segment && segment.value.includes('CTA intent'),
    );
    expect(cta).toMatchObject({ tone: 'neutral' });
    expect(finding.fact?.value).toBe('0 landing visitors · 30d');
    expect(finding.fact?.note).toBe(
      'Waitlist telemetry unavailable · 0 waitlist CTA intent',
    );
  });

  it('shows Discord intent without a post-waitlist split when unattributed', () => {
    const finding = findingFor({
      landingVisitors30d: 200,
      ctaUsers30d: 100,
      discordCtaUsers30d: 5,
    });

    expect(sentenceOf(finding)).toBe(
      '200 landing visitors in 30d; 100 showed waitlist CTA intent (50%); 5 showed Discord CTA intent.',
    );
    expect(finding.fact?.note).toBe(
      'Waitlist telemetry unavailable · 100 waitlist CTA intent (50%)',
    );
  });

  it('attributes app visitors alone without wallet proof', () => {
    const finding = findingFor({
      landingVisitors30d: 109,
      ctaUsers30d: 1,
      appVisitors30d: 6,
    });

    expect(sentenceOf(finding)).toBe(
      '109 landing visitors in 30d; 1 showed waitlist CTA intent (0.9%). 6 app visitors overall, not attributed to the waitlist.',
    );
  });

  it('reports wallet connects without app attribution', () => {
    const finding = findingFor({
      landingVisitors30d: 109,
      ctaUsers30d: 1,
      walletConnectedUsers30d: 5,
    });

    expect(sentenceOf(finding)).toBe(
      '109 landing visitors in 30d; 1 showed waitlist CTA intent (0.9%). 5 wallet connects were observed overall, not attributed to the waitlist.',
    );
  });
});
