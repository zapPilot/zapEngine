import {
  count,
  elapsedFromMinutes,
  money,
  percent,
  plural,
  seriesAndDelta,
  signedCount,
  signedPercent,
} from './format.js';
import type { RuleFinding, RuleTone, StatementInputs } from './types.js';
import type { MetricSeries } from '../metric-snapshots.js';

function empty(id: string): RuleFinding {
  return {
    id,
    status: 'healthy',
    segments: [],
    fact: null,
    series: [],
    value: null,
    delta: null,
    deltaTone: 'neutral',
  };
}

function numericEvidence(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sumKnown(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

/** Sums several metric keys' series pointwise from the most recent date back. */
function sumSeries(
  metricSeries: Map<string, MetricSeries>,
  keys: readonly string[],
): { series: number[]; delta7d: number | null } {
  const entries = keys
    .map((key) => metricSeries.get(key))
    .filter((entry): entry is MetricSeries => Boolean(entry?.series.length));
  if (entries.length === 0) {
    return { series: [], delta7d: null };
  }
  const shortest = Math.min(...entries.map((entry) => entry.series.length));
  const series = Array.from({ length: shortest }, (_, indexFromEnd) => {
    const index = shortest - 1 - indexFromEnd;
    return entries.reduce(
      (sum, entry) =>
        sum + (entry.series[entry.series.length - 1 - index] ?? 0),
      0,
    );
  }).reverse();
  const delta7d = entries.every((entry) => entry.delta7d !== null)
    ? entries.reduce((sum, entry) => sum + (entry.delta7d ?? 0), 0)
    : null;
  return { series, delta7d };
}

function deltaCaption(
  delta7d: number | null,
  rowCount: number,
  tone: (delta: number) => RuleTone,
  digits = 0,
): { delta: string; deltaTone: RuleTone } {
  if (delta7d === null) {
    return {
      delta: `collecting (${Math.min(rowCount, 7)}/7)`,
      deltaTone: 'neutral',
    };
  }
  const sign = delta7d > 0 ? '+' : delta7d < 0 ? '' : '±';
  return {
    delta: `${sign}${delta7d.toFixed(digits)} · 7d`,
    deltaTone: tone(delta7d),
  };
}

const PLATFORM_LABELS: Record<string, string> = {
  rednote: 'Rednote',
  x: 'X',
  youtube: 'YouTube',
  threads: 'Threads',
};

function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}

/** R1 — any critical signal. */
export function ruleR1(input: StatementInputs): RuleFinding {
  const { operations } = input;
  const critical = operations.signals.filter((s) => s.status === 'critical');
  const degraded = operations.signals.filter((s) => s.status === 'degraded');
  const unconfigured = operations.domains.filter((d) => d.status === 'unknown');
  const healthyDomains = operations.domains.filter(
    (d) => d.status === 'healthy',
  ).length;
  const totalDomains = operations.domains.length;
  const top =
    operations.priorities.find((p) => p.signal.status === 'critical')?.signal ??
    critical[0];

  const finding = empty('R1');
  if (critical.length > 0) {
    finding.status = 'critical';
    const elapsed = elapsedFromMinutes(
      numericEvidence(top?.evidence['criticalSinceMinutes']),
    );
    finding.segments.push(
      { text: `${critical.length} critical: ` },
      { value: top?.title ?? 'a critical signal', tone: 'error' },
      { text: elapsed ? ` (${elapsed}).` : '.' },
    );
    finding.value = `${critical.length} critical`;
  } else if (degraded.length > 0) {
    finding.status = 'degraded';
    finding.segments.push(
      { value: `${degraded.length} degraded`, tone: 'warning' },
      { text: ', nothing critical.' },
    );
    finding.value = `${degraded.length} degraded`;
  } else {
    finding.segments.push({ text: `All ${totalDomains} domains healthy.` });
    finding.value = 'Healthy';
  }
  if (unconfigured.length > 0) {
    finding.segments.push(
      { text: ' ' },
      { value: `${unconfigured.length} unconfigured`, tone: 'neutral' },
      { text: ', not failing.' },
    );
  }

  const series = seriesAndDelta(
    input.metricSeries,
    'healthy_domains',
    (delta) => (delta >= 0 ? 'good' : 'bad'),
  );
  finding.series = series.series;
  finding.delta = `${healthyDomains} of ${totalDomains} healthy`;
  finding.deltaTone =
    critical.length > 0 ? 'bad' : degraded.length > 0 ? 'bad' : 'good';
  finding.fact = {
    kicker: 'Because · domains',
    value:
      critical.length > 0
        ? `${critical.length} critical`
        : degraded.length > 0
          ? `${degraded.length} degraded`
          : 'All healthy',
    note: `${healthyDomains} of ${totalDomains} domains healthy`,
  };
  return finding;
}

/** R2 — always (spend). */
export function ruleR2(input: StatementInputs): RuleFinding {
  const { overview, costHistory, now } = input;
  const finding = empty('R2');
  const monthName = now.toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
  const previousMonthDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  const previousMonthName = previousMonthDate.toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
  // Compare like with like. `projectedCostUsd` sums only the providers that
  // reported an amount, so measuring it against last month's whole ledger
  // reads a provider going dark — Fly, whenever no operator figure was
  // recorded — as a saving: last month's Fly spend sits in the baseline while
  // this month's is absent from the total. The baseline is therefore rebuilt
  // from exactly the providers behind today's total, and when one of them has
  // no prior-month figure to stand on the two sides cannot be made to cover
  // the same providers, so the rule states no percentage rather than one
  // measured across mismatched sets.
  const pricedProviders = overview.providers.filter(
    (provider) => typeof provider.snapshot?.projectedCostUsd === 'number',
  );
  const previousByProvider = new Map(
    costHistory.previousMonthByProvider.map((entry) => [
      entry.provider,
      entry.accruedCostUsd,
    ]),
  );
  const previousForPriced = pricedProviders.map(
    (provider) => previousByProvider.get(provider.provider) ?? null,
  );
  const lastMonthTotal =
    previousForPriced.length > 0 &&
    previousForPriced.every((value) => value !== null)
      ? sumKnown(previousForPriced)
      : null;
  const projected = overview.projectedCostUsd;
  const pct =
    projected !== null && lastMonthTotal !== null && lastMonthTotal > 0
      ? (projected - lastMonthTotal) / lastMonthTotal
      : null;
  const flat = pct !== null && Math.abs(pct) < 0.05;

  // An operator-recorded figure is billed month-to-date spend, not a
  // projection, so subtracting a whole prior month from a partial one would
  // name that provider the driver of a collapse it never had — every month,
  // on the 2nd. It still counts toward the projected total; only this
  // "who moved" comparison drops it.
  const providerDeltas = overview.providers
    .filter((provider) => provider.snapshot?.source !== 'manual')
    .map((provider) => {
      const current = provider.snapshot?.projectedCostUsd ?? null;
      const previous =
        costHistory.previousMonthByProvider.find(
          (p) => p.provider === provider.provider,
        )?.accruedCostUsd ?? null;
      return {
        label: provider.label,
        delta:
          current !== null && previous !== null ? current - previous : null,
      };
    })
    .filter(
      (entry): entry is { label: string; delta: number } =>
        entry.delta !== null,
    );
  const driver = providerDeltas.length
    ? providerDeltas.reduce((best, next) =>
        Math.abs(next.delta) > Math.abs(best.delta) ? next : best,
      )
    : null;

  finding.status = flat
    ? 'healthy'
    : pct !== null && pct > 0
      ? 'degraded'
      : 'healthy';
  finding.segments.push(
    { text: `${monthName} is pacing to ` },
    { value: money(projected), tone: 'neutral' },
    {
      text:
        pct === null
          ? '.'
          : flat
            ? `, flat vs ${previousMonthName}.`
            : `, ${signedPercent(pct)} vs ${previousMonthName}.`,
    },
  );
  if (driver) {
    finding.segments.push(
      { text: ` ${driver.label} is the driver (` },
      {
        value: `${driver.delta >= 0 ? '+' : ''}${money(driver.delta, 2)}`,
        tone: driver.delta >= 0 ? 'warning' : 'success',
      },
      { text: ').' },
    );
  }

  const series = seriesAndDelta(
    input.metricSeries,
    'usage_run_rate_usd',
    () => 'neutral',
    2,
  );
  finding.series = series.series;
  finding.value = money(projected);
  finding.delta = pct === null ? series.delta : `${signedPercent(pct)} · MoM`;
  // Without a comparable baseline the caption falls back to the sparkline's
  // own Δ7d, which no month-over-month tone can honestly colour.
  finding.deltaTone =
    pct === null || flat ? 'neutral' : pct > 0 ? 'bad' : 'good';
  finding.fact = {
    kicker: 'Because · spend',
    value: money(projected),
    note:
      pct === null
        ? `no comparable ${previousMonthName} baseline`
        : `${signedPercent(pct)} vs ${previousMonthName}${driver ? ` · ${driver.label} driving` : ''}`,
  };
  return finding;
}

/** R3 — cash spend far exceeds accrued this month. */
export function ruleR3(input: StatementInputs): RuleFinding {
  const { overview } = input;
  const finding = empty('R3');
  const cash = overview.cashInvoiceSpendUsd;
  const accrued = overview.accruedCostUsd;
  const fires =
    cash !== null && accrued !== null && accrued > 0 && cash > accrued * 3;
  if (fires) {
    finding.segments.push(
      { text: 'Cash spend ' },
      { value: money(cash), tone: 'neutral' },
      { text: ' is prepaid units, not consumption.' },
    );
    finding.fact = {
      kicker: 'Because · cash vs accrued',
      value: money(cash),
      note: `${money(accrued)} accrued this month — the rest is prepaid`,
    };
  }
  return finding;
}

/** R4 — always (growth). */
export function ruleR4(input: StatementInputs): RuleFinding {
  const { socialGrowth } = input;
  const finding = empty('R4');
  const platforms = socialGrowth.platforms;
  const totalDelta7d = sumKnown(platforms.map((p) => p.followersDelta7d));
  const totalFollowers = sumKnown(platforms.map((p) => p.followersNow));
  const priorTotal =
    totalDelta7d !== null && totalFollowers !== null
      ? totalFollowers - totalDelta7d
      : null;
  const pctChange =
    totalDelta7d !== null && priorTotal !== null && priorTotal > 0
      ? totalDelta7d / priorTotal
      : null;
  const positive = platforms.filter((p) => (p.followersDelta7d ?? 0) > 0);
  const dominant = positive.length
    ? positive.reduce((best, next) =>
        (next.followersDelta7d ?? 0) > (best.followersDelta7d ?? 0)
          ? next
          : best,
      )
    : null;
  const share =
    dominant && totalDelta7d && totalDelta7d > 0
      ? (dominant.followersDelta7d ?? 0) / totalDelta7d
      : null;

  finding.status = 'healthy';
  finding.segments.push(
    { text: 'Audience ' },
    {
      value: signedCount(totalDelta7d),
      tone:
        (totalDelta7d ?? 0) > 0
          ? 'success'
          : (totalDelta7d ?? 0) < 0
            ? 'error'
            : 'neutral',
    },
    {
      text:
        pctChange === null
          ? ' this week, '
          : ` this week (${signedPercent(pctChange, 1)}), `,
    },
    dominant && share !== null
      ? { value: percent(share, 0), tone: 'neutral' }
      : { text: 'no single platform' },
    {
      text: dominant
        ? ` of it on ${platformLabel(dominant.platform)}.`
        : ' driving net growth.',
    },
  );

  const series = seriesAndDelta(
    input.metricSeries,
    `followers_${dominant?.platform ?? platforms[0]?.platform ?? ''}`,
    (delta) => (delta >= 0 ? 'good' : 'bad'),
  );
  finding.series = series.series;
  finding.value = count(totalFollowers);
  finding.delta = `${signedCount(totalDelta7d)} · 7d`;
  finding.deltaTone = (totalDelta7d ?? 0) >= 0 ? 'good' : 'bad';
  finding.fact = {
    kicker: 'Because · audience',
    value: `${signedCount(totalDelta7d)} followers in 7d${pctChange !== null ? ` (${signedPercent(pctChange, 1)})` : ''}`,
    note: platforms
      .map(
        (p) =>
          `${platformLabel(p.platform)} ${signedCount(p.followersDelta24h)}`,
      )
      .join(' · '),
  };
  return finding;
}

/** R5 — best-performing topic and slot. */
export function ruleR5(input: StatementInputs): RuleFinding {
  const { socialPerformance } = input;
  const finding = empty('R5');
  const candidate = socialPerformance.decisions
    .filter(
      (decision) =>
        decision.bestTopic &&
        (decision.bestTopicLiftVsPlatformMedian ?? 0) >= 1.5 &&
        decision.confidence !== 'low',
    )
    .sort(
      (a, b) =>
        (b.bestTopicLiftVsPlatformMedian ?? 0) -
        (a.bestTopicLiftVsPlatformMedian ?? 0),
    )[0];

  if (candidate) {
    finding.segments.push(
      { text: `Posts on ${candidate.bestTopic} do ` },
      {
        value: `${(candidate.bestTopicLiftVsPlatformMedian ?? 0).toFixed(1)}×`,
        tone: 'success',
      },
      { text: ` the ${candidate.platform} median` },
      {
        text: candidate.publishSlotsJst
          ? ` — publish the next one at ${candidate.publishSlotsJst}.`
          : '.',
      },
    );
    finding.fact = {
      kicker: 'Because · topic',
      value: `${candidate.bestTopic}: ${(candidate.bestTopicLiftVsPlatformMedian ?? 0).toFixed(1)}× ${candidate.platform} median`,
      note: `n=${candidate.bestTopicSamples ?? 0} · ${candidate.confidence} confidence`,
    };
  } else {
    const keepComparable = socialPerformance.decisions.find(
      (decision) => decision.bestTopic,
    );
    if (keepComparable) {
      finding.segments.push({
        text: `Not enough separation yet on ${keepComparable.platform} — keep posting a comparable mix.`,
      });
      finding.fact = {
        kicker: 'Because · topic',
        value: 'No topic clears the bar yet',
        note: `${keepComparable.platform} · ${keepComparable.confidence} confidence`,
      };
    }
  }
  return finding;
}

/** R6 — active portfolios trend/flat-ness (the north star). */
export function ruleR6(input: StatementInputs): RuleFinding {
  const { product } = input;
  const finding = empty('R6');
  const value = product.activePortfolios7d;
  const series = seriesAndDelta(
    input.metricSeries,
    'active_portfolios_7d',
    (delta) => (delta >= 0 ? 'good' : 'bad'),
  );
  const entry = input.metricSeries.get('active_portfolios_7d');
  const weeksOfHistory = entry ? Math.floor(entry.rowCount / 7) : 0;
  const flat =
    entry?.delta7d !== null && entry?.delta7d !== undefined
      ? Math.abs(entry.delta7d) <= 1 && weeksOfHistory >= 3
      : null;
  const direction =
    flat === true
      ? 'flat'
      : entry?.delta7d !== null && entry?.delta7d !== undefined
        ? entry.delta7d > 0
          ? 'up'
          : 'down'
        : null;

  finding.status = 'healthy';
  finding.segments.push(
    { value: `${count(value)} active portfolios`, tone: 'neutral' },
    {
      text:
        direction === null
          ? '.'
          : direction === 'flat'
            ? `, flat for ${weeksOfHistory} weeks.`
            : `, trending ${direction} over the last ${weeksOfHistory || 1} week${weeksOfHistory === 1 ? '' : 's'}.`,
    },
  );
  finding.series = series.series;
  finding.value = count(value);
  finding.delta = series.delta;
  finding.deltaTone = series.deltaTone;
  finding.fact = {
    kicker: 'Because · activity',
    value: `${count(value)} active portfolios · ${series.delta}`,
    note: `${count(product.wau)} WAU · ${count(product.mau)} MAU · ${count(product.registeredUsers)} registered`,
  };
  return finding;
}

/** R7 — portfolio freshness ratio this month vs a month ago. */
export function ruleR7(input: StatementInputs): RuleFinding {
  const { product } = input;
  const finding = empty('R7');
  const ratioNow =
    product.portfolioFresh24h !== null && product.portfolioUsers
      ? product.portfolioFresh24h / product.portfolioUsers
      : null;
  const entry = input.metricSeries.get('fresh_24h');
  const observedEntry = input.metricSeries.get('observed_portfolios');
  let ratioPrior: number | null = null;
  if (
    entry &&
    observedEntry &&
    entry.series.length >= 8 &&
    observedEntry.series.length >= 8
  ) {
    const freshPrior = entry.series[entry.series.length - 8] ?? null;
    const observedPrior =
      observedEntry.series[observedEntry.series.length - 8] ?? null;
    ratioPrior =
      freshPrior !== null && observedPrior && observedPrior > 0
        ? freshPrior / observedPrior
        : null;
  }
  const fires = ratioNow !== null && ratioNow < 0.8;

  if (fires) {
    finding.status = 'degraded';
    finding.segments.push(
      { text: 'Portfolio freshness ' },
      {
        value:
          ratioPrior !== null
            ? `${ratioPrior > ratioNow! ? 'fell' : 'rose'} from ${percent(ratioPrior)} to ${percent(ratioNow)}`
            : `is ${percent(ratioNow)}`,
        tone: 'warning',
      },
      { text: " this month, so today's AUM is older than it looks." },
    );
  }
  finding.value = percent(ratioNow);
  finding.delta =
    ratioPrior !== null ? `was ${percent(ratioPrior)}` : 'no prior reading';
  finding.deltaTone = fires ? 'bad' : 'good';
  finding.fact = {
    kicker: 'Because · freshness',
    value: `${count(product.portfolioFresh24h)} of ${count(product.portfolioUsers)} fresh <24h (${percent(ratioNow)})`,
    note:
      ratioPrior !== null
        ? `${percent(ratioPrior)} a month ago`
        : 'no month-ago reading yet',
  };
  return finding;
}

/** R8 — priority accounts inactive 30+ days. */
export function ruleR8(input: StatementInputs): RuleFinding {
  const { customers } = input;
  const finding = empty('R8');
  const n = customers.summary.inactiveButPriority;
  const wasted = customers.users.filter(
    (user) =>
      user.effectiveTier === 'priority' &&
      (user.inactiveDays === null || user.inactiveDays >= 30),
  );
  const cost = sumKnown(wasted.map((user) => user.attributedCostUsd30d));
  if (n > 0) {
    finding.status = 'degraded';
    finding.segments.push(
      { value: `${n} priority ${plural(n, 'account')}`, tone: 'warning' },
      {
        text: ` ${plural(n, 'has', 'have')} not opened the app in 30 days${cost !== null ? ` (${money(cost, 2)}/mo)` : ''}.`,
      },
    );
  }
  finding.value = count(n);
  finding.fact = {
    kicker: 'Because · service',
    value: `${count(n)} priority ${plural(n, 'account')} inactive 30d+`,
    note:
      cost !== null
        ? `${money(cost, 2)}/mo of cost for nobody`
        : 'no attributable cost yet',
  };
  return finding;
}

/** R9 — top-wallet AUM concentration. */
export function ruleR9(input: StatementInputs): RuleFinding {
  const { product } = input;
  const finding = empty('R9');
  const share = product.top1PortfolioShare;
  const fires = share !== null && share > 0.33;
  if (fires) {
    finding.segments.push(
      { text: 'Top wallet holds ' },
      { value: percent(share), tone: 'neutral' },
      { text: ' of AUM — AUM moves with one customer.' },
    );
  }
  finding.value = percent(share);
  finding.fact = {
    kicker: 'Because · concentration',
    value: `Top wallet ${percent(share)}`,
    note: 'AUM is context, not a growth metric',
  };
  return finding;
}

/** R10 — podcast pipeline production/retry state. */
export function ruleR10(input: StatementInputs): RuleFinding {
  const { podcastPipeline, podcastCosts } = input;
  const finding = empty('R10');
  const episodes = podcastPipeline.episodes;
  const inProduction = episodes.filter(
    (episode) => episode.currentPhase !== 'done',
  ).length;
  const stuckOrFailed = episodes.filter((episode) => {
    const jobs = [episode.ingest, episode.visual, ...episode.renders].filter(
      (job): job is NonNullable<typeof job> => Boolean(job),
    );
    return jobs.some(
      (job) =>
        job.status === 'stuck' ||
        job.status === 'stale' ||
        job.status === 'failed',
    );
  });
  const worst = stuckOrFailed[0];
  const worstJob = worst
    ? [worst.ingest, worst.visual, ...worst.renders]
        .filter((job): job is NonNullable<typeof job> => Boolean(job))
        .find(
          (job) =>
            job.status === 'stuck' ||
            job.status === 'stale' ||
            job.status === 'failed',
        )
    : null;
  const worstElapsedMs = worstJob?.updatedAt
    ? input.now.getTime() - Date.parse(worstJob.updatedAt)
    : null;
  const worstElapsed =
    worstElapsedMs !== null && Number.isFinite(worstElapsedMs)
      ? elapsedFromMinutes(worstElapsedMs / 60_000)
      : null;

  const priced = podcastCosts.episodes;
  const avgCost = priced.length
    ? priced.reduce((sum, e) => sum + e.totalCostUsd, 0) / priced.length
    : null;
  const totalRuns = priced.reduce((sum, e) => sum + e.runCount, 0);
  const totalWaste = priced.reduce((sum, e) => sum + e.retryWasteUsd, 0);
  const retryShare =
    totalRuns > 0
      ? totalWaste /
        Math.max(
          priced.reduce((sum, e) => sum + e.totalCostUsd, 0),
          0.0001,
        )
      : null;

  finding.status = stuckOrFailed.length > 0 ? 'degraded' : 'healthy';
  finding.segments.push({ text: `${inProduction} in production` });
  if (worst && worstJob) {
    finding.segments.push(
      { text: '; ' },
      {
        value: `${stuckOrFailed.length} ${plural(stuckOrFailed.length, 'episode')} ${plural(stuckOrFailed.length, 'needs', 'need')} attention`,
        tone: 'warning',
      },
      {
        text: worstJob.stage
          ? ` (stuck at ${worstJob.stage}${worstElapsed ? ` for ${worstElapsed}` : ''}).`
          : '.',
      },
    );
  } else {
    finding.segments.push({ text: '; nothing stuck.' });
  }
  if (avgCost !== null) {
    finding.segments.push(
      { text: ' Average episode ' },
      { value: money(avgCost, 2), tone: 'neutral' },
      {
        text:
          retryShare !== null
            ? `; retries are ${percent(retryShare, 0)} of that.`
            : '.',
      },
    );
  }

  const series = seriesAndDelta(
    input.metricSeries,
    'episodes_in_production',
    () => 'neutral',
  );
  finding.series = series.series;
  finding.value = money(avgCost, 2);
  finding.delta = `${inProduction} in production`;
  finding.deltaTone = stuckOrFailed.length > 0 ? 'bad' : 'good';
  finding.fact = {
    kicker: 'Because · pipeline',
    value: `${inProduction} in production${stuckOrFailed.length ? `, ${stuckOrFailed.length} stuck` : ''}`,
    note:
      avgCost !== null
        ? `avg ${money(avgCost, 2)}/episode`
        : 'no priced episodes yet',
  };
  return finding;
}

/** R11 — overdue publish jobs. */
export function ruleR11(input: StatementInputs): RuleFinding {
  const { operationsSocial } = input;
  const finding = empty('R11');
  const overdue = operationsSocial.jobs.filter(
    (job) => job.overdueMinutes !== null,
  );
  if (overdue.length > 0) {
    finding.status = 'degraded';
    const worst = overdue.reduce((a, b) =>
      (b.overdueMinutes ?? 0) > (a.overdueMinutes ?? 0) ? b : a,
    );
    finding.segments.push(
      {
        value: `${overdue.length} publish ${plural(overdue.length, 'job')}`,
        tone: 'warning',
      },
      {
        text: ` ${elapsedFromMinutes(worst.overdueMinutes) ?? `${worst.overdueMinutes}m`} overdue (${worst.platform}${worst.languageCode ? ` · ${worst.languageCode}` : ''}).`,
      },
    );
  }
  finding.value = count(overdue.length);
  finding.fact = {
    kicker: 'Because · queue',
    value: `${overdue.length} overdue`,
    note: overdue.length
      ? `worst: ${Math.max(...overdue.map((j) => j.overdueMinutes ?? 0))}m`
      : 'queue is current',
  };
  return finding;
}

/** R12 — source staleness vs its own TTL, across the adapters with a known threshold. */
export interface StaleSource {
  label: string;
  ageHours: number;
  ttlHours: number;
}

export function ruleR12(staleSources: readonly StaleSource[]): RuleFinding {
  const finding = empty('R12');
  const stale = staleSources.filter(
    (source) => source.ageHours > source.ttlHours,
  );
  finding.status = stale.length > 0 ? 'degraded' : 'healthy';
  if (stale.length > 0) {
    finding.segments.push({
      text: `Stale read (${elapsedFromMinutes(stale[0]!.ageHours * 60)}) — ${stale[0]!.label} is older than its own refresh window.`,
    });
  }
  finding.value = count(stale.length);
  finding.fact = {
    kicker: 'Because · freshness',
    value: stale.length > 0 ? `${stale.length} stale` : 'All sources current',
    note: stale.map((source) => source.label).join(' · ') || 'within TTL',
  };
  return finding;
}

export function combineSegments(
  ...findings: RuleFinding[]
): RuleFinding['segments'] {
  return findings.flatMap((finding, index) =>
    index === 0 || finding.segments.length === 0
      ? finding.segments
      : [{ text: ' ' } as const, ...finding.segments],
  );
}

export { deltaCaption, numericEvidence, sumKnown, sumSeries };
