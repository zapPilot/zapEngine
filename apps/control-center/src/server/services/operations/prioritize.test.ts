import { describe, expect, it } from 'vitest';

import type {
  OperationalSignal,
  OperationalStatus,
  OperationsDomain,
} from '../../../shared/types.js';
import { prioritize } from './prioritize.js';

const NOW = '2026-08-28T12:00:00.000Z';

function signal(
  fingerprint: string,
  status: OperationalStatus,
  domain: OperationsDomain,
  evidence: OperationalSignal['evidence'] = {},
): OperationalSignal {
  return {
    fingerprint,
    source: 'fly',
    domain,
    status,
    title: fingerprint,
    detail: null,
    evidence,
    observedAt: NOW,
    url: null,
  };
}

describe('prioritize', () => {
  it('keeps healthy and unknown signals off the list', () => {
    // The threshold is set so 15 (unknown) + 9 (the heaviest domain) can never
    // reach it: an unconfigured integration is a setup task, not an incident.
    const priorities = prioritize([
      signal('a', 'healthy', 'customers'),
      signal('b', 'unknown', 'customers'),
      signal('c', 'unknown', 'social'),
    ]);

    expect(priorities).toEqual([]);
  });

  it('ranks critical above degraded and weights the domain', () => {
    const priorities = prioritize([
      signal('costs', 'degraded', 'costs'),
      signal('infra', 'critical', 'infra'),
      signal('customers', 'degraded', 'customers'),
    ]);

    expect(priorities.map((entry) => entry.signal.fingerprint)).toEqual([
      'infra',
      'customers',
      'costs',
    ]);
    expect(priorities[0]?.score).toBe(78);
    expect(priorities[1]?.score).toBe(49);
    expect(priorities[2]?.score).toBe(44);
  });

  it('boosts on evidence and explains every point it added', () => {
    const [priority] = prioritize([
      signal('queue', 'degraded', 'social', {
        overdueMinutes: 95,
        attemptsExhausted: true,
      }),
    ]);

    // 40 base + 8 social + min(15, floor(95/30)*5 = 15) + 10 exhausted
    expect(priority?.score).toBe(73);
    expect(priority?.reasons).toEqual([
      'degraded social signal',
      'overdue by 95 min',
      'retries exhausted — will never run',
    ]);
  });

  it('caps each boost so one large number cannot dominate', () => {
    const [priority] = prioritize([
      signal('errors', 'degraded', 'errors', {
        issueCount: 400,
        failureStreak: 40,
        affectedUsers: 900,
      }),
    ]);

    // 40 + 6 + 10 + 10 + 10, each boost individually capped.
    expect(priority?.score).toBe(76);
  });

  it('never exceeds 100', () => {
    const [priority] = prioritize([
      signal('worst', 'critical', 'customers', {
        overdueMinutes: 6_000,
        failureStreak: 9,
        issueCount: 90,
        attemptsExhausted: true,
        affectedUsers: 90,
        aumAtRiskUsd: 5_000_000,
      }),
    ]);

    expect(priority?.score).toBe(100);
  });

  it('ignores the AUM boost below the floor and non-numeric evidence', () => {
    const [small] = prioritize([
      signal('small', 'degraded', 'customers', { aumAtRiskUsd: 9_000 }),
    ]);
    const [broken] = prioritize([
      signal('broken', 'degraded', 'customers', {
        affectedUsers: 'many',
        overdueMinutes: null,
      }),
    ]);

    expect(small?.score).toBe(49);
    expect(broken?.score).toBe(49);
  });

  it('does not let reach-style evidence lift a healthy signal', () => {
    // affectedUsers on a healthy row describes coverage, not damage.
    expect(
      prioritize([
        signal('fine', 'healthy', 'customers', {
          affectedUsers: 50,
          aumAtRiskUsd: 5_000_000,
        }),
      ]),
    ).toEqual([]);
  });

  it('breaks score ties on fingerprint so the order is reproducible', () => {
    const priorities = prioritize([
      signal('zeta', 'degraded', 'infra'),
      signal('alpha', 'degraded', 'infra'),
    ]);

    expect(priorities.map((entry) => entry.signal.fingerprint)).toEqual([
      'alpha',
      'zeta',
    ]);
  });

  it('caps the list at twelve so the page stays a decision, not a feed', () => {
    const priorities = prioritize(
      Array.from({ length: 20 }, (_, index) =>
        signal(`critical-${index}`, 'critical', 'infra'),
      ),
    );

    expect(priorities).toHaveLength(12);
  });
});
