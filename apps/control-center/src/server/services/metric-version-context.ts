import { z } from 'zod';
import type { ControlCenterConfig } from '../config/env.js';
import { fetchJson } from './operations/http.js';

const REPO = 'zapPilot/zapEngine';
const API = `https://api.github.com/repos/${REPO}`;
const sha = z.string().regex(/^[a-f0-9]{40}$/u);
const deploymentSchema = z.object({
  id: z.number().int().positive(),
  sha,
  environment: z.string(),
  production_environment: z.boolean(),
});
const statusSchema = z.object({
  state: z.string(),
  created_at: z.string().datetime({ offset: true }),
});

export interface MetricVersionContext {
  observedAt: string;
  mainSha: string | null;
  deployments: Array<{
    sha: string;
    environment: string;
    deployedAt: string;
    deploymentId: number;
    source: string;
  }>;
  gaps: string[];
}

/** Bounded provider attestations, never an inference that main is deployed. */
export async function readMetricVersionContext(input: {
  config: ControlCenterConfig;
  now: Date;
  fetchImpl?: typeof fetch;
}): Promise<MetricVersionContext> {
  const context: MetricVersionContext = {
    observedAt: input.now.toISOString(),
    mainSha: null,
    deployments: [],
    gaps: [],
  };
  const token = input.config.OPS_GITHUB_TOKEN;
  if (!token) {
    context.gaps.push('GitHub version evidence is unconfigured');
    return context;
  }
  const read = <T>(path: string, schema: z.ZodType<T>) =>
    fetchJson({
      label: 'Metric version context',
      url: `${API}/${path}`,
      token,
      schema,
      fetchImpl: input.fetchImpl ?? globalThis.fetch,
      headers: { Accept: 'application/vnd.github+json' },
    });
  const [main, deployments] = await Promise.allSettled([
    read('commits/main', z.object({ sha })),
    read('deployments?per_page=20', z.array(deploymentSchema)),
  ]);
  if (main.status === 'fulfilled') {
    context.mainSha = main.value.sha;
  } else {
    context.gaps.push('main SHA could not be read');
  }
  if (deployments.status === 'rejected') {
    context.gaps.push('Deployment inventory could not be read');
    return context;
  }
  if (deployments.value.length === 20) {
    context.gaps.push('Deployment inventory capped at 20');
  }
  const candidates = deployments.value.filter((d) => d.production_environment);
  const statuses = await Promise.allSettled(
    candidates.map(async (d) => ({
      deployment: d,
      status: (
        await read(
          `deployments/${d.id}/statuses?per_page=1`,
          z.array(statusSchema),
        )
      )[0],
    })),
  );
  for (const result of statuses) {
    if (result.status === 'rejected') {
      context.gaps.push('A deployment status could not be read');
      continue;
    }
    const { deployment, status } = result.value;
    if (
      status?.state !== 'success' ||
      Date.parse(status.created_at) > input.now.getTime()
    ) {
      continue;
    }
    context.deployments.push({
      sha: deployment.sha,
      environment: deployment.environment,
      deployedAt: status.created_at,
      deploymentId: deployment.id,
      source: `${API}/deployments/${deployment.id}/statuses`,
    });
  }
  context.gaps.push(
    'GitHub production deployment records do not cover runtimes without deployment attestations',
  );
  return context;
}
