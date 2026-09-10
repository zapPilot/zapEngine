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
      title="今日"
      {...props}
    >
      <p>content</p>
    </AppShell>,
  );
  return { onNavigate, onRefresh };
}

describe('AppShell', () => {
  it('keeps primary navigation to four operator questions', () => {
    renderShell();
    const nav = screen.getByRole('navigation', {
      name: 'Control Center views',
    });
    expect(
      [...nav.querySelectorAll('button')].map((button) => button.textContent),
    ).toEqual(['今日', '成長', 'Pipeline', '可靠性']);
  });

  it('does not expose Product or Economics as primary destinations', () => {
    renderShell();
    expect(screen.queryByRole('button', { name: 'Product' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Economics' })).toBeNull();
  });

  it('marks only the active view as the current page', () => {
    renderShell({ activeView: 'reliability' });
    expect(screen.getByRole('button', { name: '可靠性' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: '今日' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('reports the view a reader asked for', () => {
    const { onNavigate } = renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Pipeline' }));
    expect(onNavigate).toHaveBeenCalledWith('pipeline' satisfies DashboardView);
  });

  // Leaving Today must not be able to hide open decisions: the count follows
  // the reader into every other view.
  it('badges open decisions on Reliability alone', () => {
    renderShell({ decisionsPending: 3 });
    expect(screen.getByRole('button', { name: '可靠性 3' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /成長 \d/ })).toBeNull();
  });

  it('drops the badge when nothing needs a decision', () => {
    renderShell({ decisionsPending: 0 });
    expect(screen.getByRole('button', { name: '可靠性' })).toBeVisible();
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
