import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { ENV_DESTINATIONS } from '../config/env.destinations.mjs';

const VERCEL_TARGETS = ['web', 'landing-page', 'control-center-vercel'];
const GITHUB_REPO_ID = 1211979661;
const POLL_INTERVAL_MS = 5_000;
const MINUTE_MS = 60 * 1_000;
// The Vercel team builds one deployment at a time, so the three production
// deployments queue behind each other (and behind any builds left over from an
// earlier run). Time spent QUEUED says nothing about build health, so the build
// limit only starts once Vercel picks the deployment up; the overall limit
// still bounds a queue that never drains.
const BUILD_TIMEOUT_MS = 15 * MINUTE_MS;
export const OVERALL_TIMEOUT_MS = 25 * MINUTE_MS;
const FAILURE_STATES = new Set(['ERROR', 'CANCELED']);

export async function deployVercelMain(input = {}) {
  const token = input.token ?? process.env.VERCEL_TOKEN;
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const sleep =
    input.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = input.now ?? (() => Date.now());
  const sha =
    input.sha ??
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

  if (!token) throw new Error('VERCEL_TOKEN is required');

  const deployments = await Promise.all(
    VERCEL_TARGETS.map(async (target) => {
      const destination = ENV_DESTINATIONS[target];
      if (!destination || destination.platform !== 'vercel') {
        throw new Error(`${target} is not a configured Vercel destination`);
      }

      const endpoint = new URL('https://api.vercel.com/v13/deployments');
      endpoint.searchParams.set('teamId', destination.orgId);
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: destination.project,
          project: destination.projectId ?? destination.project,
          target: 'production',
          gitSource: {
            type: 'github',
            repoId: GITHUB_REPO_ID,
            ref: 'main',
            sha,
          },
        }),
      });

      const deployment = await readJsonResponse(response, destination.project);
      if (!response.ok) {
        throw new Error(
          `Vercel deployment failed for ${destination.project}: ${response.status} ${JSON.stringify(deployment)}`,
        );
      }
      if (typeof deployment.id !== 'string' || deployment.id.length === 0) {
        throw new Error(
          `Vercel deployment for ${destination.project} returned no deployment id`,
        );
      }

      console.log(
        `${destination.project}: created ${deployment.id}${deployment.url ? ` (${deployment.url})` : ''}`,
      );
      return { destination, deployment, createdAt: now() };
    }),
  );

  await Promise.all(
    deployments.map(({ destination, deployment, createdAt }) =>
      waitForDeployment({
        destination,
        deployment,
        createdAt,
        token,
        fetchImpl,
        sleep,
        now,
      }),
    ),
  );
}

async function waitForDeployment(input) {
  const project = input.destination.project;
  const timing = {
    createdAt: input.createdAt,
    buildStartedAt: null,
    observedAt: input.createdAt,
  };
  let deployment = input.deployment;
  let lastState;
  let inspectorUrl;

  const observe = (next) => {
    deployment = next;
    timing.observedAt = input.now();
    inspectorUrl = deployment.inspectorUrl || inspectorUrl;
    if (timing.buildStartedAt === null && deployment.readyState !== 'QUEUED') {
      timing.buildStartedAt = timing.observedAt;
    }
    const settled = settleDeployment(deployment, project, inspectorUrl);
    if (settled) {
      console.log(
        `${project}: production deployment READY (${formatTiming(timing)})`,
      );
    } else if (deployment.readyState !== lastState) {
      console.log(
        `${project}: ${deployment.readyState} (${formatTiming(timing)})`,
      );
    }
    lastState = deployment.readyState;
    return settled;
  };

  if (observe(deployment)) return;
  while (true) {
    await input.sleep(POLL_INTERVAL_MS);
    // Deciding before the read means a timeout is only ever reported from a
    // state read after the deadline, so a build that finished during the last
    // sleep still counts as READY.
    const deadlinePassed = input.now() >= deadlineFor(timing);
    if (observe(await fetchDeploymentStatus(input, deployment.id))) return;
    if (deadlinePassed) break;
  }

  const limit =
    deadlineFor(timing) === timing.createdAt + OVERALL_TIMEOUT_MS
      ? `${OVERALL_TIMEOUT_MS / MINUTE_MS}-minute overall limit`
      : `${BUILD_TIMEOUT_MS / MINUTE_MS}-minute build limit`;
  throw new Error(
    `Timed out waiting for Vercel deployment ${deployment.id} for ${project}: ` +
      `still ${deployment.readyState} after ${formatTiming(timing)} ` +
      `(exceeded the ${limit})${formatInspector(inspectorUrl)}`,
  );
}

function deadlineFor(timing) {
  const overallDeadline = timing.createdAt + OVERALL_TIMEOUT_MS;
  if (timing.buildStartedAt === null) return overallDeadline;
  return Math.min(overallDeadline, timing.buildStartedAt + BUILD_TIMEOUT_MS);
}

function settleDeployment(deployment, project, inspectorUrl) {
  const state = deployment.readyState;
  if (state === 'READY') {
    if (deployment.aliasError) {
      throw new Error(
        `Vercel deployment ${deployment.id} for ${project} ` +
          `is ready but production aliasing failed: ${JSON.stringify(deployment.aliasError)}` +
          formatInspector(inspectorUrl),
      );
    }
    return true;
  }
  if (FAILURE_STATES.has(state)) {
    throw new Error(
      `Vercel deployment ${deployment.id} for ${project} ended ${state}` +
        formatInspector(inspectorUrl),
    );
  }
  return false;
}

function formatTiming(timing) {
  const queuedUntil = timing.buildStartedAt ?? timing.observedAt;
  const building =
    timing.buildStartedAt === null
      ? 0
      : timing.observedAt - timing.buildStartedAt;
  return (
    `${formatMinutes(queuedUntil - timing.createdAt)} min queued, ` +
    `${formatMinutes(building)} min building`
  );
}

function formatMinutes(ms) {
  return (ms / MINUTE_MS).toFixed(1);
}

function formatInspector(inspectorUrl) {
  return inspectorUrl ? `; inspect ${inspectorUrl}` : '';
}

async function fetchDeploymentStatus(input, deploymentId) {
  const endpoint = new URL(
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId)}`,
  );
  endpoint.searchParams.set('teamId', input.destination.orgId);
  const response = await input.fetchImpl(endpoint, {
    headers: { Authorization: `Bearer ${input.token}` },
  });
  const deployment = await readJsonResponse(
    response,
    input.destination.project,
  );
  if (!response.ok) {
    throw new Error(
      `Vercel deployment status failed for ${input.destination.project}: ` +
        `${response.status} ${JSON.stringify(deployment)}`,
    );
  }
  return deployment;
}

async function readJsonResponse(response, project) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Vercel returned non-JSON for ${project}: ${response.status} ${text}`,
    );
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;
if (invokedPath === import.meta.url) {
  await deployVercelMain();
}
