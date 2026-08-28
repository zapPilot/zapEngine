#!/usr/bin/env node
import { spawn } from 'node:child_process';

import { createLinePrefixer, parseOpsArgs } from './ops-lib.mjs';

const USAGE = [
  'usage: pnpm ops [--dashboard] [--social] [--status]',
  '',
  '  (no flags)    start the control-center dashboard and the social daemon',
  '  --dashboard   start the control-center dashboard only',
  '  --social      start the social publishing daemon only',
  '  --status      print the operations status snapshot and exit',
].join('\n');

const CHILDREN = {
  dashboard: {
    label: 'dashboard',
    command: 'pnpm',
    // Routed through the root `ops:dashboard` script rather than the workspace
    // dev script: that one goes through turbo with `--env-mode=loose`, which is
    // what lets the Infisical-injected credentials reach the server. Turbo's
    // default strict mode drops them before the child starts, and the dashboard
    // then boots with every data source unauthenticated.
    args: ['run', 'ops:dashboard'],
  },
  social: {
    label: 'social',
    command: 'pnpm',
    // The workspace script, not the root `social:daemon` passthrough: that one
    // re-enters scripts/env/run.mjs and we are already inside it. Never the
    // `:watch` variant either -- a watcher that restarts the daemon mid-publish
    // is how a release cohort gets posted twice.
    args: ['--filter', '@zapengine/podcast-pipeline', 'social:daemon'],
  },
};

const options = parseOpsArgs(process.argv.slice(2));

if (options.unknown.length > 0) {
  console.error(`error: unknown option ${options.unknown.join(', ')}`);
  console.error(USAGE);
  process.exit(2);
}

if (options.help) {
  console.log(USAGE);
  process.exit(0);
}

if (options.status) {
  const status = spawn(
    'pnpm',
    ['--filter', '@zapengine/control-center', 'ops:status'],
    { stdio: 'inherit' },
  );
  status.on('error', (error) => {
    console.error(`error: ${error.message}`);
    process.exit(1);
  });
  status.on('close', (code, signal) => {
    process.exit(signal ? 1 : (code ?? 1));
  });
} else {
  startStack();
}

/**
 * LIFECYCLE INVARIANT: the children are independent. Nothing here restarts,
 * stops or waits on one child because another one ended -- a dashboard that
 * crashes on a taken port must leave the social daemon publishing, and a daemon
 * that exits on a fatal release failure must leave the dashboard up to show
 * why. The only cross-child signal is SIGINT/SIGTERM, which is the operator
 * asking for the whole stack; the launcher then stays alive until every child
 * has exited, and reports non-zero if any of them failed.
 */
function startStack() {
  const selected = Object.keys(CHILDREN)
    .filter((name) => options[name])
    .map((name) => CHILDREN[name]);

  console.log(
    `🛠️  [ops] starting ${selected.map((child) => child.label).join(' + ')} · independent children · Ctrl-C stops all.`,
  );

  const running = new Set();
  let remaining = selected.length;
  let shuttingDown = false;
  let failed = false;

  const finish = () => {
    remaining -= 1;
    if (remaining === 0) process.exit(failed ? 1 : 0);
  };

  for (const child of selected) {
    const spawned = spawn(child.command, child.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    running.add(spawned);

    const out = createLinePrefixer(`[${child.label}] `, (line) =>
      process.stdout.write(line),
    );
    const err = createLinePrefixer(`[${child.label}] `, (line) =>
      process.stderr.write(line),
    );
    spawned.stdout.setEncoding('utf8');
    spawned.stdout.on('data', out);
    spawned.stderr.setEncoding('utf8');
    spawned.stderr.on('data', err);

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      running.delete(spawned);
      out.flush();
      err.flush();
      finish();
    };

    // A spawn failure emits `error` and may never emit `close`, so both paths
    // have to be able to settle this child or the launcher hangs forever.
    spawned.on('error', (error) => {
      failed = true;
      console.error(`[${child.label}] failed to start · ${error.message}`);
      settle();
    });
    spawned.on('close', (code, signal) => {
      // A spawn failure emits both events; it has already been reported.
      if (settled) return;
      if (!shuttingDown && (signal !== null || code !== 0)) {
        failed = true;
        console.error(
          `[${child.label}] exited ${signal ?? code} · other children keep running.`,
        );
      }
      settle();
    });
  }

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      shuttingDown = true;
      for (const child of running) child.kill(signal);
    });
  }
}
