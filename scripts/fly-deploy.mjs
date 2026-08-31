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
}) {
  const args = ['deploy', '.', '--remote-only', '--config', config];
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
    const append = (chunk) => {
      const text = chunk.toString();
      // Keep only the tail that the Depot classifier inspects plus a small
      // margin; the full build log can be many megabytes.
      output = (output + text).slice(-16_000);
      return text;
    };

    child.stdout.on('data', (chunk) => {
      process.stdout.write(append(chunk));
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(append(chunk));
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolve({ code: code ?? 1, output, signal });
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function deployFly({
  config,
  captureRelease = false,
  commitSha,
  buildTime,
  sleepMs = 60_000,
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
    `::warning::Fly Depot builder infrastructure failed; retrying once after ${Math.round(sleepMs / 1000)}s on the same Depot builder`,
  );
  await sleep(sleepMs);
  result = await runFlyctl(primaryArgs);
  return result.code;
}

async function main() {
  const argv = process.argv.slice(2);
  const configIndex = argv.indexOf('--config');
  const config = configIndex >= 0 ? argv[configIndex + 1] : undefined;
  const commitShaIndex = argv.indexOf('--commit-sha');
  const commitSha = commitShaIndex >= 0 ? argv[commitShaIndex + 1] : undefined;
  const buildTimeIndex = argv.indexOf('--build-time');
  const buildTime = buildTimeIndex >= 0 ? argv[buildTimeIndex + 1] : undefined;

  if (!config) throw new Error('--config <path> is required');
  if (Boolean(commitSha) !== Boolean(buildTime)) {
    throw new Error('--commit-sha and --build-time must be passed together');
  }

  process.exitCode = await deployFly({
    config,
    captureRelease: Boolean(commitSha && buildTime),
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
