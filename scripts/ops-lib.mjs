// Pure argument and stream helpers for scripts/ops.mjs. They live apart from
// the launcher so they can be unit-tested without spawning a daemon or a dev
// server: everything in ops.mjs itself is process lifecycle, which a test
// cannot exercise cheaply.

const DASHBOARD = '--dashboard';
const SOCIAL = '--social';
const STATUS = '--status';

export function parseOpsArgs(argv) {
  const unknown = [];
  let dashboard = false;
  let social = false;
  let status = false;
  let help = false;

  for (const argument of argv) {
    switch (argument) {
      case DASHBOARD:
        dashboard = true;
        break;
      case SOCIAL:
        social = true;
        break;
      case STATUS:
        status = true;
        break;
      case '-h':
      case '--help':
        help = true;
        break;
      default:
        unknown.push(argument);
    }
  }

  // `pnpm ops` with no selector means "run my operations stack", because that
  // is the whole point of having one entry point: publishing and the dashboard
  // that watches it come up together.
  if (!dashboard && !social && !status && !help) {
    dashboard = true;
    social = true;
  }

  // `--status` prints a snapshot and exits. Pairing it with a long-lived child
  // would make the snapshot scroll away under that child's log stream.
  if (status) {
    dashboard = false;
    social = false;
  }

  return { dashboard, social, status, help, unknown };
}

/**
 * Prefixes each complete line a child writes. Two children share one TTY here,
 * and their chunk boundaries land wherever the pipe buffer flushes -- without
 * this, a daemon publish line and a Vite rebuild line interleave mid-word and
 * neither is readable. Partial lines are held back until their newline arrives;
 * call `flush()` at stream end so a child that dies mid-line still reports what
 * it managed to say.
 */
export function createLinePrefixer(prefix, write) {
  let pending = '';

  const push = (chunk) => {
    pending += String(chunk);
    for (
      let newline = pending.indexOf('\n');
      newline >= 0;
      newline = pending.indexOf('\n')
    ) {
      write(`${prefix}${pending.slice(0, newline)}\n`);
      pending = pending.slice(newline + 1);
    }
  };

  push.flush = () => {
    if (pending.length === 0) return;
    write(`${prefix}${pending}\n`);
    pending = '';
  };

  return push;
}
