import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  formatCount,
  getDistributionSnapshot,
  platformLabel,
} from '@/data/distribution';
import DistributionPage from '../page';

const snapshot = getDistributionSnapshot();

describe('DistributionPage', () => {
  it('wraps content in zp-root so the landing-v2 tokens apply', () => {
    const { container } = render(<DistributionPage />);
    const root = container.firstChild as HTMLElement;

    expect(root).toHaveClass('zp-root');
    expect(root).toHaveClass('dist-root');
  });

  it('leads with the funnel from the committed snapshot', () => {
    const { container } = render(<DistributionPage />);
    const text = container.textContent ?? '';

    // The headline's channel count is derived, so assert it against the data
    // rather than against the copy it happens to render today.
    const channelWords = [
      'Zero',
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
      'Six',
      'Seven',
      'Eight',
      'Nine',
      'Ten',
    ];
    expect(text).toContain(
      `One article in. ${channelWords[snapshot.channels.length]} channels out.`,
    );
    expect(text).toContain(formatCount(snapshot.funnel.articles));
    expect(text).toContain(formatCount(snapshot.funnel.localizations));
    expect(text).toContain(formatCount(snapshot.funnel.reach));
  });

  it('renders one chain step per pipeline stage', () => {
    const { container } = render(<DistributionPage />);
    const steps = container.querySelectorAll('.dist-chain-step');

    expect(steps).toHaveLength(6);
    expect(container.textContent ?? '').toMatch(
      /Normally a social media manager/,
    );
  });

  it('renders one channel row per channel plus a total row', () => {
    const { container } = render(<DistributionPage />);
    const rows = container.querySelectorAll('.dist-table tbody tr');
    const footer = container.querySelectorAll('.dist-table tfoot tr');

    expect(rows).toHaveLength(snapshot.channels.length);
    expect(footer).toHaveLength(1);
    expect(footer[0]?.textContent ?? '').toContain(
      formatCount(snapshot.funnel.reach),
    );
  });

  it('renders one card per language', () => {
    const { container } = render(<DistributionPage />);

    expect(container.querySelectorAll('.dist-language')).toHaveLength(
      snapshot.languages.length,
    );
  });

  it('links the worked example to its source and its live posts', () => {
    const { container } = render(<DistributionPage />);
    const example = snapshot.example;
    expect(example).not.toBeNull();
    if (!example) return;

    const source = container.querySelector('.dist-example-source a');
    expect(source).toHaveAttribute('href', example.sourceUrl);

    const rows = container.querySelectorAll('.dist-example-row');
    expect(rows).toHaveLength(example.channels.length);

    const withPermalink = example.channels.filter(
      (channel) => channel.postUrl !== null,
    );
    expect(container.querySelectorAll('.dist-example-link')).toHaveLength(
      withPermalink.length,
    );
    for (const channel of withPermalink) {
      expect(container.textContent ?? '').toContain(
        platformLabel(channel.platform),
      );
    }
  });

  it('opens every outbound link safely', () => {
    const { container } = render(<DistributionPage />);
    const outbound = container.querySelectorAll('a[target="_blank"]');

    expect(outbound.length).toBeGreaterThan(0);
    for (const link of outbound) {
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  it('states how the numbers are produced', () => {
    const { container } = render(<DistributionPage />);

    expect(container.textContent ?? '').toMatch(/distribution-snapshot\.json/);
  });
});
