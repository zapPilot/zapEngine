// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { SocialGrowthResponse } from '../../shared/types.js';
import { audienceFixture } from '../__fixtures__/dashboard.js';
import { unavailableWaitlist } from '../../shared/waitlist-growth.js';
import { AudienceGrowthCard } from './AudienceGrowthCard.js';

afterEach(cleanup);
function fixture(): SocialGrowthResponse {
  return {
    status: 'ok',
    message: null,
    generatedAt: '2026-10-04T07:30:00Z',
    platforms: [],
    experiments: [],
    attribution: [],
    audience: audienceFixture(),
    waitlist: unavailableWaitlist('test'),
  };
}
describe('audience growth', () => {
  it('renders fixed order, deltas, JST capture time and a common scale', () => {
    const { container } = render(<AudienceGrowthCard growth={fixture()} />);
    const charts = screen.getAllByRole('img');
    expect(
      charts.map((chart) => chart.getAttribute('aria-label')?.split(' ')[0]),
    ).toEqual(['x', 'threads', 'rednote', 'youtube']);
    expect(screen.getByText('目前 132 · 截至 10/04 16:01')).toBeInTheDocument();
    expect(screen.getByText('+46')).toBeInTheDocument();
    expect(screen.getByText('尚無訂閱數快照')).toBeInTheDocument();
    expect(
      screen.getByText('無外連 CTA；以受眾成長判讀分發'),
    ).toBeInTheDocument();
    const spans = charts.slice(1, 3).map((chart) => {
      const points = [...chart.querySelectorAll('circle')].map((circle) =>
        Number(circle.getAttribute('cy')),
      );
      return Math.max(...points) - Math.min(...points);
    });
    expect(spans[0]!).toBeLessThan(spans[1]! / 40);
    expect(container.querySelector('title')).toHaveTextContent('2026-09-05');
  });
  it('breaks lines at missing days and reports history starting at first known day', () => {
    const growth = fixture();
    const row = growth.audience.series[0]!;
    row.delta30d = null;
    row.followersByDay = [null, 80, 82, null, 79, ...Array(25).fill(null)];
    render(<AudienceGrowthCard growth={growth} />);
    const chart = screen.getAllByRole('img')[0]!;
    expect(chart.querySelectorAll('polyline')).toHaveLength(2);
    expect(chart.querySelectorAll('circle')).toHaveLength(3);
    expect(screen.getByText(/自 09\/06 起/)).toBeInTheDocument();
  });
  it('handles all-zero series and rounded YouTube counts without division by zero', () => {
    const growth = fixture();
    growth.audience.series = growth.audience.series.map((row) => ({
      ...row,
      followersNow: 1000,
      capturedAt: growth.generatedAt,
      delta30d: 0,
      delta7d: 0,
      followersByDay: Array(30).fill(1000),
    }));
    render(<AudienceGrowthCard growth={growth} />);
    expect(screen.getByText('API 會捨入到 3 位有效數字')).toBeInTheDocument();
    expect(
      screen.getAllByRole('img')[0]!.querySelector('circle'),
    ).toHaveAttribute('cy', '45');
  });
  it('renders missing non-YouTube history and service errors', () => {
    const growth = fixture();
    growth.audience.series[0] = {
      ...growth.audience.series[3]!,
      platform: 'x',
    };
    const view = render(<AudienceGrowthCard growth={growth} />);
    expect(screen.getByText('尚無追蹤者快照')).toBeInTheDocument();
    view.rerender(
      <AudienceGrowthCard
        growth={{ ...growth, status: 'error', message: 'denied' }}
      />,
    );
    expect(screen.getByText('denied')).toBeInTheDocument();
    view.rerender(<AudienceGrowthCard growth={null} />);
    expect(screen.getByText('受眾資料尚未載入。')).toBeInTheDocument();
  });
});
