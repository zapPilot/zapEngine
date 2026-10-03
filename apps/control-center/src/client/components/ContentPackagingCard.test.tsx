// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import {
  unavailableContentPackaging,
  type PackagingEpisode,
} from '../../shared/content-packaging.js';
import { ContentPackagingCard } from './ContentPackagingCard.js';
afterEach(cleanup);
it('renders loading, unavailable and insufficient evidence independently', () => {
  const { rerender } = render(<ContentPackagingCard packaging={null} />);
  expect(screen.getByText('Loading')).toBeVisible();
  const packaging = unavailableContentPackaging('DB offline');
  rerender(<ContentPackagingCard packaging={packaging} />);
  expect(screen.getByText('DB offline')).toBeVisible();
  rerender(
    <ContentPackagingCard packaging={{ ...packaging, message: null }} />,
  );
  expect(screen.getByText('包裝資料無法取得')).toBeVisible();
  packaging.status = 'insufficient';
  rerender(<ContentPackagingCard packaging={packaging} />);
  expect(screen.getByText('包裝樣本不足')).toBeVisible();
  expect(screen.getByText(/不得據此推論選題/)).toBeVisible();
});
it('shows shipped thumbnails, lane lifts and observed title associations without topic recommendations', () => {
  const packaging = unavailableContentPackaging('');
  packaging.status = 'available';
  Object.assign(packaging.primaryLane, {
    distributed: 12,
    medianViews: 150,
    maxViews: 200,
    engagementRate: 0.01,
    undistributedRatio: 0.28,
  });
  const episode: PackagingEpisode = {
    episodeId: 'e1',
    shownTitle: '3個問題',
    canonicalTitle: '完整標題',
    views: 156,
    reachLift: 1.3,
    publishedAt: '',
    engagementRate: 0.01,
    confirmations: [{ platform: 'youtube', languageCode: 'en', reachLift: 1 }],
    cover: {
      evidence: 'shipped',
      thumbnailUrl: 'https://example.com/cover.png',
      sha256: 'hash',
      status: 'ready',
      sourceImageUrl: null,
      fallbackReason: null,
    },
  };
  packaging.top = [episode];
  packaging.bottom = [
    {
      ...episode,
      episodeId: 'e2',
      shownTitle: null,
      canonicalTitle: null,
      cover: { evidence: 'unverified' },
    },
    {
      ...episode,
      episodeId: 'e3',
      canonicalTitle: '3個問題',
      cover: {
        ...(episode.cover as Extract<
          PackagingEpisode['cover'],
          { evidence: 'shipped' }
        >),
        thumbnailUrl: null,
      },
    },
  ];
  packaging.features = [
    {
      key: 'title_has_number',
      threshold: null,
      lift: 1.2,
      with: { n: 12, medianReachLift: 1.2, engagementRate: 0.008 },
      without: { n: 30, medianReachLift: 1, engagementRate: 0.006 },
    },
    {
      key: 'title_longer_than_median',
      threshold: 10,
      lift: 1,
      with: { n: 5, medianReachLift: 1, engagementRate: null },
      without: { n: 5, medianReachLift: 1, engagementRate: null },
    },
  ];
  const { rerender } = render(<ContentPackagingCard packaging={packaging} />);
  expect(screen.getAllByRole('img')).toHaveLength(1);
  expect(screen.getByText('Canonical：完整標題')).toBeVisible();
  expect(screen.getAllByText('1.3× 中位數 · 156 views')).toHaveLength(3);
  expect(screen.getByText(/標題含數字/)).toBeVisible();
  packaging.features = [];
  rerender(<ContentPackagingCard packaging={packaging} />);
  expect(screen.getByText('特徵樣本不足')).toBeVisible();
});
