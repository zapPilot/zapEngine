// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell, type DashboardView } from './AppShell.js';

afterEach(cleanup);

function renderShell(props: Partial<Parameters<typeof AppShell>[0]> = {}) {
  const onNavigate = vi.fn();
  const onRefresh = vi.fn();
  render(
    <AppShell
      activeView="home"
      loading={false}
      onNavigate={onNavigate}
      onRefresh={onRefresh}
      subtitle="What needs a decision right now"
      title="Home"
      {...props}
    >
      <p>content</p>
    </AppShell>,
  );
  return { onNavigate, onRefresh };
}

describe('AppShell', () => {
  it('names the five domains a founder navigates between', () => {
    renderShell();
    const nav = screen.getByRole('navigation', {
      name: 'Control Center views',
    });
    expect(
      [...nav.querySelectorAll('button')].map((button) => button.textContent),
    ).toEqual(['Home', 'Growth', 'Product', 'Reliability', 'Economics']);
  });

  it('marks only the active view as the current page', () => {
    renderShell({ activeView: 'economics' });
    expect(screen.getByRole('button', { name: 'Economics' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: 'Home' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('reports the view a reader asked for', () => {
    const { onNavigate } = renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Product' }));
    expect(onNavigate).toHaveBeenCalledWith('product' satisfies DashboardView);
  });

  // Leaving Home must not be able to hide open decisions: the count follows
  // the reader into every other view.
  it('badges open decisions on Reliability alone', () => {
    renderShell({ decisionsPending: 3 });
    expect(screen.getByRole('button', { name: 'Reliability 3' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Growth \d/ })).toBeNull();
  });

  it('drops the badge when nothing needs a decision', () => {
    renderShell({ decisionsPending: 0 });
    expect(screen.getByRole('button', { name: 'Reliability' })).toBeVisible();
  });

  it('blocks a second refresh while one is in flight', () => {
    const { onRefresh } = renderShell({ loading: true });
    const button = screen.getByRole('button', { name: 'Refresh' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('refreshes on request', () => {
    const { onRefresh } = renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('says when no snapshot has arrived instead of showing a stale time', () => {
    renderShell();
    expect(screen.getByText('Waiting for data')).toBeVisible();
  });
});
