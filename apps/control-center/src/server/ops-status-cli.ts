import type {
  OperationalPriority,
  OperationsDomainSummary,
  OperationsResponse,
} from '../shared/types.js';
import { readControlCenterConfig } from './config/env.js';
import { createOperationsService } from './services/operations/aggregate.js';

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
const snapshot = await createOperationsService({
  config: readControlCenterConfig(),
}).getOperations(process.argv.includes('--force'));

process.stdout.write(
  json ? `${JSON.stringify(snapshot, null, 2)}\n` : render(snapshot),
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
