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

describe('HomeView', () => {
  // The old Overview opened on six KPI tiles and a provider ledger, which is
  // why the ranked action list went unread on the next tab.
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

  it('previews six decisions and sends the rest to Reliability', () => {
    const { onNavigate } = renderHome({
      operations: operationsFixture({ priorities: priorities(8) }),
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(6);

    fireEvent.click(screen.getByRole('button', { name: /2 more in/ }));
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

  it('states the overall status before any number', () => {
    renderHome({
      operations: operationsFixture({ priorities: priorities(3) }),
    });
    expect(within(banner()).getByText('Critical')).toBeVisible();
    expect(within(banner()).getByText(/3 need a decision/)).toBeVisible();
  });

  // "$179,6…" is what the previous strip showed. Headline money now rounds to
  // whole dollars so the figure survives its column.
  it('prints headline money whole rather than clipped', () => {
    renderHome();
    expect(screen.getByText('$179,612')).toBeVisible();
    expect(screen.getByText('$41')).toBeVisible();
    expect(screen.getByText('Month to date $26.96')).toBeVisible();
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

  it('groups the KPI band by concern', () => {
    renderHome();
    expect(
      screen.getAllByText(/^(Product|Growth|Spend|Reliability)$/).length,
    ).toBeGreaterThanOrEqual(4);
    expect(screen.getByText('7/8')).toBeVisible();
  });

  it('renders every figure as a dash while the first load is in flight', () => {
    renderHome({ data: null, operations: null });
    expect(screen.getByText('Unknown')).toBeVisible();
    expect(screen.getByText('Waiting for data')).toBeVisible();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('hands the reader off to the view that owns the detail', () => {
    const { onNavigate } = renderHome();
    fireEvent.click(screen.getByRole('button', { name: /Growth/ }));
    fireEvent.click(screen.getByRole('button', { name: /Product/ }));
    expect(onNavigate).toHaveBeenNthCalledWith(1, 'growth');
    expect(onNavigate).toHaveBeenNthCalledWith(2, 'product');
  });
});
