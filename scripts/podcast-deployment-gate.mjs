#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const APP = 'from-fed-to-chain-api';
const SCHEMA = process.env.SUPABASE_DB_SCHEMA?.trim() || 'from_fed_to_chain';
const DEFAULT_DRAIN_TIMEOUT_MS = 100 * 60 * 1000;
const POLL_MS = 10_000;
const STABLE_POLLS = 2;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function rpc(name, body) {
  const url = required('SUPABASE_URL').replace(/\/$/, '');
  const key = required('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'content-profile': SCHEMA,
      'accept-profile': SCHEMA,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${name} failed (${response.status}): ${text.slice(0, 1000)}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? code}): ${stderr.slice(-2000)}`));
    });
  });
}

async function renderMachines() {
  const { stdout } = await run(
    'flyctl',
    ['machine', 'list', '--app', APP, '--json'],
    { capture: true },
  );
  const parsed = JSON.parse(stdout);
  if (!Array.isArray(parsed)) throw new Error('flyctl machine list did not return an array');
  return parsed.filter((machine) => {
    const group =
      machine.process_group ??
      machine.config?.metadata?.fly_process_group ??
      machine.config?.metadata?.['fly_process_group'];
    return group === 'render';
  });
}

function machineState(machine) {
  return String(machine.state ?? machine.instance_id?.state ?? '').toLowerCase();
}

async function fleetConverged() {
  const { stdout } = await run(
    'flyctl',
    ['machine', 'list', '--app', APP, '--json'],
    { capture: true },
  );
  const machines = JSON.parse(stdout);
  if (!Array.isArray(machines) || machines.length === 0) {
    return { ok: false, detail: 'Fly returned no Machines' };
  }
  const relevant = machines.filter((machine) => {
    const group = machine.process_group ?? machine.config?.metadata?.fly_process_group;
    return group === 'app' || group === 'render';
  });
  const images = new Set(
    relevant
      .map((machine) => machine.image_ref ?? machine.config?.image)
      .filter(Boolean),
  );
  const appStarted = relevant.some((machine) => {
    const group = machine.process_group ?? machine.config?.metadata?.fly_process_group;
    return group === 'app' && machineState(machine) === 'started';
  });
  return {
    ok: relevant.length > 0 && images.size === 1 && appStarted,
    detail: `${relevant.length} app/render Machines, ${images.size} image refs, appStarted=${appStarted}`,
  };
}

function parseArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function idsFromArgs() {
  return {
    deploymentId: parseArg('--deployment-id'),
    ownerToken: parseArg('--owner-token'),
  };
}

async function prepare() {
  const deploymentId = parseArg('--deployment-id') ?? randomUUID();
  const ownerToken = parseArg('--owner-token') ?? randomUUID();
  const release = parseArg('--release') ?? required('GITHUB_SHA');
  const timeoutMs = Number(parseArg('--timeout-ms', DEFAULT_DRAIN_TIMEOUT_MS));
  const started = Date.now();

  await rpc('podcast_deployment_acquire', {
    p_deployment_id: deploymentId,
    p_owner_token: ownerToken,
    p_target_release: release,
  });
  console.log(`[podcast-deploy] gate acquired deployment=${deploymentId} release=${release}`);

  let stable = 0;
  try {
    while (Date.now() - started < timeoutMs) {
      await rpc('podcast_deployment_heartbeat', {
        p_deployment_id: deploymentId,
        p_owner_token: ownerToken,
      });
      const rows = await rpc('podcast_deployment_drain_status', {
        p_deployment_id: deploymentId,
        p_owner_token: ownerToken,
      });
      const status = Array.isArray(rows) ? rows[0] : rows;
      const active =
        Number(status?.active_video_jobs ?? 0) +
        Number(status?.active_visual_jobs ?? 0);
      const renders = await renderMachines();
      const startedRenders = renders.filter((machine) => machineState(machine) === 'started').length;

      if (active === 0 && startedRenders === 0) stable += 1;
      else stable = 0;

      console.log(
        `[podcast-deploy] draining active=${active} renderStarted=${startedRenders} stable=${stable}/${STABLE_POLLS}`,
      );
      if (stable >= STABLE_POLLS) {
        console.log(`deployment_id=${deploymentId}`);
        console.log(`owner_token=${ownerToken}`);
        return;
      }
      await sleep(POLL_MS);
    }
    throw new Error(`podcast drain exceeded ${Math.round(timeoutMs / 60000)} minutes`);
  } catch (error) {
    await rpc('podcast_deployment_fail', {
      p_deployment_id: deploymentId,
      p_owner_token: ownerToken,
      p_reason: error instanceof Error ? error.message : String(error),
    }).catch(() => {});
    throw error;
  }
}

async function markRollout() {
  const { deploymentId, ownerToken } = idsFromArgs();
  if (!deploymentId || !ownerToken) throw new Error('--deployment-id and --owner-token are required');
  await rpc('podcast_deployment_mark_rollout', {
    p_deployment_id: deploymentId,
    p_owner_token: ownerToken,
  });
  console.log(`[podcast-deploy] rollout authorized deployment=${deploymentId}`);
}

async function complete() {
  const { deploymentId, ownerToken } = idsFromArgs();
  if (!deploymentId || !ownerToken) throw new Error('--deployment-id and --owner-token are required');
  const fleet = await fleetConverged();
  if (!fleet.ok) throw new Error(`refusing to reopen claims: fleet not converged (${fleet.detail})`);
  await rpc('podcast_deployment_complete', {
    p_deployment_id: deploymentId,
    p_owner_token: ownerToken,
  });
  console.log(`[podcast-deploy] claims reopened deployment=${deploymentId}; ${fleet.detail}`);
}

async function fail() {
  const { deploymentId, ownerToken } = idsFromArgs();
  if (!deploymentId || !ownerToken) throw new Error('--deployment-id and --owner-token are required');
  const reason = parseArg('--reason', 'workflow failed or was cancelled');
  const phase = await rpc('podcast_deployment_fail', {
    p_deployment_id: deploymentId,
    p_owner_token: ownerToken,
    p_reason: reason,
  });
  console.log(`[podcast-deploy] failure fenced deployment=${deploymentId} phase=${String(phase)}`);
}

async function recover() {
  const deploymentId = parseArg('--deployment-id');
  const release = parseArg('--release');
  if (!deploymentId || !release) throw new Error('--deployment-id and --release are required');
  const fleet = await fleetConverged();
  if (!fleet.ok) throw new Error(`recovery blocked: fleet not converged (${fleet.detail})`);
  await rpc('podcast_deployment_recover', {
    p_deployment_id: deploymentId,
    p_target_release: release,
  });
  console.log(`[podcast-deploy] recovery reopened claims deployment=${deploymentId}; ${fleet.detail}`);
}

const command = process.argv[2];
const actions = { prepare, 'mark-rollout': markRollout, complete, fail, recover };
if (!actions[command]) {
  console.error('usage: podcast-deployment-gate.mjs <prepare|mark-rollout|complete|fail|recover> [options]');
  process.exit(2);
}

actions[command]().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
