import type {
  OperationalPriority,
  OperationsDomainSummary,
  OperationsResponse,
} from '../shared/types.js';
import type { Statement, StatementSegment } from '../shared/statements.js';
import { readControlCenterConfig } from './config/env.js';
import { createStatementsService } from './services/statements/index.js';
import { createOperationsService } from './services/operations/aggregate.js';
import { createOverviewService } from './services/overview.js';
import { createPodcastCostService } from './services/podcast-costs.js';
import { createPodcastPipelineService } from './services/podcast-pipeline.js';
import { createSocialGrowthService } from './services/social-growth.js';

/**
 * The same read model the dashboard renders, without the dashboard.
 *
 * An agent asked "is anything broken" should not have to start a server and
 * scrape HTML, and an operator on a laptop should not have to either. `--json`
 * is the machine surface; the default is the human one. The exit code is the
 * third surface: non-zero when something is critical, so this composes into a
 * shell pipeline without anyone parsing prose.
 */
const json = process.argv.includes('--json');
const force = process.argv.includes('--force');
const config = readControlCenterConfig();
const operationsService = createOperationsService({ config });
const statementsService = createStatementsService({
  config,
  service: createOverviewService({ config }),
  operations: operationsService,
  socialGrowth: createSocialGrowthService({ config }),
  podcastPipeline: createPodcastPipelineService({ config }),
  podcastCosts: createPodcastCostService({ config }),
});

const [snapshot, statements] = await Promise.all([
  operationsService.getOperations(force),
  statementsService.getStatements(force),
]);

process.stdout.write(
  json
    ? `${JSON.stringify({ ...snapshot, statements: statements.statements }, null, 2)}\n`
    : `${render(snapshot)}${renderStatements(statements.statements)}`,
);

if (snapshot.status === 'critical') {
  process.exitCode = 1;
}

function render(response: OperationsResponse): string {
  const lines = [
    '',
    `${mark(response.status)} OVERALL ${response.status.toUpperCase()}  ·  ${response.generatedAt}`,
    '',
    ...response.domains.map(domainLine),
    '',
  ];

  if (response.priorities.length === 0) {
    lines.push('Nothing above the action threshold.', '');
    return lines.join('\n');
  }

  lines.push('Do this first:', '');
  lines.push(...response.priorities.map(priorityLines).flat());
  lines.push('');
  return lines.join('\n');
}

/**
 * The exact sentences Home renders, in the exact order Home sorts them —
 * this and the dashboard read the same `statements` module, so an operator
 * on a laptop and a founder looking at the page never see different prose.
 */
function renderStatements(statements: readonly Statement[]): string {
  const lines = ['Statements:', ''];
  for (const statement of statements) {
    lines.push(
      `  ${mark(statement.status)} [${statement.domain}] ${renderSentence(statement.sentence)}`,
    );
    lines.push(
      `       ${statement.value}  ${statement.delta}  ·  ${statement.kicker}`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function renderSentence(segments: readonly StatementSegment[]): string {
  return segments
    .map((segment) => ('text' in segment ? segment.text : segment.value))
    .join('');
}

function domainLine(domain: OperationsDomainSummary): string {
  return `  ${mark(domain.status)} ${domain.domain.padEnd(10)} ${domain.status.padEnd(9)} ${domain.signalCount} signal(s)`;
}

function priorityLines(priority: OperationalPriority): string[] {
  const { signal } = priority;
  const lines = [
    `  ${String(priority.score).padStart(3)}  ${mark(signal.status)} ${signal.title}`,
    `       ${signal.fingerprint}  ·  ${priority.reasons.join(' · ')}`,
  ];
  if (signal.detail) {
    lines.push(`       ${signal.detail}`);
  }
  if (signal.url) {
    lines.push(`       ${signal.url}`);
  }
  return lines;
}

function mark(status: OperationsResponse['status']): string {
  if (status === 'critical') {
    return '✖';
  }
  if (status === 'degraded') {
    return '▲';
  }
  return status === 'healthy' ? '●' : '○';
}
