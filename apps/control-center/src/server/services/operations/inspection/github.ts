import { z } from 'zod';

import type { ControlCenterConfig } from '../../../config/env.js';
import { fetchJson, fetchText } from '../http.js';
import type { ParsedOperationalFingerprint } from './fingerprint.js';
import type { SignalInspection } from './types.js';

const REPO = 'zapPilot/zapEngine';
const API = `https://api.github.com/repos/${REPO}`;
const RUN_LIMIT = 5;
const JOB_LIMIT = 3;
const LOG_LINE_LIMIT = 160;
const LOG_CHAR_LIMIT = 12_000;

const runSchema = z.object({
  id: z.number(),
  status: z.string(),
  conclusion: z.string().nullish(),
  created_at: z.string(),
  run_started_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  html_url: z.string().nullish(),
  head_sha: z.string().nullish(),
  run_attempt: z.number().nullish(),
});

const runsEnvelopeSchema = z.object({ workflow_runs: z.array(z.unknown()) });

const stepSchema = z.object({
  name: z.string(),
  status: z.string().nullish(),
  conclusion: z.string().nullish(),
  number: z.number().nullish(),
  started_at: z.string().nullish(),
  completed_at: z.string().nullish(),
});

const jobSchema = z.object({
  id: z.number(),
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullish(),
  started_at: z.string().nullish(),
  completed_at: z.string().nullish(),
  html_url: z.string().nullish(),
  steps: z.array(z.unknown()).optional(),
});

const jobsEnvelopeSchema = z.object({ jobs: z.array(z.unknown()) });

type WorkflowRun = z.infer<typeof runSchema>;
type WorkflowJob = z.infer<typeof jobSchema>;

export async function inspectGithubSignal(input: {
  config: ControlCenterConfig;
  fingerprint: string;
  parsed: ParsedOperationalFingerprint;
  inspectedAt: Date;
  fetchImpl: typeof fetch;
}): Promise<SignalInspection> {
  if (input.parsed.kind !== 'workflow') {
    return unsupported(input, `GitHub inspection does not support ${input.parsed.kind} signals.`);
  }

  const token = input.config.OPS_GITHUB_TOKEN;
  if (!token) {
    return {
      fingerprint: input.fingerprint,
      source: 'github-actions',
      status: 'unavailable',
      inspectedAt: input.inspectedAt.toISOString(),
      summary: 'GitHub deep inspection is unavailable because OPS_GITHUB_TOKEN is unset.',
      entities: [{ type: 'github-workflow', id: input.parsed.key }],
      evidence: {},
      gaps: [{ source: 'github-actions', reason: 'OPS_GITHUB_TOKEN is unset.' }],
    };
  }

  const workflow = input.parsed.key;
  const envelope = await githubJson({
    token,
    fetchImpl: input.fetchImpl,
    label: `GitHub run inspection for ${workflow}`,
    path: `actions/workflows/${encodeURIComponent(workflow)}/runs?per_page=${RUN_LIMIT}&event=schedule`,
    schema: runsEnvelopeSchema,
  });
  const runs = envelope.workflow_runs
    .flatMap((row) => {
      const parsed = runSchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    })
    .sort((left, right) => startedAt(right).localeCompare(startedAt(left)));

  if (runs.length === 0) {
    return {
      fingerprint: input.fingerprint,
      source: 'github-actions',
      status: 'not-found',
      inspectedAt: input.inspectedAt.toISOString(),
      summary: `No readable scheduled runs were found for ${workflow}.`,
      entities: [{ type: 'github-workflow', id: workflow }],
      evidence: { workflow },
      gaps: [],
    };
  }

  const completed = runs.filter((run) => run.status === 'completed');
  const target = completed.find(isFailedRun) ?? completed[0] ?? runs[0];
  const failedJobs = target ? await inspectRunJobs(target, token, input.fetchImpl) : [];

  return {
    fingerprint: input.fingerprint,
    source: 'github-actions',
    status: 'ok',
    inspectedAt: input.inspectedAt.toISOString(),
    summary: target
      ? `${workflow}: inspected run ${target.id} (${target.conclusion ?? target.status}).`
      : `${workflow}: run history was readable but no run could be selected.`,
    entities: [
      { type: 'github-workflow', id: workflow },
      ...(target
        ? [
            {
              type: 'github-run' as const,
              id: String(target.id),
              url: target.html_url ?? null,
            },
          ]
        : []),
    ],
    evidence: {
      workflow,
      selectedRun: target ? summarizeRun(target) : null,
      recentRuns: runs.map(summarizeRun),
      failedJobs,
    },
    gaps: [],
  };
}

