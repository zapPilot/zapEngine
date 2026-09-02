import {
  STATEMENT_DOMAINS,
  type Statement,
  type StatementDomain,
  type StatementHeaderData,
  type StatementsResponse,
} from '../../../shared/statements.js';
import type {
  OperationalStatus,
  OperationsDomain,
} from '../../../shared/types.js';
import {
  combineSegments,
  ruleR1,
  ruleR10,
  ruleR2,
  ruleR3,
  ruleR4,
  ruleR5,
  ruleR6,
  ruleR7,
  ruleR8,
} from './rules.js';
import type { RuleFinding, StatementInputs } from './types.js';

const STATUS_SCORE: Record<OperationalStatus, number> = {
  critical: 100,
  degraded: 60,
  unknown: 30,
  healthy: 10,
};

/** Which of the eight `OperationsDomain`s each narrative domain draws its
 * priority score from — a Statement's rank must never disagree with the
 * queue the rest of the page already shows. */
const RELATED_OPERATIONS_DOMAINS: Record<StatementDomain, OperationsDomain[]> =
  {
    reliability: ['infra', 'errors', 'jobs', 'analytics'],
    product: ['product', 'customers'],
    pipeline: ['jobs'],
    spend: ['costs'],
    growth: ['social'],
  };

const SOURCE_LABEL: Record<StatementDomain, string> = {
  reliability: 'operations',
  product: 'product-health',
  pipeline: 'podcast-pipeline',
  spend: 'cost ledger',
  growth: 'social telemetry',
};

const EVIDENCE_REF: Record<StatementDomain, string> = {
  reliability: 'reliability-signals',
  product: 'product-freshness',
  pipeline: 'pipeline-episodes',
  spend: 'spend-providers',
  growth: 'growth-audience',
};

function score(
  input: StatementInputs,
  domain: StatementDomain,
  finding: RuleFinding,
): number {
  const related = RELATED_OPERATIONS_DOMAINS[domain];
  const relatedScores = input.operations.priorities
    .filter((priority) => related.includes(priority.signal.domain))
    .map((priority) => priority.score);
  return STATUS_SCORE[finding.status] + Math.max(0, ...relatedScores);
}

function elapsedSince(iso: string | undefined, now: Date): string {
  if (!iso) {
    return 'unknown';
  }
  const ms = now.getTime() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) {
    return 'unknown';
  }
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  return `${hours} h ago`;
}

function toStatement(
  input: StatementInputs,
  domain: StatementDomain,
  finding: RuleFinding,
  generatedAt: string | undefined,
  url: string | null = null,
): Statement {
  return {
    domain,
    status: finding.status,
    score: score(input, domain, finding),
    sentence: finding.segments,
    kicker: `${domain[0]!.toUpperCase()}${domain.slice(1)} · ${SOURCE_LABEL[domain]} · seen ${elapsedSince(generatedAt, input.now)}`,
    series: finding.series,
    value: finding.value ?? '—',
    delta: finding.delta ?? '—',
    deltaTone:
      finding.deltaTone === 'good'
        ? 'good'
        : finding.deltaTone === 'bad'
          ? 'bad'
          : 'neutral',
    evidenceRef: EVIDENCE_REF[domain],
    url,
  };
}

function toHeader(
  domain: StatementDomain,
  findings: RuleFinding[],
): StatementHeaderData {
  const worst = findings.reduce((current, next) =>
    STATUS_SCORE[next.status] > STATUS_SCORE[current.status] ? next : current,
  );
  return {
    domain,
    status: worst.status,
    sentence: combineSegments(...findings.filter((f) => f.segments.length > 0)),
    facts: findings.flatMap((f) => (f.fact ? [f.fact] : [])),
  };
}

export function buildStatements(input: StatementInputs): StatementsResponse {
  const r1 = ruleR1(input);
  const r2 = ruleR2(input);
  const r3 = ruleR3(input);
  const r4 = ruleR4(input);
  const r5 = ruleR5(input);
  const r6 = ruleR6(input);
  const r7 = ruleR7(input);
  const r8 = ruleR8(input);
  const r10 = ruleR10(input);

  const topReliabilitySignal =
    input.operations.priorities.find((p) => p.signal.status === 'critical')
      ?.signal ??
    input.operations.priorities[0]?.signal ??
    null;

  const statements: Statement[] = [
    toStatement(
      input,
      'reliability',
      r1,
      input.operations.generatedAt,
      topReliabilitySignal?.url ?? null,
    ),
    toStatement(
      input,
      'product',
      { ...r6, segments: combineSegments(r6, r7) },
      input.overview.generatedAt,
    ),
    toStatement(input, 'pipeline', r10, input.podcastPipeline.generatedAt),
    toStatement(input, 'spend', r2, input.overview.generatedAt),
    toStatement(
      input,
      'growth',
      { ...r4, segments: combineSegments(r4, r5) },
      input.socialGrowth.generatedAt,
    ),
  ].sort((a, b) => b.score - a.score);

  const headers: StatementHeaderData[] = [
    toHeader('reliability', [r1]),
    toHeader('product', [r6, r7, r8]),
    toHeader('pipeline', [r10]),
    toHeader('spend', [r2, r3]),
    toHeader('growth', [r4, r5]),
  ];
  // `headers` is exhaustive over STATEMENT_DOMAINS by construction; assert it
  // here so a future domain added to one list is caught if forgotten in the other.
  const missing = STATEMENT_DOMAINS.filter(
    (domain) => !headers.some((header) => header.domain === domain),
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing StatementHeader for domain(s): ${missing.join(', ')}`,
    );
  }

  return {
    generatedAt: input.now.toISOString(),
    statements,
    headers,
  };
}
