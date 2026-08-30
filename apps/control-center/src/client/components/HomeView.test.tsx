// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  operationsFixture,
  overviewFixture,
  priorityFixture,
  productFixture,
  signalFixture,
} from '../__fixtures__/dashboard.js';
import { HomeView } from './HomeView.js';

afterEach(cleanup);

function renderHome(props: Partial<Parameters<typeof HomeView>[0]> = {}) {
  const onNavigate = vi.fn();
  render(
    <HomeView
      data={overviewFixture()}
      onNavigate={onNavigate}
      operations={operationsFixture()}
      {...props}
    />,
  );
  return { onNavigate };
}

function priorities(count: number) {
  return Array.from({ length: count }, (_unused, index) =>
    priorityFixture({
      score: 90 - index,
      signal: signalFixture({
        fingerprint: `signal-${index}`,
        title: `Signal ${index}`,
      }),
    }),
  );
}

function banner(): HTMLElement {
  return screen.getByRole('region', { name: 'Overall operational status' });
}

function contextDisclosure(): HTMLDetailsElement {
  return screen.getByText('More context').closest('details') as HTMLDetailsElement;
}

describe('HomeView', () => {
  it('opens on the action queue rather than on evidence', () => {
    renderHome({
      operations: operationsFixture({ priorities: priorities(3) }),
    });
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings[0]).toBe('Do this first');
    expect(headings).not.toContain('Provider ledger');
  });

  it('previews only three decisions and sends the rest to Reliability', () => {
    const { onNavigate } = renderHome({
      operations: operationsFixture({ priorities: priorities(8) }),
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: /5 more in/ }));
    expect(onNavigate).toHaveBeenCalledWith('reliability');
  });

  it('offers no overflow link when everything already fits', () => {
    renderHome({
      operations: operationsFixture({ priorities: priorities(2) }),
    });
    expect(screen.queryByRole('button', { name: /more in/ })).toBeNull();
  });

  it('says all clear instead of showing an empty box', () => {
    renderHome({
      operations: operationsFixture({ priorities: [], status: 'healthy' }),
    });
    expect(
      screen.getByText('All clear. Nothing is above the action threshold.'),
    ).toBeVisible();
    expect(screen.getByText('Healthy')).toBeVisible();
    expect(screen.getByText(/Nothing is asking for a decision/)).toBeVisible();
  });

  it('keeps the home status sentence compact', () => {
    renderHome({
      operations: operationsFixture({ priorities: priorities(3) }),
    });
    expect(within(banner()).getByText('Critical')).toBeVisible();
    expect(within(banner()).getByText('3 need a decision')).toBeVisible();
    expect(within(banner()).queryByText(/signals across/)).toBeNull();
  });

  it('shows only three business headlines before expansion', () => {
    renderHome();
    const headlines = screen.getByRole('region', { name: 'Business headlines' });
    expect(within(headlines).getByText('Product')).toBeVisible();
    expect(within(headlines).getByText('Growth')).toBeVisible();
    expect(within(headlines).getByText('Spend')).toBeVisible();
    expect(within(headlines).queryByText('Reliability')).toBeNull();
    expect(within(headlines).getByText('$179,612')).toBeVisible();
    expect(within(headlines).getByText('$41')).toBeVisible();
  });

  it('keeps qualifiers behind one disclosure until requested', () => {
    renderHome();
    const disclosure = contextDisclosure();
    expect(disclosure.open).toBe(false);
    expect(screen.getByText('Month to date')).not.toBeVisible();

    fireEvent.click(screen.getByText('More context'));
    expect(disclosure.open).toBe(true);
    expect(screen.getByText('Month to date')).toBeVisible();
    expect(screen.getByText('$26.96')).toBeVisible();
  });

  // A twenty-five digit AUM is a broken feed telling on itself. It shrinks so
  // it still fits its cell, but it is never cut short.
  it('shrinks a pathological figure instead of clipping it', () => {
    renderHome({
      data: overviewFixture({
        product: productFixture({ observedPortfolioUsd: -2.6963562e22 }),
      }),
    });
    const value = screen.getByText('-$26,963,562,000,000,000,000,000');
    expect(value.className).toContain('long');
  });

  it('renders every headline as a dash while the first load is in flight', () => {
    renderHome({ data: null, operations: null });
    expect(screen.getByText('Unknown')).toBeVisible();
    expect(screen.getByText('Waiting for data')).toBeVisible();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('hands expanded context off to the view that owns the detail', () => {
    const { onNavigate } = renderHome();
    fireEvent.click(screen.getByText('More context'));
    fireEvent.click(screen.getByRole('button', { name: /Full Growth/ }));
    fireEvent.click(screen.getByRole('button', { name: /Full Product/ }));
    fireEvent.click(screen.getByRole('button', { name: /Full Economics/ }));
    expect(onNavigate).toHaveBeenNthCalledWith(1, 'growth');
    expect(onNavigate).toHaveBeenNthCalledWith(2, 'product');
    expect(onNavigate).toHaveBeenNthCalledWith(3, 'economics');
  });
});
