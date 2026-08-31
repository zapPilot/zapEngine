#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DEPOT_FAILURE =
  /failed to fetch an image or build from source:[\s\S]*(?:failed to list workers|timed out connecting to machine|transport: authentication handshake failed: EOF|deadline_exceeded: context deadline exceeded)/u;

export function isDepotInfrastructureFailure(output) {
  // Only inspect the tail so an earlier transient Depot retry cannot cause us to
  // misclassify a later Docker/app deployment failure as builder infrastructure.
  return DEPOT_FAILURE.test(output.slice(-8_000));
}

export function buildFlyDeployArgs({
  config,
  captureRelease = false,
  commitSha,
  buildTime,
  depot = true,
}) {
  const args = ['deploy', '.', '--remote-only', '--config', config];
  if (!depot) args.push('--depot=false');
  if (captureRelease) {
    args.push(
      '--build-arg',
      `COMMIT_SHA=${commitSha}`,
      '--build-arg',
      `BUILD_TIME=${buildTime}`,
    );
  }
  return args;
}

function runFlyctl(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('flyctl', args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(chunk);
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolve({ code: code ?? 1, output, signal });
    });
  });
}

export async function deployFly({
  config,
  captureRelease = false,
  commitSha,
  buildTime,
}) {
  const primaryArgs = buildFlyDeployArgs({
    config,
    captureRelease,
    commitSha,
    buildTime,
  });
  let result = await runFlyctl(primaryArgs);
  if (result.code === 0) return 0;

  if (!isDepotInfrastructureFailure(result.output)) return result.code;

  console.error(
    '::warning::Fly Depot builder infrastructure failed; retrying once with --depot=false',
  );
  result = await runFlyctl(
    buildFlyDeployArgs({
      config,
      captureRelease,
      commitSha,
      buildTime,
      depot: false,
    }),
  );
  return result.code;
}

async function main() {
  const config = process.env.FLY_CONFIG;
  const captureRelease = process.env.CAPTURE_RELEASE === 'true';
  const commitSha = process.env.COMMIT_SHA;
  const buildTime = process.env.BUILD_TIME;

  if (!config) throw new Error('FLY_CONFIG is required');
  if (captureRelease && (!commitSha || !buildTime)) {
    throw new Error(
      'COMMIT_SHA and BUILD_TIME are required when CAPTURE_RELEASE=true',
    );
  }

  process.exitCode = await deployFly({
    config,
    captureRelease,
    commitSha,
    buildTime,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
