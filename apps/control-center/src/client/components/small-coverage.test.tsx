// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { InfoRow } from './InfoRow.js';
import { StatementFacts, StatementHeader } from './StatementHeader.js';
import { SkeletonBlock, SkeletonRows } from './ui/Skeleton.js';
import { platformColorVar, sourceColorVar } from './ui/tone.js';

afterEach(cleanup);

describe('InfoRow notes filtering', () => {
  it('renders without notes when none are supplied', () => {
    render(<InfoRow label="Activation" value="10 registered" />);

    expect(screen.getByText('Activation')).toBeVisible();
    expect(screen.getByText('10 registered')).toBeVisible();
    expect(document.querySelector('.info-note')).toBeNull();
  });

  it('drops null, undefined and empty notes', () => {
    render(
      <InfoRow
        label="Activation"
        notes={[null, undefined, '', '5 observed']}
        value="10 registered"
      />,
    );

    expect(screen.getByText('5 observed')).toBeVisible();
    expect(document.querySelectorAll('.info-note')).toHaveLength(1);
  });
});

describe('StatementHeader empty facts', () => {
  it('renders nothing for an empty fact list', () => {
    const { container } = render(<StatementFacts facts={[]} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders facts and an action beside the sentence', () => {
    render(
      <StatementHeader
        action={<button type="button">Open</button>}
        facts={[{ kicker: 'Spend', note: 'to date', value: '$1' }]}
        sentence={[{ text: 'Spend is fine' }]}
        status="healthy"
      />,
    );

    expect(screen.getByText('Spend')).toBeVisible();
    expect(screen.getByText('$1')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open' })).toBeVisible();
  });
});

describe('Skeleton rows default', () => {
  it('renders three rows by default and honours an explicit count', () => {
    const { container: implicit, unmount } = render(<SkeletonRows />);
    expect(implicit.querySelectorAll('.cc-skeleton-block')).toHaveLength(3);
    unmount();
    cleanup();

    const { container: explicit } = render(<SkeletonRows rows={1} />);
    expect(explicit.querySelectorAll('.cc-skeleton-block')).toHaveLength(1);
  });

  it('renders a block with and without an extra class', () => {
    const { container, unmount } = render(<SkeletonBlock />);
    expect(container.querySelector('.cc-skeleton-block')).not.toBeNull();
    unmount();
    cleanup();

    const { container: withClass } = render(
      <SkeletonBlock className="cc-skeleton-short" />,
    );
    expect(
      withClass.querySelector('.cc-skeleton-block.cc-skeleton-short'),
    ).not.toBeNull();
  });
});

describe('tone color vars', () => {
  it('maps a known platform to its lane color', () => {
    expect(platformColorVar('x')).toBe('var(--cc-src-x)');
    expect(platformColorVar('threads')).toBe('var(--cc-src-threads)');
  });

  it('falls back to faint ink for an unknown platform', () => {
    expect(platformColorVar('mastodon')).toBe('var(--ink-faint)');
  });

  it('maps a supabase-backed source to its shared color', () => {
    expect(sourceColorVar('cost-ledger')).toBe('var(--cc-src-supabase)');
    expect(sourceColorVar('sentry')).toBe('var(--cc-src-sentry)');
  });
});
