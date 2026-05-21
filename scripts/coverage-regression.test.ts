import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  detectRegressions,
  formatMarkdownReport,
  REGRESSION_THRESHOLD_PP,
  type MonorepoSummaryInput,
} from './coverage-regression.ts';

function ws(name: string, pct: number): MonorepoSummaryInput['workspaces'][number] {
  return {
    name,
    statements: { total: 100, covered: pct, pct },
    branches: { total: 100, covered: pct, pct },
    functions: { total: 100, covered: pct, pct },
    lines: { total: 100, covered: pct, pct },
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

  it('flags a drop greater than the threshold', () => {
    const baseline: MonorepoSummaryInput = {
      workspaces: [ws('apps/account-engine', 90)],
      total: emptyTotal,
    };
    const current: MonorepoSummaryInput = {
      workspaces: [ws('apps/account-engine', 89.5)],
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
    const baseline: MonorepoSummaryInput = { workspaces: [], total: emptyTotal };
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
    assert.equal(regressions.length, 1);
    assert.equal(regressions[0].workspace, 'packages/intent-engine');
  });

  it('exposes the threshold constant', () => {
    // Documented contract: 0.3 pp matches the plan
    assert.equal(REGRESSION_THRESHOLD_PP, 0.3);
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
