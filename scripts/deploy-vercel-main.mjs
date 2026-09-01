import { ENV_DESTINATIONS } from '../config/env.destinations.mjs';

const VERCEL_TARGETS = ['web', 'landing-page', 'control-center-vercel'];
const GITHUB_REPO_ID = 1211979661;

const token = process.env.VERCEL_TOKEN;
const sha = process.env.VERCEL_GIT_SHA;

if (!token) throw new Error('VERCEL_TOKEN is required');
if (!sha) throw new Error('VERCEL_GIT_SHA is required');

for (const target of VERCEL_TARGETS) {
  const destination = ENV_DESTINATIONS[target];
  if (!destination || destination.platform !== 'vercel') {
    throw new Error(`${target} is not a configured Vercel destination`);
  }

  const endpoint = new URL('https://api.vercel.com/v13/deployments');
  endpoint.searchParams.set('teamId', destination.orgId);

  const response = await fetch(endpoint, {
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

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Vercel deployment failed for ${destination.project}: ${response.status} ${text}`,
    );
  }

  const deployment = JSON.parse(text);
  console.log(
    `${destination.project}: created ${deployment.id ?? 'deployment'}${deployment.url ? ` (${deployment.url})` : ''}`,
  );
}
