import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/u;
// superfly/flyctl-actions installs only `flyctl`; the `fly` alias is a local Homebrew convenience.
const FLY_BIN = 'flyctl';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    input: options.input,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error?.code === 'ENOENT') {
    throw new Error(`not checkable: install ${command}`);
  }
  if (result.status !== 0) {
    const label = options.failure ?? `not checkable: ${command} failed`;
    throw new Error(`${label}\n${describeExit(command, result)}`);
  }
  return result.stdout;
}

// A swallowed exit code cost a whole investigation: `vercel` was rejecting an
// argument, and every destination reported it as "VERCEL_TOKEN cannot list
// Vercel variables", which reads like an expired token. Only stderr is echoed
// — manifest values arrive on these CLIs' stdin and are not registered GitHub
// secrets, so nothing would mask them if a CLI replayed them on stdout.
function describeExit(command, result) {
  const status = result.signal
    ? `${command} was killed by ${result.signal}`
    : `${command} exited ${result.status}`;
  const stderr = (result.stderr ?? '').trim();
  return stderr ? `${status}: ${stderr}` : status;
}

function parseJsonNames(output, label) {
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error(`not checkable: ${label} did not return valid JSON`);
  }
  const names = new Set();
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (
        ['name', 'key', 'secretKey'].includes(key) &&
        typeof child === 'string' &&
        ENV_NAME.test(child)
      ) {
        names.add(child);
      }
      visit(child);
    }
  };
  visit(parsed);
  return names;
}

