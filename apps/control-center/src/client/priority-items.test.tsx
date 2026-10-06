// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { priorityItems } from './priority-items.js';
import { RankedList } from './components/ui/RankedList.js';
import type { OperationalPriority } from '../shared/types.js';

const priority: OperationalPriority = {
  signal: {
    fingerprint: 'sentry:stale-unresolved/desktop',
    source: 'sentry',
    domain: 'errors',
    status: 'degraded',
    title: 'Playback risk',
    detail: 'Historical unresolved issue',
    evidence: {},
    observedAt: '2026-10-03T00:00:00Z',
    url: null,
  },
  score: 46,
  reasons: [],
  followUp: {
    status: 'available',
    targetCoverage: 'complete',
    unassessedTargets: [],
    items: [
      {
        fingerprint: 'sentry:stale-unresolved/desktop',
        actor: 'sweep',
        recordedAt: '2026-10-03T00:00:00Z',
        reviewRequired: true,
        assessment: {
          target: '42',
          classification: 'engineering',
          stage: 'awaiting_deploy',
          reason: 'Playback cancellation repaired',
          nextAction: 'Verify deployed playback behavior',
          evidence: ['PR tests'],
          prNumber: 688,
          fixSha: 'a'.repeat(40),
          lastSeen: null,
          reviewAfter: '2026-10-04T00:00:00Z',
        },
      },
    ],
  },
};
afterEach(cleanup);
describe('priority progress presentation', () => {
  it('names missing assessments and an incomplete inventory', () => {
    render(
      <RankedList
        empty={null}
        items={priorityItems(
          [
            {
              ...priority,
              followUp: {
                status: 'available',
                targetCoverage: 'partial',
                unassessedTargets: ['43'],
                items: [],
              },
            },
          ],
          { detail: true },
        )}
      />,
    );
    expect(screen.getByText('1 個項目尚待診斷。')).toBeDefined();
    expect(screen.getByText(/事件清單不完整/)).toBeDefined();
  });
  it('shows an owner action without inventing a PR or recurrence', () => {
    const item = priority.followUp!.items[0]!;
    render(
      <RankedList
        empty={null}
        items={priorityItems(
          [
            {
              ...priority,
              followUp: {
                status: 'available',
                targetCoverage: 'complete',
                unassessedTargets: [],
                items: [
                  {
                    ...item,
                    reviewRequired: false,
                    assessment: {
                      ...item.assessment,
                      classification: 'owner',
                      stage: 'blocked',
                      prNumber: null,
                      fixSha: null,
                    },
                  },
                ],
              },
            },
          ],
          { detail: true },
        )}
      />,
    );
    expect(screen.getByText(/需負責人決策 · 處理受阻/)).toBeDefined();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(/需要重新檢查/)).toBeNull();
  });
  it('keeps a repaired risk visible with its PR, next action and reinspection notice', () => {
    render(
      <RankedList
        empty={null}
        items={priorityItems([priority], { detail: true })}
      />,
    );
    expect(screen.getByText('Playback risk')).toBeDefined();
    expect(screen.getByText(/需要重新檢查/)).toBeDefined();
    expect(screen.getByText(/Verify deployed playback behavior/)).toBeDefined();
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      'https://github.com/zapPilot/zapEngine/pull/688',
    );
  });
  it('shows unavailable tracking without removing the risk', () => {
    render(
      <RankedList
        empty={null}
        items={priorityItems(
          [
            {
              ...priority,
              followUp: {
                status: 'unavailable',
                targetCoverage: 'partial',
                unassessedTargets: [],
                items: [],
              },
            },
          ],
          { detail: true },
        )}
      />,
    );
    expect(screen.getByText('Playback risk')).toBeDefined();
    expect(screen.getByText(/處理進度未知/)).toBeDefined();
  });
});
