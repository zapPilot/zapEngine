// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SocialGrowthJourney } from '../../shared/growth-journey.js';
import type {
  SocialGrowthResponse,
  SocialPerformanceResponse,
} from '../../shared/types.js';
import { GrowthPage } from './GrowthPage.js';

afterEach(cleanup);

const journey: SocialGrowthJourney = {
  appVisitors30d: 6,
  ctaUsers30d: 1,
  discordCtaUsers30d: 0,
  discordCtaPostWaitlistUsers30d: 0,
  landingDirect30d: 4,
  landingOther30d: 2,
  landingRednote30d: 0,
  landingThreads30d: 161,
  landingVisitors30d: 179,
  landingX30d: 4,
  landingYoutube30d: 8,
  message: null,
  status: 'ok',
  walletConnectedUsers30d: 1,
};

const social = {
  accounts: [],
  episodes: [
    {
      episodeId: 'ep-1',
      publishedAt: '2026-08-28T12:00:00Z',
      windowReached: true,
      platforms: [
        {
          averageViewDurationSec: null,
          averageViewPercentage: null,
          comments: null,
          engagementRate: 0,
          followersGained: null,
          likes: null,
          platform: 'youtube',
          postUrl: null,
          measurementWindow: '24h',
          ageHours: 24,
          saves: null,
          shares: null,
          views: 0,
        },
      ],
      title: '一集沒有人看的內容',
    },
  ],
  generatedAt: '2026-09-10T01:00:00Z',
  message: null,
  status: 'ok',
  window: 'latest',
} as unknown as SocialPerformanceResponse;

const emptyWaitlist = {
  attributedSocial7d: 0,
  conversions: [],
  directOrUnknown7d: 0,
  message: null,
  signups30d: 0,
  signups7d: 0,
  status: 'ok',
  total: 0,
} as const;

const growth = {
  audience: { days: [], series: [] },
  attribution: [],
  experiments: [],
  generatedAt: '2026-09-10T01:00:00Z',
  message: null,
  platforms: [],
  status: 'ok',
  waitlist: emptyWaitlist,
} as unknown as SocialGrowthResponse;

function renderGrowth(
  overrides: Partial<Parameters<typeof GrowthPage>[0]> = {},
) {
  return render(
    <GrowthPage
      acquisition={null}
      data={social}
      growth={growth}
      journey={journey}
      onWindowChange={vi.fn(async () => undefined)}
      {...overrides}
    />,
  );
}

describe('Growth waitlist reporting', () => {
  it('does not draw a share ring when nothing has been attributed', () => {
    const { container } = renderGrowth();
    expect(container.querySelector('.cc-donut')).toBeNull();
    expect(screen.getByText('尚無來源分佈')).toBeVisible();
  });

  it('draws the ring once a source carries signups', () => {
    const { container } = renderGrowth({
      growth: {
        ...growth,
        waitlist: {
          ...emptyWaitlist,
          conversions: [
            {
              episodeId: 'ep-1',
              languageCode: 'en',
              platform: 'threads',
              signupRate: null,
              signups: 3,
              socialPostId: null,
              socialPublishJobId: 'job-1',
              views24h: null,
            },
          ],
          signups30d: 3,
          signups7d: 3,
          total: 3,
        },
      } as SocialGrowthResponse,
    });
    const donut = container.querySelector('.cc-donut');
    expect(donut).not.toBeNull();
    // Threads also names the learned-guidance row, so scope to the legend.
    expect(donut?.querySelector('.cc-donut-legend')?.textContent).toContain(
      'Threads',
    );
  });

  it('reports an unavailable waitlist rather than zero signups', () => {
    renderGrowth({
      growth: {
        ...growth,
        waitlist: {
          attributedSocial7d: null,
          conversions: [],
          directOrUnknown7d: null,
          message: 'Waitlist table is not reachable',
          signups30d: null,
          signups7d: null,
          status: 'unavailable',
          total: null,
        },
      } as SocialGrowthResponse,
    });
    expect(screen.getByText('Waitlist 無法取得')).toBeVisible();
  });
});