function sliceJson(output) {
  const start = output.search(/[[{]/u);
  return start === -1 ? output : output.slice(start);
}

function parseNameColumn(output) {
  const names = new Set();
  for (const line of output.split(/\r?\n/)) {
    const match = /^Name\s+(\S+)\s*$/u.exec(line);
    if (match && ENV_NAME.test(match[1])) names.add(match[1]);
  }
  return names;
}

function parseFlySecrets(output, label) {
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error(`not checkable: ${label} did not return valid JSON`);
  }
  const entries = [];
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (
      typeof value.name === 'string' &&
      ENV_NAME.test(value.name) &&
      typeof value.status === 'string'
    ) {
      entries.push({ name: value.name, status: value.status });
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(parsed);
  return entries;
}

function vercelProjectRef(destination) {
  const project = destination.projectId ?? destination.project;
  if (!project)
    throw new Error('not checkable: Vercel project is not configured');
  return project;
}

// `vercel` resolves this through /v9/projects/{idOrName}, so a destination that
// only knows its project name still links. Both variables have to be set: the
// CLI rejects a run that supplies one without the other.
function vercelProjectEnv(destination) {
  return {
    VERCEL_ORG_ID: destination.orgId,
    VERCEL_PROJECT_ID: vercelProjectRef(destination),
  };
}

export function listFlySecrets(destination) {
  if (!process.env.FLY_API_TOKEN) {
    throw new Error('not checkable: set FLY_API_TOKEN');
  }
  return parseFlySecrets(
    run(FLY_BIN, ['secrets', 'list', '--app', destination.app, '--json'], {
      failure: 'not checkable: FLY_API_TOKEN cannot read Fly secrets',
    }),
    `Fly ${destination.app}`,
  );
}

export function listFlyKeys(destination) {
  return new Set(listFlySecrets(destination).map((entry) => entry.name));
}

export function listStagedFlyKeys(destination) {
  return new Set(
    listFlySecrets(destination)
      .filter((entry) => entry.status !== 'Deployed')
      .map((entry) => entry.name),
  );
}

export function listEasKeys(destination) {
  if (!process.env.EXPO_TOKEN) {
    throw new Error('not checkable: set EXPO_TOKEN');
  }
  return parseNameColumn(
    run(
      'pnpm',
      [
        'dlx',
        'eas-cli@20.5.1',
        'env:list',
        '--environment',
        destination.environment,
        '--format',
        'long',
        '--scope',
        'project',
      ],
      {
        cwd: path.join(repoRoot, 'apps', 'app'),
        failure: 'not checkable: EXPO_TOKEN cannot list EAS variables',
      },
    ),
  );
}

export function listVercelKeys(destination) {
  if (!process.env.VERCEL_TOKEN) {
    throw new Error('not checkable: set VERCEL_TOKEN');
  }
  return parseJsonNames(
    sliceJson(
      run(
        'vercel',
        [
          'env',
          'ls',
          destination.environment,
          '--format',
          'json',
          '--token',
          process.env.VERCEL_TOKEN,
          '--no-color',
        ],
        {
          env: vercelProjectEnv(destination),
          failure: `not checkable: VERCEL_TOKEN cannot list Vercel variables for ${destination.project}`,
        },
      ),
    ),
    `Vercel ${destination.project}`,
  );
}

export function listDestinationKeys(destination) {
  if (destination.platform === 'fly') return listFlyKeys(destination);
  if (destination.platform === 'eas') return listEasKeys(destination);
  if (destination.platform === 'vercel') return listVercelKeys(destination);
  throw new Error(
    `not checkable: unsupported platform ${destination.platform}`,
  );
}

// Fly secret writes normally redeploy the app using the config Fly stored at
// the last `fly deploy`; passing `-c` here does not replace that stored config.
// During a code deploy we therefore stage secret writes and let the following
// `fly deploy --config` apply staged secrets, the new image, and this repo's
// fly.toml in one rollout. For standalone env-apply we also stage both
// `secrets import` and `secrets unset` and then run a single
// `secrets deploy`. This collapses two immediate rollouts into one, and — when
// `listStagedFlyKeys` shows nothing `Staged` (same-value updates do not create
// a staged entry) — skips the rollout entirely, which covers the common
// no-change merge. Both `secrets import` (SetSecretsAndDeploy → DeploySecrets
// → MachineDeployment{RestartOnly:true}) and `secrets deploy` share the same
// rollout code and the same 5 m DefaultWaitTimeout (machines.go:39); the
// actual race was `kill_timeout = 300s` vs that 5 m budget — a 302 s
// photo-finish (e.g. 06:21:47 import → 06:26:48 wait timeout → 06:26:49
// machine started; deploy's app launch 06:36:20 → 06:41:22 started). Stored
// `deploy.wait_timeout` is read by DeploySecrets when WaitTimeout is unset
// (machines.go:214-218), so `wait_timeout = 8m` in fly.toml (applied on the
// next `fly deploy`) gives drain headroom. Stopped `render` machines are not
// the cause — the orchestrator leaves a `stopped` machine stopped in ~3 s
// ("Machine was updated and left stopped", machines_deploymachinesapp.go:223).
export function importFlyValues(destination, values, { stage = false } = {}) {
  const input = `${Object.entries(values)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n')}\n`;
  const args = ['secrets', 'import', '--app', destination.app];
  if (stage) args.push('--stage');
  run(FLY_BIN, args, {
    input,
    failure: `Fly sync failed for ${destination.app}`,
  });
}

export function unsetFlyKeys(destination, names, { stage = false } = {}) {
  if (names.length === 0) return;
  const args = ['secrets', 'unset', ...names, '--app', destination.app];
  if (stage) args.push('--stage');
  run(FLY_BIN, args, {
    failure: `Fly prune failed for ${destination.app}`,
  });
}

export function deployStagedFlySecrets(destination) {
  const staged = listStagedFlyKeys(destination);
  if (staged.size === 0) return;
  run(FLY_BIN, ['secrets', 'deploy', '--app', destination.app], {
    failure: `Fly deploy failed for ${destination.app}`,
  });
}

export function setEasValue(destination, name, value, sensitive) {
  run(
    'pnpm',
    [
      'dlx',
      'eas-cli@20.5.1',
      'env:create',
      '--environment',
      destination.environment,
      '--name',
      name,
      '--value',
      value,
      '--type',
      'string',
      '--visibility',
      sensitive ? 'sensitive' : 'plaintext',
      '--scope',
      'project',
      '--force',
      '--non-interactive',
    ],
    {
      cwd: path.join(repoRoot, 'apps', 'app'),
      failure: `EAS sync failed for ${name}`,
    },
  );
}

export function deleteEasKey(destination, name) {
  run(
    'pnpm',
    [
      'dlx',
      'eas-cli@20.5.1',
      'env:delete',
      '--variable-environment',
      destination.environment,
      '--variable-name',
      name,
      '--scope',
      'project',
      '--non-interactive',
    ],
    {
      cwd: path.join(repoRoot, 'apps', 'app'),
      failure: `EAS prune failed for ${name}`,
    },
  );
}

export function setVercelValue(destination, name, value, sensitive) {
  run(
    'vercel',
    [
      'env',
      'add',
      name,
      destination.environment,
      '--force',
      '--yes',
      ...(sensitive ? ['--sensitive'] : []),
      '--token',
      process.env.VERCEL_TOKEN,
      '--no-color',
    ],
    {
      env: vercelProjectEnv(destination),
      input: value,
      failure: `Vercel sync failed for ${name}`,
    },
  );
}

export function deleteVercelKey(destination, name) {
  run(
    'vercel',
    [
      'env',
      'rm',
      name,
      destination.environment,
      '--yes',
      '--token',
      process.env.VERCEL_TOKEN,
      '--no-color',
    ],
    {
      env: vercelProjectEnv(destination),
      failure: `Vercel prune failed for ${name}`,
    },
  );
}
