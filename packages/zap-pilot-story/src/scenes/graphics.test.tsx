// @vitest-environment jsdom
import { render, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SignalGraphic } from './SignalGraphic.js';
import { EngineWorld } from './EngineWorld.js';
import { engineDecision } from '../facts/decision.js';
import { ReplayBoard } from './ReplayBoard.js';
afterEach(cleanup);
it('plots the two recorded closes and shows the BTC cross-down without fabricated history', () => {
  const decision = engineDecision();
  const { container } = render(<SignalGraphic target={null} />);
  const rows = container.querySelectorAll('.zp-signal-row');
  expect(rows).toHaveLength(3);
  expect(decision.previousDmaDistance['BTC']).toBeGreaterThan(0);
  expect(decision.dmaDistance['BTC']).toBeLessThan(0);
  expect(rows[0]?.textContent).toContain(
    `${decision.dmaDistance['BTC']!.toFixed(2)}%`,
  );
  const path = rows[0]
    ?.querySelector('path[stroke-width="2"]')
    ?.getAttribute('d');
  const coordinates = path?.match(/^M4 (.+)L96 (.+)$/);
  expect(Number(coordinates?.[1])).toBeLessThan(10);
  expect(Number(coordinates?.[2])).toBeGreaterThan(10);
});
it('encodes recorded allocation in a complete four-sleeve ring, including zero weights', () => {
  const { container } = render(<SignalGraphic target={1} />);
  const arcs = [...container.querySelectorAll('.zp-allocation-ring circle')];
  expect(arcs).toHaveLength(4);
  const values = arcs.map((arc) =>
    Number(arc.getAttribute('stroke-dasharray')!.split(' ')[0]),
  );
  expect(values).toEqual(engineDecision().target.slice(0, 4));
  expect(values.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1);
});
it('pairs each target model with its own glyph and numeric badge', () => {
  const { container } = render(<EngineWorld time={0.51} />);
  const labels = [...container.querySelectorAll('.zp-blb')].filter((label) =>
    label.querySelector('.zp-asset-glyph'),
  );
  expect(labels).toHaveLength(4);
  labels.forEach((label, i) =>
    expect(label.textContent).toContain(
      `${engineDecision().target[i]!.toFixed(2)}%`,
    ),
  );
});
it('compares Rules and DCA using paired bars while retaining the disclosure', () => {
  const { container } = render(<ReplayBoard />);
  expect(container.querySelectorAll('.zp-stat-bar')).toHaveLength(6);
  expect(container.textContent).not.toContain('What the rules held');
  expect(container.textContent).toContain(
    'Past performance does not guarantee future results.',
  );
});
