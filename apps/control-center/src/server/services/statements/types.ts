import type {
  StatementFact,
  StatementSegment,
} from '../../../shared/statements.js';
import type {
  CostHistoryResponse,
  CustomerEconomicsResponse,
  OperationsResponse,
  OperationsSocialResponse,
  OverviewResponse,
  PodcastCostResponse,
  ProductHealthResponse,
  SocialGrowthResponse,
  SocialPerformanceResponse,
} from '../../../shared/types.js';
import type { PodcastPipelineResponse } from '../../../shared/podcast-pipeline.js';
import type { MetricSeries } from '../metric-snapshots.js';

export type RuleTone = 'good' | 'bad' | 'neutral';

/**
 * One rule's deterministic output. `segments` is the sentence (or sentence
 * fragment, for a rule meant to be concatenated after another); `fact` is the
 * single "Because ·" column a StatementHeader shows for this rule, absent for
 * rules that only ever contribute to a sentence. `series`/`value`/`delta`
 * describe the one number a Statement row's sparkline plots — empty/null
 * until `ops.metric_snapshots` has rows for it, never a fabricated trend.
 */
export interface RuleFinding {
  id: string;
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  segments: StatementSegment[];
  fact: StatementFact | null;
  series: number[];
  value: string | null;
  delta: string | null;
  deltaTone: RuleTone;
}

/** Every already-fetched response a rule might read, gathered once per request. */
export interface StatementInputs {
  now: Date;
  operations: OperationsResponse;
  overview: OverviewResponse;
  costHistory: CostHistoryResponse;
  product: ProductHealthResponse;
  socialGrowth: SocialGrowthResponse;
  socialPerformance: SocialPerformanceResponse;
  customers: CustomerEconomicsResponse;
  operationsSocial: OperationsSocialResponse;
  podcastPipeline: PodcastPipelineResponse;
  podcastCosts: PodcastCostResponse;
  /** Keyed by the `ops.metric_snapshots` metric_key; always present, possibly empty. */
  metricSeries: Map<string, MetricSeries>;
}
