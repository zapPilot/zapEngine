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
  signalFixture,
  statementFixture,
  statementHeaderFixture,
  statementsResponseFixture,
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
      statements={statementsResponseFixture()}
      {...props}
    />,
  );
  return { onNavigate };
}

function fiveStatements() {
  return statementsResponseFixture({
    statements: [
      statementFixture({ domain: 'reliability', score: 178 }),
      statementFixture({
        domain: 'product',
        score: 132,
        sentence: [{ text: '9 active portfolios, flat for three weeks.' }],
      }),
      statementFixture({
        domain: 'pipeline',
        score: 90,
        sentence: [{ text: '3 in production; nothing stuck.' }],
      }),
      statementFixture({
        domain: 'spend',
        score: 70,
        sentence: [
          { text: 'September is pacing to ' },
          { value: '$60.80', tone: 'neutral' },
          { text: '.' },
        ],
      }),
      statementFixture({
        domain: 'growth',
        score: 40,
        sentence: [{ text: 'Audience +26 this week.' }],
      }),
    ],
    headers: [
      statementHeaderFixture({ domain: 'reliability' }),
      statementHeaderFixture({ domain: 'product', facts: [] }),
      statementHeaderFixture({ domain: 'pipeline', facts: [] }),
      statementHeaderFixture({ domain: 'spend', facts: [] }),
      statementHeaderFixture({ domain: 'growth', facts: [] }),
    ],
  });
}

describe('HomeView', () => {
  it('leads with the verdict sentence, not a status banner', () => {
    renderHome({ statements: fiveStatements() });
    const verdict = document.querySelector('.home-verdict');
    expect(verdict).not.toBeNull();
    expect(verdict).toHaveTextContent('account-engine has no started Machine');
  });

  it('renders all five statements sorted by priority, none expanded', () => {
    renderHome({ statements: fiveStatements() });
    const rows = document.querySelectorAll('details.statement-row');
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect((row as HTMLDetailsElement).open).toBe(false);
    }
    expect(screen.getByText('3 in production; nothing stuck.')).toBeVisible();
    expect(screen.getByText('Audience +26 this week.')).toBeVisible();
  });

  it('opens a statement to reveal its evidence, closed by default', () => {
    renderHome({ statements: fiveStatements() });
    const toggle = screen.getAllByText('Evidence')[0]!;
    const row = toggle.closest('details') as HTMLDetailsElement;
    expect(row.open).toBe(false);
    fireEvent.click(toggle);
    expect(row.open).toBe(true);
  });

  it('shows the north star and its supporting trio in the metric band', () => {
    renderHome({ statements: fiveStatements() });
    const band = screen.getByRole('region', { name: 'How we are doing' });
    expect(within(band).getByText('Active portfolios')).toBeVisible();
    expect(within(band).getByText('Observed AUM')).toBeVisible();
    expect(within(band).getByText('Audience')).toBeVisible();
    expect(within(band).getByText('Month-end spend')).toBeVisible();
    expect(within(band).getByText('$179,612')).toBeVisible();
  });

  it("embeds the reliability queue inside that statement's evidence", () => {
    const priorities = [
      priorityFixture({
        signal: signalFixture({ fingerprint: 'a', title: 'Signal A' }),
      }),
    ];
    renderHome({
      operations: operationsFixture({ priorities }),
      statements: fiveStatements(),
    });
    const toggle = screen.getAllByText('Evidence')[0]!;
    fireEvent.click(toggle);
    expect(screen.getByText('Signal A')).toBeVisible();
  });

  it('bounds the home reliability queue to the first three ranked actions', () => {
    const priorities = ['A', 'B', 'C', 'D'].map((label, index) =>
      priorityFixture({
        score: 100 - index,
        signal: signalFixture({
          fingerprint: `signal-${label.toLowerCase()}`,
          title: `Signal ${label}`,
        }),
      }),
    );
    renderHome({
      operations: operationsFixture({ priorities }),
      statements: fiveStatements(),
    });

    fireEvent.click(screen.getAllByText('Evidence')[0]!);

    expect(screen.getByText('Signal A')).toBeVisible();
    expect(screen.getByText('Signal B')).toBeVisible();
    expect(screen.getByText('Signal C')).toBeVisible();
    expect(screen.queryByText('Signal D')).toBeNull();
    expect(document.querySelectorAll('.queue .queue-row')).toHaveLength(3);
  });

  it('sends each statement to the view that owns its detail', () => {
    const { onNavigate } = renderHome({ statements: fiveStatements() });
    for (const toggle of screen.getAllByText('Evidence')) {
      fireEvent.click(toggle);
    }
    fireEvent.click(screen.getByRole('button', { name: /Full Growth/ }));
    fireEvent.click(screen.getByRole('button', { name: /Full Product/ }));
    fireEvent.click(screen.getByRole('button', { name: /Full Economics/ }));
    fireEvent.click(screen.getByRole('button', { name: /Full Pipeline/ }));
    fireEvent.click(screen.getByRole('button', { name: /Full Reliability/ }));
    expect(onNavigate).toHaveBeenCalledWith('growth');
    expect(onNavigate).toHaveBeenCalledWith('product');
    expect(onNavigate).toHaveBeenCalledWith('economics');
    expect(onNavigate).toHaveBeenCalledWith('pipeline');
    expect(onNavigate).toHaveBeenCalledWith('reliability');
  });

  it('waits for data instead of showing an empty box', () => {
    renderHome({ data: null, operations: null, statements: null });
    expect(screen.getByText('Waiting for data.')).toBeVisible();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });
});
