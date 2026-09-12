#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const REQUIRED_CHECKS = [
  'quick-gates',
  'code-quality',
  'tests',
  'e2e',
  'security',
  'check-dead-env',
  'coverage',
];
const FORBIDDEN =
  /^(?:\.github\/(?:workflows|actions)\/|\.husky\/|config\/env(?:\/|\.manifest\.mjs$)|supabase\/migrations\/|scripts\/(?:lint\/|agents\/|(?:verify-|ci-).*\.sh$)|\.(?:opencode|agents|claude)\/|(?:\.mcp\.json|opencode\.json|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|turbo\.json)$)/u;
const CONFIG =
  /(?:^|\/)(?:vitest\.config\.[^/]+|pyproject\.toml|\.jscpd\.json|knip\.[^/]+|eslint\.config\.[^/]+|package\.json)$/u;
const THRESHOLD =
  /\b(?:lines|branches|functions|statements|threshold|minTokens|minLines|fail_under|max-warnings|treat-config-hints-as-errors)\b/u;
const nameOf = (label) => (typeof label === 'string' ? label : label.name);
const safePath = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  !value.startsWith('/') &&
  !value.split('/').some((part) => part === '..' || part === '.') &&
  !/[\\\r\n]/u.test(value);

function issueScope(issue) {
  const areas = (issue.labels ?? [])
    .map(nameOf)
    .filter((label) => label.startsWith('area:'))
    .map((label) => label.slice(5));
  const section =
    (issue.body ?? '').match(
      /^#{2,3} Relevant files(?: \/ area)?\s*\n([\s\S]*?)(?=^#{1,3} |$(?![\s\S]))/mu,
    )?.[1] ?? '';
  const paths = section
    .split('\n')
    .map((line) =>
      line
        .trim()
        .replace(/^[-*]\s+(?:\[[ x]\]\s*)?/u, '')
        .replace(/^`([^`]+)`$/u, '$1')
        .replace(/\/\*\*$/u, '/'),
    )
    .filter(safePath);
  const roots = paths.flatMap(
    (path) => path.match(/^(apps|packages)\/[^/]+\//u)?.[0] ?? [],
  );
  for (const area of areas)
    if (/^[a-z0-9-]+$/u.test(area))
      roots.push(`apps/${area}/`, `packages/${area}/`);
  return { areas, paths: [...paths, ...roots] };
}

export function evaluate({ pr, issues, diff, files = pr.files }) {
  const reasons = [];
  const deny = (condition, reason) => {
    if (condition) reasons.push(reason);
  };
  deny(
    pr.baseRefName !== 'main' ||
      pr.isDraft ||
      (pr.state && pr.state !== 'OPEN'),
    'PR must be open, non-draft and target main.',
  );
  deny(
    pr.author?.login !== 'i-xtsu-sixyou-ken-mei',
    'PR author is not the authorized worker account.',
  );
  deny(
    !pr.headRefName?.startsWith('backlog/'),
    'Branch must start with backlog/.',
  );
  deny(
    !/^Agent-Backlog-PR: true\s*$/mu.test(pr.body ?? ''),
    'Missing Agent-Backlog-PR marker.',
  );
  const refs = pr.closingIssuesReferences ?? [];
  deny(
    refs.length === 0 ||
      refs.length !== issues.length ||
      refs.some((ref) => !issues.some((issue) => issue.number === ref.number)),
    'All closing issues must be available.',
  );
  const scopes = issues.map(issueScope);
  for (const issue of issues) {
    const labels = (issue.labels ?? []).map(nameOf);
    deny(
      issue.state !== 'OPEN' ||
        !labels.includes('agent-backlog') ||
        labels.some((label) => ['operator', 'blocked'].includes(label)),
      `Issue #${issue.number} is not an open eligible backlog item.`,
    );
  }
  deny(
    scopes.some((scope) => scope.areas.includes('repo')),
    'area:repo requires human review.',
  );
  const checks = pr.statusCheckRollup ?? [];
  for (const name of REQUIRED_CHECKS) {
    const matching = checks.filter(
      (check) => check.name === name || check.context === name,
    );
    deny(
      matching.length === 0 ||
        matching.some(
          (check) =>
            check.conclusion !== 'SUCCESS' && check.state !== 'SUCCESS',
        ),
      `Required check ${name} must succeed.`,
    );
  }
  deny(
    checks.some(
      (check) =>
        (check.status && check.status !== 'COMPLETED') ||
        (check.conclusion &&
          !['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(check.conclusion)) ||
        (check.state && !['SUCCESS'].includes(check.state)),
    ),
    'A check is pending or unsuccessful.',
  );
  deny(
    pr.mergeable !== 'MERGEABLE' || pr.mergeStateStatus !== 'CLEAN',
    'Mergeability must be MERGEABLE and CLEAN.',
  );
  deny(
    !Array.isArray(files) ||
      files.length === 0 ||
      files.length > 40 ||
      !Number.isFinite(pr.additions) ||
      !Number.isFinite(pr.deletions) ||
      pr.additions + pr.deletions > 1500,
    'Diff must contain 1–40 files and at most 1500 changed lines.',
  );
  for (const file of files ?? []) {
    for (const path of [
      typeof file === 'string' ? file : file.path,
      file.previousFilename,
    ].filter((path) => path !== undefined)) {
      deny(
        !safePath(path) || FORBIDDEN.test(path),
        `Protected or invalid path: ${path}`,
      );
      const allowed = scopes.some(
        (scope) =>
          scope.paths.some(
            (entry) =>
              path === entry ||
              path.startsWith(entry.endsWith('/') ? entry : `${entry}/`),
          ) ||
          (scope.areas.includes('docs') &&
            (path.startsWith('docs/') || path.endsWith('.md'))) ||
          (scope.areas.includes('knip') &&
            (path.startsWith('packages/knip-config/') ||
              /(?:^|\/)knip\.(?:json|ts)$/u.test(path))),
      );
      deny(!allowed, `Outside issue scope: ${path}`);
    }
  }
  let current = '';
  for (const line of (diff ?? '').split('\n')) {
    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      const raw = line.slice(4);
      if (raw !== '/dev/null') {
        deny(
          !/^[ab]\//u.test(raw),
          'Quoted or unreadable diff paths require human review.',
        );
        current = raw.slice(2);
        deny(
          !safePath(current) || FORBIDDEN.test(current),
          `Protected diff path: ${current}`,
        );
      }
    }
    deny(
      CONFIG.test(current) &&
        line.startsWith('-') &&
        !line.startsWith('---') &&
        THRESHOLD.test(line),
      `Threshold removal requires human review: ${current}`,
    );
  }
  return {
    pr: pr.number,
    headSha: pr.headRefOid,
    decision: reasons.length ? 'deny' : 'allow',
    reasons: [...new Set(reasons)],
  };
}

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const number = process.argv[2];
    if (!/^\d+$/u.test(number ?? ''))
      throw new Error('Usage: backlog-pr-merge-check.mjs <pr-number>');
    const pr = JSON.parse(
      gh([
        'pr',
        'view',
        number,
        '--repo',
        'zapPilot/zapEngine',
        '--json',
        'number,state,title,body,author,baseRefName,headRefName,headRefOid,isDraft,mergeable,mergeStateStatus,statusCheckRollup,files,additions,deletions,closingIssuesReferences',
      ]),
    );
    const issues = pr.closingIssuesReferences.map((issue) =>
      JSON.parse(
        gh([
          'issue',
          'view',
          String(issue.number),
          '--repo',
          'zapPilot/zapEngine',
          '--json',
          'number,state,labels,body',
        ]),
      ),
    );
    const diff = gh(['pr', 'diff', number, '--repo', 'zapPilot/zapEngine']);
    const result = evaluate({ pr, issues, diff });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.decision === 'allow' ? 0 : 1;
  } catch (error) {
    console.log(JSON.stringify({ decision: 'deny', reasons: [error.message] }));
    process.exitCode = 2;
  }
}