describe('Growth drop-off reading', () => {
  it('names the journey steps that lose the most people', () => {
    renderGrowth();
    expect(screen.getByText('到站訪客沒有點擊 Waitlist CTA')).toBeVisible();
    expect(screen.getByText(/179 人之中有 178 人/)).toBeVisible();
  });

  it('surfaces published posts that were never seen', () => {
    renderGrowth();
    expect(
      screen.getByText('1 篇貼文的 ≥24h 最新快照 觀看數是 0'),
    ).toBeVisible();
  });

  it('says nothing when analytics is unavailable', () => {
    renderGrowth({
      data: { ...social, episodes: [] } as SocialPerformanceResponse,
      journey: {
        appVisitors30d: null,
        ctaUsers30d: null,
        discordCtaUsers30d: null,
        discordCtaPostWaitlistUsers30d: null,
        landingDirect30d: null,
        landingOther30d: null,
        landingRednote30d: null,
        landingThreads30d: null,
        landingVisitors30d: null,
        landingX30d: null,
        landingYoutube30d: null,
        message: 'PostHog is not configured',
        status: 'unavailable',
        walletConnectedUsers30d: null,
      },
    });
    expect(screen.getByText('尚無可指認的流失')).toBeVisible();
  });
});

describe('Growth guidance', () => {
  it('shows universal packaging without platform recommendations', () => {
    renderGrowth();
    expect(screen.getByText('內容包裝洞察')).toBeVisible();
    expect(
      screen.queryByText(/內容題材參考|最佳題材|發佈時段|開場/),
    ).toBeNull();
    expect(screen.queryByText('高影響')).toBeNull();
  });
});

describe('Growth decision clarity', () => {
  it('separates traffic leadership from signups and independent wallet totals', () => {
    renderGrowth();
    expect(screen.getByText(/Threads 帶來 161 位到站訪客/)).toBeVisible();
    expect(screen.getByText(/目前沒有註冊證據支持增加發文量/)).toBeVisible();
    expect(screen.queryByText('App 訪客沒有連上錢包')).toBeNull();
    expect(
      screen.getByText('wallet_connected · independent count'),
    ).toBeVisible();
    expect(
      screen.getByText('查看逐集到站與 CTA 明細').closest('details'),
    ).not.toHaveAttribute('open');
  });

  it('explains missing post links instead of leaving a silent gap', () => {
    renderGrowth();
    expect(screen.getByText('貼文連結未取得')).toBeVisible();
    expect(screen.getByText('近期內容表現')).toBeVisible();
  });
});

it('compares the latest three eligible episodes and marks missing or late measurements', () => {
  const episodes = Array.from({ length: 6 }, (_, index) => ({
    ...social.episodes[0]!,
    episodeId: `episode-${index}`,
    title: `Release ${index}`,
    windowReached: index >= 2,
    platforms: [
      {
        ...social.episodes[0]!.platforms[0]!,
        views: index === 2 ? null : 0,
        measurementWindow: '24h' as const,
        ageHours: 31,
      },
    ],
  }));
  const view = renderGrowth({ data: { ...social, window: '24h', episodes } });
  expect(
    screen.getByText('較新的 2 集尚未滿 24h，暫不列入比較'),
  ).toBeInTheDocument();
  expect(screen.queryByText('Release 0')).toBeNull();
  expect(screen.queryByText('Release 5')).toBeNull();
  expect(screen.getByText('未取得')).toBeInTheDocument();
  expect(screen.getAllByText(/量於 31h/)).toHaveLength(3);
  view.rerender(
    <GrowthPage
      acquisition={null}
      journey={journey}
      growth={growth}
      data={{ ...social, window: 'latest', episodes: [episodes[2]!] }}
      onWindowChange={vi.fn()}
    />,
  );
  expect(screen.getByText('尚無快照')).toBeInTheDocument();
});
it('shows an empty comparison when all episodes are younger than the window', () => {
  renderGrowth({
    data: {
      ...social,
      window: '24h',
      episodes: [{ ...social.episodes[0]!, windowReached: false }],
    },
  });
  expect(
    screen.getByText('較新的 1 集尚未滿 24h，暫不列入比較'),
  ).toBeInTheDocument();
  expect(screen.getByText('No release yet')).toBeInTheDocument();
});
it('counts only mature windows for zero-view diagnostics and places audience before content', () => {
  const platforms = ['1h', '6h', '24h', '72h', '7d'].map((window) => ({
    ...social.episodes[0]!.platforms[0]!,
    platform: window,
    measurementWindow:
      window as import('../../shared/types.js').SocialMetricWindow,
    ageHours: 1,
  }));
  renderGrowth({
    data: { ...social, episodes: [{ ...social.episodes[0]!, platforms }] },
  });
  expect(
    screen.getByText('3 篇貼文的 ≥24h 最新快照 觀看數是 0'),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '最新快照' })).toHaveAttribute(
    'title',
    '每篇最新一筆，量測時間各不相同，不能直接比較',
  );
  const audience = screen.getByText('受眾成長 · 30 天');
  const content = screen.getByText('近期內容表現');
  expect(
    audience.compareDocumentPosition(content) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});
