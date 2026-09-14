import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getDistributionSnapshot } from '@/data/distribution';
import { DistributionExample } from '../DistributionExample';
import { DistributionHero } from '../DistributionHero';
import { DistributionLanguages } from '../DistributionLanguages';

const base = getDistributionSnapshot();

describe('distribution edge branches', () => {
  it('renders no example for missing data', () => {
    expect(
      render(<DistributionExample example={null} />).container,
    ).toBeEmptyDOMElement();
  });

  it('handles source and publication fallbacks', () => {
    render(
      <DistributionExample
        example={{
          ...base.example!,
          title: null,
          channels: [
            { platform: 'x', language: 'en', publishedAt: null, postUrl: null },
            {
              platform: 'youtube',
              language: 'ja',
              publishedAt: 'bad',
              postUrl: null,
            },
            {
              platform: 'linkedin',
              language: 'zh',
              publishedAt: '2026-01-01T00:00:00.000Z',
              postUrl: 'https://example.test/post',
            },
            {
              platform: 'facebook',
              language: 'en',
              publishedAt: '2026-01-01T00:10:00.000Z',
              postUrl: null,
            },
          ],
        }}
      />,
    );
    expect(
      screen.getByRole('link', { name: base.example!.sourceUrl }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('unpublished')).toHaveLength(2);
    expect(screen.getByText(/published over 1h/)).toBeInTheDocument();
    expect(screen.getAllByText('no permalink returned')).toHaveLength(3);
  });

  it('renders numeric channel counts, no coverage window, and an unreached language', () => {
    const snapshot = {
      ...base,
      coverage: {
        firstEpisodeAt: null,
        lastEpisodeAt: null,
        firstPostAt: null,
        lastPostAt: null,
      },
      channels: Array.from({ length: 13 }, (_, index) => ({
        platform: `platform-${index}`,
        language: 'en',
        posts: 0,
        postsWithMetrics: 0,
        reach: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        firstPostAt: null,
        lastPostAt: null,
      })),
      languages: [
        ...base.languages,
        {
          code: 'xx',
          localizations: 0,
          mainAudio: 0,
          classroomAudio: 0,
          posts: 0,
          reach: 0,
        },
      ],
    };
    render(
      <>
        <DistributionHero snapshot={snapshot} />
        <DistributionLanguages snapshot={snapshot} />
      </>,
    );
    expect(
      screen.getByRole('heading', { name: /13 channels out/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('none yet')).toHaveLength(3);
  });
});
