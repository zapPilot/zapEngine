#!/usr/bin/env node
import { spawn } from 'node:child_process';

import {
  createLinePrefixer,
  parseOpsArgs,
  PODCAST_PIPELINE_PREREQUISITE,
} from './ops-lib.mjs';

const USAGE = [
  'usage: pnpm ops [--dashboard] [--social] [--social-once] [--verbose] [--status [--json] [--force]]',
  '',
  '  (no flags)    start the control-center dashboard, the Fly billing reader',
  '                and the social daemon',
  '  --dashboard   start the control-center dashboard and the Fly billing reader',
  '  --social      start the social publishing daemon only',
  '  --social-once publish at most one catch-up article cohort, then exit',
  '  --verbose     show full social publisher debug logs instead of compact operator logs',
  '  --status      print the operations status snapshot and exit',
  '  --json        with --status: print the snapshot as JSON, for an agent',
  '  --force       with --status: refetch instead of reading the caches',
].join('\n');

const CHILDREN = {
  dashboard: {
    label: 'dashboard',
    command: 'pnpm',
    // `pnpm ops` is already running inside scripts/env/run.mjs, so call the raw
    // Turbo entrypoint here instead of the public `ops:dashboard` wrapper. The
    // raw command keeps `--env-mode=loose`, which preserves the credentials
    // already injected by the parent without resolving Infisical a second time.
    args: ['run', 'ops:dashboard:raw'],
  },
  flyBilling: {
    label: 'fly-billing',
    command: 'pnpm',
    // Fly has no billing API and its dashboard authenticates by cookie, so the
    // only reader of what Fly actually charges is a signed-in browser on this
    // machine. It never exits non-zero -- see the daemon's own header for why
    // a signed-out Fly must not colour the whole stack red.
    args: ['--filter', '@zapengine/control-center', 'ops:fly-billing-daemon'],
  },
  social: {
    label: 'social',
    command: 'pnpm',
    prerequisite: PODCAST_PIPELINE_PREREQUISITE,
    // The workspace script, not the root `social:daemon` passthrough: that one
    // re-enters scripts/env/run.mjs and we are already inside it. Never the
    // `:watch` variant either -- a watcher that restarts the daemon mid-publish
    // is how a release cohort gets posted twice.
    args: ['--filter', '@zapengine/podcast-pipeline', 'social:daemon'],
  },
  socialOnce: {
    label: 'social-once',
    command: 'pnpm',
    prerequisite: PODCAST_PIPELINE_PREREQUISITE,
    // Same daemon entry point and pid lock, but the workspace script selects
    // the bounded operator catch-up path and exits after at most one article.
    args: ['--filter', '@zapengine/podcast-pipeline', 'social:once'],
  },
};

const options = parseOpsArgs(process.argv.slice(2));

if (options.unknown.length > 0) {
  console.error(`error: unknown option ${options.unknown.join(', ')}`);
  console.error(USAGE);
  process.exit(2);
}

if (options.error) {
  console.error(`error: ${options.error}`);
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
    [
      '--filter',
      '@zapengine/control-center',
      'ops:status',
      // pnpm hands trailing arguments to the workspace script untouched, so the
      // status tool reads these off its own argv and no `--` separator is
      // needed to keep pnpm from claiming `--json` for itself.
      ...(options.json ? ['--json'] : []),
      ...(options.force ? ['--force'] : []),
    ],
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

  const startChild = (child) => {
    const args =
      (child.label === 'social' || child.label === 'social-once') &&
      options.verbose
        ? [...child.args, '--verbose']
        : child.args;
    const spawned = spawn(child.command, args, {
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
  };

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      shuttingDown = true;
      for (const child of running) child.kill(signal);
    });
  }

  // Turbo decides whether anything is stale. This only runs it and waits. Its
  // output is inherited rather than prefixed, because it runs alone before the
  // child it gates starts.
  const runPrerequisite = (step) =>
    new Promise((resolve) => {
      console.log(`🛠️  [ops] ${step.label}: turbo rebuilds only what changed`);
      const spawned = spawn(step.command, step.args, { stdio: 'inherit' });
      running.add(spawned);
      let settled = false;
      const settle = (ready, reason) => {
        if (settled) return;
        settled = true;
        running.delete(spawned);
        if (!ready && !shuttingDown) {
          console.error(`[ops] ${step.label} failed · ${reason}`);
        }
        resolve(ready);
      };
      spawned.on('error', (error) => settle(false, error.message));
      spawned.on('close', (code, signal) =>
        settle(code === 0, signal ?? `exit ${code}`),
      );
    });

  // Only a child that declares a prerequisite waits for it. The dashboard does
  // not, so a failed build leaves it running; the failure is still printed here
  // and reflected in the exit code.
  const gates = new Map();
  for (const child of selected) {
    if (!child.prerequisite) {
      startChild(child);
      continue;
    }
    if (!gates.has(child.prerequisite)) {
      gates.set(child.prerequisite, runPrerequisite(child.prerequisite));
    }
    gates.get(child.prerequisite).then((ready) => {
      // An interrupted build is the operator stopping the stack, not a failure,
      // so it matches a child that Ctrl-C ends: nothing starts, nothing is flagged.
      if (shuttingDown) {
        finish();
      } else if (ready) {
        startChild(child);
      } else {
        failed = true;
        console.error(
          `[${child.label}] not started · its dependencies did not build, so nothing was published.`,
        );
        finish();
      }
    });
  }
}
