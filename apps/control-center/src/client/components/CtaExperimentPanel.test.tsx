// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { CtaExperimentReading } from '../../shared/cta-experiment.js';
import { CtaExperimentPanel } from './CtaExperimentPanel.js';
afterEach(cleanup);
const reading: CtaExperimentReading = {
  key: 'test',
  status: 'ok',
  message: null,
  observedAt: '2026-10-03T00:00:00Z',
  windowDays: 30,
  conversionWindowHours: 24,
  readiness: 'inconclusive',
  excludedImmature: 2,
  excludedMultipleVariants: 1,
  visibilityUnmeasurable: 0,
  truncated: false,
  sources: { posthog: 'ok', waitlist: 'ok' },
  variants: [
    {
      variant: 'baseline',
      exposed: 10,
      visible: 4,
      clicked: 1,
      opened: 1,
      started: 1,
      attempted: 1,
      acknowledged: 1,
      confirmed: 0,
      errors: 1,
      closedWithoutSubmit: 0,
    },
  ],
  segments: [
    {
      variant: 'baseline',
      source: 'threads',
      device: 'Mobile',
      exposed: 10,
      visible: 4,
      clicked: 1,
      opened: 1,
      started: 1,
      attempted: 1,
      acknowledged: 1,
      confirmed: 0,
      errors: 1,
      closedWithoutSubmit: 0,
    },
  ],
  failures: [{ reason: 'network_or_timeout', people: 1 }],
  clickLocations: [],
  caveats: ['Observational baseline.'],
};
it('preserves unavailable and loading states', () => {
  const { rerender } = render(<CtaExperimentPanel reading={null} />);
  expect(screen.getByText('CTA 實驗資料尚未載入。')).toBeVisible();
  rerender(
    <CtaExperimentPanel
      reading={{ ...reading, status: 'unavailable', message: 'offline' }}
    />,
  );
  expect(screen.getByText('offline')).toBeVisible();
  rerender(
    <CtaExperimentPanel reading={{ ...reading, status: 'unavailable' }} />,
  );
  expect(screen.getByText('CTA 實驗資料尚未載入。')).toBeVisible();
});
it('separates baseline, acknowledgement and confirmed outcomes, with inconclusive guidance', () => {
  render(<CtaExperimentPanel reading={reading} />);
  expect(screen.getByText('baseline（非隨機實驗）')).toBeVisible();
  expect(screen.getByText(/資料不足/)).toBeVisible();
  expect(screen.getByText(/network_or_timeout 1 人/)).toBeVisible();
});
it('does not display missing visibility or durable data as zeros, or call sample readiness a winner', () => {
  render(
    <CtaExperimentPanel
      reading={{
        ...reading,
        message: 'Database unavailable',
        readiness: 'review_ready',
        visibilityUnmeasurable: 1,
        variants: [
          { ...reading.variants[0]!, variant: 'control', confirmed: null },
        ],
        segments: [{ ...reading.segments[0]!, confirmed: null }],
        failures: [],
      }}
    />,
  );
  expect(screen.getByText(/尚不能宣稱勝出/)).toBeVisible();
  expect(screen.getByText('Database unavailable')).toBeVisible();
  expect(screen.getAllByText('—')).toHaveLength(2);
});
