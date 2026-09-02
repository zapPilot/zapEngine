import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The only place the EAS CLI version is written. `eas.json`'s `cli.version`
// floor is asserted against this constant in tests/easTooling.test.ts, so the
// two cannot drift apart.
export const EAS_CLI_VERSION = '20.5.1';

const NON_INTERACTIVE = '--non-interactive';

export function runEasJson(args, opts = {}) {
  const stdout = runEas(args, { ...opts, captureStdout: true });

  try {
    return JSON.parse(stdout);
  } catch {
    const tail = stdout.trim().slice(-500);
    throw new Error(
      `EAS command returned non-JSON output: ${tail || '<empty>'}`,
    );
  }
}

export function runEas(
  args,
  { captureStdout = false, addNonInteractive = true } = {},
) {
  // A CI runner has no TTY, so any prompt eas-cli would normally show becomes a
  // hung job that only the workflow timeout ends. Local runs keep the prompts —
  // first-time credential setup goes through `eas credentials` interactively.
  // Some EAS commands (for example build:view) are inherently non-interactive
  // and do not expose the flag; callers can disable automatic flag injection.
  const easArgs =
    process.env.CI === 'true' &&
    addNonInteractive &&
    !args.includes(NON_INTERACTIVE)
      ? [...args, NON_INTERACTIVE]
      : args;

  const result = spawnSync(
    'pnpm',
    ['dlx', `eas-cli@${EAS_CLI_VERSION}`, ...easArgs],
    {
      encoding: 'utf8',
      stdio: captureStdout ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result.stdout ?? '';
}

// `node scripts/eas.mjs <args…>` — how the package.json scripts reach the CLI.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runEas(process.argv.slice(2));
}
