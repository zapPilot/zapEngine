// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type {
  OperationalSignal,
  OperationsResponse,
} from '../../shared/types.js';
import { ReliabilityPage } from './ReliabilityPage.js';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function show(data: OperationsResponse | null) {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unavailable')));
  return render(
    <ReliabilityPage
      data={data}
      costHistory={null}
      overview={null}
      podcastCosts={null}
    />,
  );
}
it('security empty state', () => {
  show(null);
  expect(screen.getByText('安全態勢')).toBeInTheDocument();
  expect(screen.getByText('No security signal')).toBeInTheDocument();
});
it('unknown reason and critical link with follow-up', () => {
  const signal: OperationalSignal = {
    fingerprint: 'github-security:dependabot/repository',
    source: 'github-security',
    domain: 'security',
    status: 'critical',
    title: 'Dependency vulnerabilities',
    detail: 'Critical dependency',
    evidence: {},
    observedAt: '2026-10-04T00:00:00Z',
    url: 'https://github.com/zapPilot/zapEngine/security/dependabot',
  };
  show({
    generatedAt: signal.observedAt,
    status: 'critical',
    domains: [],
    signals: [
      signal,
      {
        ...signal,
        fingerprint: 'github-security:code-scanning/repository',
        status: 'unknown',
        title: 'CodeQL unavailable',
        detail: 'Requires Code scanning alerts: Read',
        url: null,
      },
    ],
    priorities: [
      {
        signal,
        score: 76,
        reasons: [],
        followUp: {
          status: 'available',
          targetCoverage: 'complete',
          unassessedTargets: ['pnpm-lock.yaml'],
          items: [],
        },
      },
    ],
  });
  expect(
    screen.getByText('Requires Code scanning alerts: Read'),
  ).toBeInTheDocument();
  expect(screen.getByText('CodeQL unavailable')).toBeInTheDocument();
  expect(
    screen
      .getAllByRole('link')
      .some((link) => link.getAttribute('href') === signal.url),
  ).toBe(true);
  expect(screen.getAllByText(/尚待診斷/).length).toBeGreaterThan(0);
});
