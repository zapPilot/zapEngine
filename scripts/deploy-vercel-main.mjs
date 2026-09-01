import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { ENV_DESTINATIONS } from '../config/env.destinations.mjs';

const VERCEL_TARGETS = ['web', 'landing-page', 'control-center-vercel'];
const GITHUB_REPO_ID = 1211979661;
const POLL_INTERVAL_MS = 5_000;
const DEPLOY_TIMEOUT_MS = 8 * 60 * 1_000;
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
      return { destination, deployment };
    }),
  );

  await Promise.all(
    deployments.map(({ destination, deployment }) =>
      waitForDeployment({
        destination,
        deployment,
        token,
        fetchImpl,
        sleep,
        now,
      }),
    ),
  );
}

async function waitForDeployment(input) {
  const deadline = input.now() + DEPLOY_TIMEOUT_MS;
  let deployment = input.deployment;

  while (true) {
    const state = deployment.readyState;
    if (state === 'READY') {
      if (deployment.aliasError) {
        throw new Error(
          `Vercel deployment ${deployment.id} for ${input.destination.project} ` +
            `is ready but production aliasing failed: ${JSON.stringify(deployment.aliasError)}`,
        );
      }
      console.log(`${input.destination.project}: production deployment READY`);
      return;
    }
    if (FAILURE_STATES.has(state)) {
      throw new Error(
        `Vercel deployment ${deployment.id} for ${input.destination.project} ended ${state}`,
      );
    }
    if (input.now() >= deadline) {
      throw new Error(
        `Timed out waiting for Vercel deployment ${deployment.id} for ${input.destination.project}`,
      );
    }

    await input.sleep(POLL_INTERVAL_MS);
    const endpoint = new URL(
      `https://api.vercel.com/v13/deployments/${encodeURIComponent(deployment.id)}`,
    );
    endpoint.searchParams.set('teamId', input.destination.orgId);
    const response = await input.fetchImpl(endpoint, {
      headers: { Authorization: `Bearer ${input.token}` },
    });
    deployment = await readJsonResponse(response, input.destination.project);
    if (!response.ok) {
      throw new Error(
        `Vercel deployment status failed for ${input.destination.project}: ` +
          `${response.status} ${JSON.stringify(deployment)}`,
      );
    }
  }
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
