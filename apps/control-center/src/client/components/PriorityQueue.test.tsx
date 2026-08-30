// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { priorityFixture, signalFixture } from '../__fixtures__/dashboard.js';
import { PriorityQueue } from './PriorityQueue.js';

afterEach(cleanup);

describe('PriorityQueue', () => {
  it('separates "not loaded yet" from "nothing to do"', () => {
    const { rerender } = render(
      <PriorityQueue emptyMessage="All clear." priorities={undefined} />,
    );
    expect(screen.getByText('Waiting for data.')).toBeVisible();

    rerender(<PriorityQueue emptyMessage="All clear." priorities={[]} />);
    expect(screen.getByText('All clear.')).toBeVisible();
  });

  it('keeps the server ranking while collapsing evidence by default', () => {
    render(
      <PriorityQueue
        emptyMessage="All clear."
        priorities={[
          priorityFixture({
            score: 91,
            reasons: ['critical infra signal', 'retries exhausted'],
            signal: signalFixture({
              fingerprint: 'a',
              title: 'Machine stopped',
            }),
          }),
          priorityFixture({
            score: 44,
            signal: signalFixture({
              fingerprint: 'b',
              status: 'degraded',
              title: 'Publish queue overdue',
            }),
          }),
        ]}
      />,
    );
    expect(
      screen.getAllByRole('listitem').map((item) => item.className),
    ).toEqual(['queue-row critical', 'queue-row degraded']);
    expect(screen.getByText('91')).toBeVisible();
    expect(screen.getByText('retries exhausted')).not.toBeVisible();

    fireEvent.click(screen.getByText('Machine stopped'));
    expect(screen.getByText('retries exhausted')).toBeVisible();
  });

  it('shows only the top slice when a limit is set', () => {
    render(
      <PriorityQueue
        emptyMessage="All clear."
        limit={1}
        priorities={[
          priorityFixture({ signal: signalFixture({ fingerprint: 'a' }) }),
          priorityFixture({
            signal: signalFixture({ fingerprint: 'b', title: 'Second' }),
          }),
        ]}
      />,
    );
    expect(screen.queryByText('Second')).toBeNull();
  });

  it('reveals the source link only after the signal is expanded', () => {
    render(
      <PriorityQueue
        emptyMessage="All clear."
        priorities={[
          priorityFixture({
            signal: signalFixture({
              title: 'Workflow failing',
              url: 'https://github.com/zapPilot/zapEngine/actions/runs/1',
            }),
          }),
        ]}
      />,
    );
    expect(screen.queryByRole('link', { name: 'Open source' })).toBeNull();

    fireEvent.click(screen.getByText('Workflow failing'));
    const link = screen.getByRole('link', { name: 'Open source' });
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/zapPilot/zapEngine/actions/runs/1',
    );
    expect(link).toHaveAttribute('target', '_blank');
  });
});