async function inspectRunJobs(
  run: WorkflowRun,
  token: string,
  fetchImpl: typeof fetch,
) {
  const envelope = await githubJson({
    token,
    fetchImpl,
    label: `GitHub jobs inspection for run ${run.id}`,
    path: `actions/runs/${run.id}/jobs?filter=latest&per_page=100`,
    schema: jobsEnvelopeSchema,
  });
  const jobs = envelope.jobs.flatMap((row) => {
    const parsed = jobSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
  const failed = jobs.filter(isFailedJob).slice(0, JOB_LIMIT);

  return Promise.all(
    failed.map(async (job) => {
      let logExcerpt: string | null = null;
      try {
        const log = await githubText({
          token,
          fetchImpl,
          label: `GitHub logs inspection for job ${job.id}`,
          path: `actions/jobs/${job.id}/logs`,
        });
        logExcerpt = extractErrorExcerpt(log);
      } catch (error) {
        logExcerpt = `[log unavailable: ${messageOf(error)}]`;
      }
      return {
        id: job.id,
        name: job.name,
        status: job.status,
        conclusion: job.conclusion ?? null,
        startedAt: job.started_at ?? null,
        completedAt: job.completed_at ?? null,
        url: job.html_url ?? null,
        failedSteps: (job.steps ?? [])
          .flatMap((row) => {
            const parsed = stepSchema.safeParse(row);
            return parsed.success && isFailedConclusion(parsed.data.conclusion)
              ? [
                  {
                    name: parsed.data.name,
                    number: parsed.data.number ?? null,
                    conclusion: parsed.data.conclusion ?? null,
                    startedAt: parsed.data.started_at ?? null,
                    completedAt: parsed.data.completed_at ?? null,
                  },
                ]
              : [];
          })
          .slice(0, 10),
        logExcerpt,
      };
    }),
  );
}

function summarizeRun(run: WorkflowRun) {
  return {
    id: run.id,
    status: run.status,
    conclusion: run.conclusion ?? null,
    startedAt: startedAt(run),
    completedAt: run.updated_at ?? null,
    attempt: run.run_attempt ?? null,
    headSha: run.head_sha ?? null,
    url: run.html_url ?? null,
  };
}

function startedAt(run: WorkflowRun): string {
  return run.run_started_at ?? run.created_at;
}

function isFailedRun(run: WorkflowRun): boolean {
  return isFailedConclusion(run.conclusion);
}

function isFailedJob(job: WorkflowJob): boolean {
  return isFailedConclusion(job.conclusion);
}

function isFailedConclusion(conclusion: string | null | undefined): boolean {
  return Boolean(
    conclusion && !['success', 'neutral', 'skipped'].includes(conclusion),
  );
}

function extractErrorExcerpt(raw: string): string {
  const lines = redact(raw).split(/\r?\n/);
  const hit = /\b(error|failed|failure|fatal|exception|timeout|timed out|not configured|permission denied|forbidden|unauthorized)\b/i;
  const selected = new Set<number>();
  for (let index = 0; index < lines.length && selected.size < LOG_LINE_LIMIT; index += 1) {
    if (!hit.test(lines[index] ?? '')) continue;
    for (
      let context = Math.max(0, index - 3);
      context <= Math.min(lines.length - 1, index + 4) && selected.size < LOG_LINE_LIMIT;
      context += 1
    ) {
      selected.add(context);
    }
  }

  const excerptLines = selected.size
    ? [...selected].sort((a, b) => a - b).map((index) => lines[index] ?? '')
    : lines.slice(Math.max(0, lines.length - 80));
  return excerptLines.join('\n').slice(0, LOG_CHAR_LIMIT);
}

function redact(value: string): string {
  return value
    .replace(/(Authorization:\s*(?:Bearer|token)\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]{16,}/g, '$1[REDACTED]');
}

async function githubJson<T>(input: {
  token: string;
  fetchImpl: typeof fetch;
  label: string;
  path: string;
  schema: z.ZodType<T>;
}): Promise<T> {
  return fetchJson({
    label: input.label,
    url: `${API}/${input.path}`,
    token: input.token,
    schema: input.schema,
    fetchImpl: input.fetchImpl,
    headers: githubHeaders(),
  });
}

async function githubText(input: {
  token: string;
  fetchImpl: typeof fetch;
  label: string;
  path: string;
}): Promise<string> {
  return fetchText({
    label: input.label,
    url: `${API}/${input.path}`,
    token: input.token,
    fetchImpl: input.fetchImpl,
    headers: githubHeaders(),
  });
}

function githubHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'zapengine-control-center',
  };
}

function unsupported(
  input: Parameters<typeof inspectGithubSignal>[0],
  summary: string,
): SignalInspection {
  return {
    fingerprint: input.fingerprint,
    source: 'github-actions',
    status: 'unsupported',
    inspectedAt: input.inspectedAt.toISOString(),
    summary,
    entities: [],
    evidence: {},
    gaps: [],
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
