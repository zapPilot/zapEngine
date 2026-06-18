import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  detectRegressions,
  formatMarkdownReport,
  METRIC_THRESHOLDS_PP,
  REGRESSION_THRESHOLD_PP,
  type MonorepoSummaryInput,
} from './coverage-regression.ts';

type MetricOverrides = Partial<
  Record<'statements' | 'branches' | 'functions' | 'lines', number>
>;

// `pct` sets all four metrics; pass overrides to move one metric independently
// (e.g. ws('apps/frontend', 90, { branches: 88 }) keeps lines at 90).
function ws(
  name: string,
  pct: number,
  overrides: MetricOverrides = {},
): MonorepoSummaryInput['workspaces'][number] {
  const m = (p: number) => ({ total: 100, covered: p, pct: p });
  return {
    name,
    statements: m(overrides.statements ?? pct),
    branches: m(overrides.branches ?? pct),
    functions: m(overrides.functions ?? pct),
    lines: m(overrides.lines ?? pct),
  };
}

const emptyTotal = {
  statements: { total: 0, covered: 0, pct: 0 },
  branches: { total: 0, covered: 0, pct: 0 },
  functions: { total: 0, covered: 0, pct: 0 },
  lines: { total: 0, covered: 0, pct: 0 },
};

describe('detectRegressions', () => {
  it('returns no regressions when coverage is unchanged', () => {
    const baseline: MonorepoSummaryInput = {
      workspaces: [ws('packages/intent-engine', 90)],
      total: emptyTotal,
    };
    const current: MonorepoSummaryInput = {
      workspaces: [ws('packages/intent-engine', 90)],
      total: emptyTotal,
    };
    const regressions = detectRegressions(current, baseline);
    assert.equal(regressions.length, 0);
  });

  it('returns no regressions when coverage improved', () => {
    const baseline: MonorepoSummaryInput = {
      workspaces: [ws('packages/intent-engine', 85)],
      total: emptyTotal,
    };
    const current: MonorepoSummaryInput = {
      workspaces: [ws('packages/intent-engine', 92)],
      total: emptyTotal,
    };
    assert.equal(detectRegressions(current, baseline).length, 0);
  });

  it('tolerates noise drops smaller than the threshold', () => {
    // 0.2 pp drop must not trigger (threshold is 0.3)
    const baseline: MonorepoSummaryInput = {
      workspaces: [ws('apps/frontend', 75.5)],
      total: emptyTotal,
    };
    const current: MonorepoSummaryInput = {
      workspaces: [ws('apps/frontend', 75.3)],
      total: emptyTotal,
    };
    assert.equal(detectRegressions(current, baseline).length, 0);
  });

  it('flags a lines drop greater than the threshold', () => {
    const baseline: MonorepoSummaryInput = {
      workspaces: [ws('apps/account-engine', 90)],
      total: emptyTotal,
    };
    const current: MonorepoSummaryInput = {
      // Only lines drops, so this asserts the lines metric independently of the
      // branches/functions thresholds.
      workspaces: [ws('apps/account-engine', 90, { lines: 89.5 })],
      total: emptyTotal,
    };
    const regressions = detectRegressions(current, baseline);
    assert.equal(regressions.length, 1);
    assert.equal(regressions[0].workspace, 'apps/account-engine');
    assert.equal(regressions[0].metric, 'lines');
    assert.equal(regressions[0].baselinePct, 90);
    assert.equal(regressions[0].currentPct, 89.5);
    assert.equal(Math.round(regressions[0].deltaPp * 100) / 100, -0.5);
  });

  it('flags a branches-only regression even when lines is stable', () => {
    const baseline: MonorepoSummaryInput = {
      workspaces: [ws('apps/frontend', 90)],
      total: emptyTotal,
    };
    const current: MonorepoSummaryInput = {
      workspaces: [ws('apps/frontend', 90, { branches: 88 })], // branches -2.0
      total: emptyTotal,
    };
    const regressions = detectRegressions(current, baseline);
    assert.equal(regressions.length, 1);
    assert.equal(regressions[0].metric, 'branches');
    assert.equal(regressions[0].baselinePct, 90);
    assert.equal(regressions[0].currentPct, 88);
  });

  it('tolerates branch noise under the (looser) branches threshold', () => {
    // branches threshold is 0.75 pp; a 0.5 pp branch drop must not trip it.
    const baseline: MonorepoSummaryInput = {
      workspaces: [ws('apps/frontend', 80)],
      total: emptyTotal,
    };
    const current: MonorepoSummaryInput = {
      workspaces: [ws('apps/frontend', 80, { branches: 79.5 })],
      total: emptyTotal,
    };
    assert.equal(detectRegressions(current, baseline).length, 0);
  });

  it('flags a functions regression past its threshold', () => {
    const baseline: MonorepoSummaryInput = {
      workspaces: [ws('packages/types', 95)],
      total: emptyTotal,
    };
    const current: MonorepoSummaryInput = {
      workspaces: [ws('packages/types', 95, { functions: 94 })], // -1.0 > 0.5
      total: emptyTotal,
    };
    const regressions = detectRegressions(current, baseline);
    assert.equal(regressions.length, 1);
    assert.equal(regressions[0].metric, 'functions');
  });

  it('flags a missing workspace (treats as 0% current) when baseline had data', () => {
    const baseline: MonorepoSummaryInput = {
      workspaces: [ws('packages/types', 90)],
      total: emptyTotal,
    };
    const current: MonorepoSummaryInput = { workspaces: [], total: emptyTotal };
    const regressions = detectRegressions(current, baseline);
    assert.equal(regressions.length, 1);
    assert.equal(regressions[0].workspace, 'packages/types');
    assert.equal(regressions[0].currentPct, null);
  });

  it('does NOT flag a new workspace with no baseline', () => {
    // Adding a new workspace shouldn't fail the gate even if its initial
    // coverage is low — it raises the floor over time.
    const baseline: MonorepoSummaryInput = {
      workspaces: [],
      total: emptyTotal,
    };
    const current: MonorepoSummaryInput = {
      workspaces: [ws('apps/new-app', 20)],
      total: emptyTotal,
    };
    assert.equal(detectRegressions(current, baseline).length, 0);
  });

  it('detects regressions across multiple workspaces independently', () => {
    const baseline: MonorepoSummaryInput = {
      workspaces: [
        ws('packages/intent-engine', 90),
        ws('apps/frontend', 75),
        ws('apps/account-engine', 90),
      ],
      total: emptyTotal,
    };
    const current: MonorepoSummaryInput = {
      workspaces: [
        ws('packages/intent-engine', 88), // -2.0 pp → flag
        ws('apps/frontend', 75.1), // +0.1 pp → ok
        ws('apps/account-engine', 89.9), // -0.1 pp → ok (under threshold)
      ],
      total: emptyTotal,
    };
    const regressions = detectRegressions(current, baseline);
    // A uniform drop flags every monitored metric, so assert on the set of
    // regressed workspaces rather than a raw count.
    const regressed = new Set(regressions.map((r) => r.workspace));
    assert.equal(regressed.size, 1);
    assert.ok(regressed.has('packages/intent-engine'));
    assert.ok(!regressed.has('apps/frontend'));
    assert.ok(!regressed.has('apps/account-engine'));
  });

  it('exposes the threshold constants', () => {
    // Documented contract: lines stays at the historical 0.3 pp; branches and
    // functions get >= that headroom because they swing more.
    assert.equal(REGRESSION_THRESHOLD_PP, 0.3);
    assert.equal(METRIC_THRESHOLDS_PP.lines, 0.3);
    assert.ok(METRIC_THRESHOLDS_PP.branches >= METRIC_THRESHOLDS_PP.lines);
    assert.ok(METRIC_THRESHOLDS_PP.functions >= METRIC_THRESHOLDS_PP.lines);
  });
});

describe('formatMarkdownReport', () => {
  it('reports OK when there are no regressions', () => {
    const baseline: MonorepoSummaryInput = {
      workspaces: [ws('packages/intent-engine', 90)],
      total: emptyTotal,
    };
    const current: MonorepoSummaryInput = {
      workspaces: [ws('packages/intent-engine', 91)],
      total: emptyTotal,
    };
    const out = formatMarkdownReport(current, baseline, []);
    assert.match(out, /No coverage regressions/);
    assert.match(out, /packages\/intent-engine/);
    assert.match(out, /91/);
  });

  it('renders a regression table when drops are detected', () => {
    const baseline: MonorepoSummaryInput = {
      workspaces: [ws('apps/account-engine', 90)],
      total: emptyTotal,
    };
    const current: MonorepoSummaryInput = {
      workspaces: [ws('apps/account-engine', 85)],
      total: emptyTotal,
    };
    const regressions = detectRegressions(current, baseline);
    const out = formatMarkdownReport(current, baseline, regressions);
    assert.match(out, /Coverage regression/i);
    assert.match(out, /apps\/account-engine/);
    assert.match(out, /-5/); // delta
  });
});
