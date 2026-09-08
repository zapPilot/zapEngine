import { productAcquisitionFromOperations } from '../product-acquisition.js';
import type { RuleFinding, StatementInputs } from './types.js';

/**
 * Acquisition is an explanatory product signal, not an operational alarm.
 * Keep the status healthy and let the sentence expose the bottleneck without
 * inventing a conversion target we have not productized yet.
 */
export function ruleProductDemand(input: StatementInputs): RuleFinding {
  // Keep this finding local: unlike the numbered product-health rules it has no
  // metric-series row of its own yet, so sharing their constructor would imply
  // a stronger lifecycle relationship than actually exists.
  const finding: RuleFinding = {
    id: 'PRODUCT_DEMAND',
    segments: [],
    series: [],
    fact: null,
    status: 'healthy',
    deltaTone: 'neutral',
    delta: null,
    value: null,
  };
  const acquisition = productAcquisitionFromOperations(input.operations);
  const landing = acquisition?.landingVisitors30d ?? null;
  if (landing === null) {
    return finding;
  }

  const cta = acquisition?.ctaUsers30d ?? null;
  const app = acquisition?.appVisitors30d ?? null;
  const wallet = acquisition?.walletConnectedUsers30d ?? null;
  const conversion = landing > 0 && cta !== null ? cta / landing : null;

  finding.segments.push(
    { value: `${count(landing)} landing visitors`, tone: 'neutral' },
    { text: ' in 30d' },
  );
  if (cta !== null) {
    finding.segments.push(
      { text: '; ' },
      {
        value: `${count(cta)} showed CTA intent${conversion === null ? '' : ` (${percent(conversion)})`}`,
        tone: cta === 0 && landing > 0 ? 'warning' : 'neutral',
      },
    );
  }
  finding.segments.push({ text: '.' });

  if (app !== null || wallet !== null) {
    finding.segments.push({ text: ' ' });
    if (app !== null) {
      finding.segments.push(
        { value: `${count(app)} reached the app`, tone: 'neutral' },
        { text: wallet === null ? '.' : '; ' },
      );
    }
    if (wallet !== null) {
      finding.segments.push(
        { value: `${count(wallet)} wallet connects`, tone: 'neutral' },
        { text: ' were observed overall, not attributed to that CTA.' },
      );
    }
  }

  const deadClicks = acquisition?.landingDeadClickUsers7d ?? null;
  finding.fact = {
    kicker: 'Because · product demand',
    value: `${count(landing)} landing visitors · 30d`,
    note: [
      cta === null
        ? null
        : `${count(cta)} CTA intent${conversion === null ? '' : ` (${percent(conversion)})`}`,
      app === null ? null : `${count(app)} app visitors`,
      wallet === null ? null : `${count(wallet)} wallet connects overall`,
      deadClicks === null ? null : `${count(deadClicks)} landing dead-click users · 7d`,
    ]
      .filter((part): part is string => Boolean(part))
      .join(' · '),
  };
  return finding;
}

function count(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function percent(value: number): string {
  return `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;
}
