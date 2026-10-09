import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface EasStubResult {
  status: number | null;
  stdout: string;
  stderr: string;
  calls: string;
  /** One line per stubbed pnpm call: how many APPLE_API_* vars it inherited. */
  appleEnvCounts: number[];
}

/**
 * Runs a script with a stub `pnpm` first on PATH. The stub logs `$*` to
 * EAS_CALLS_LOG and prints canned JSON chosen by the eas-cli subcommand (`$3`,
 * after `dlx eas-cli@<version>`).
 *
 * When `EAS_STUB_APP_CONFIG` points at an app.config.ts, `config` and `build`
 * read the top-level version from that file at call time, like eas-cli does,
 * and `__VERSION__` in EAS_BUILD_JSON is replaced with it.
 */
export function runScriptWithEasStub(
  scriptPath: string,
  scriptArgs: string[],
  extraEnv: Record<string, string | undefined>,
  { nodeArgs = [], cwd }: { nodeArgs?: string[]; cwd?: string } = {},
): EasStubResult {
  const binDir = mkdtempSync(path.join(tmpdir(), 'eas-stub-bin-'));
  const callsDir = mkdtempSync(path.join(tmpdir(), 'eas-calls-'));
  const callsLog = path.join(callsDir, 'calls.log');
  const appleLog = path.join(callsDir, 'apple.log');
  writeFileSync(callsLog, '', { encoding: 'utf8' });
  writeFileSync(appleLog, '', { encoding: 'utf8' });

  const pnpmScript = `#!/bin/sh
echo "$*" >> "$EAS_CALLS_LOG"
env | grep -c '^APPLE_API' >> "$EAS_APPLE_LOG"
live_version() {
  sed -n "s/^  version: '\\\\([^']*\\\\)',$/\\\\1/p" "$EAS_STUB_APP_CONFIG"
}
case "$3" in
  build)
    if [ -n "$EAS_STUB_APP_CONFIG" ]; then
      v=$(live_version)
      printf '%s' "$EAS_BUILD_JSON" | sed "s/__VERSION__/$v/g"
    else
      printf '%s' "$EAS_BUILD_JSON"
    fi
    if [ -n "$EAS_STUB_CHMOD_CONFIG" ]; then chmod 444 "$EAS_STUB_APP_CONFIG"; fi
    if [ -n "$EAS_BUILD_EXIT" ]; then exit "$EAS_BUILD_EXIT"; fi
    ;;
  config)
    if [ -n "$EAS_STUB_APP_CONFIG" ]; then
      v=$(live_version)
      printf '{"appConfig":{"version":"%s"%s}}' "$v" "$EAS_CONFIG_EXTRA"
    else
      printf '%s' "$EAS_DEFAULT_JSON"
    fi
    ;;
  build:view)
    printf '%s' "$EAS_BUILD_VIEW_JSON"
    ;;
  build:version:get)
    printf '%s' "$EAS_BUILD_VERSION_JSON"
    ;;
  submit)
    printf '%s' "$EAS_SUBMIT_JSON"
    ;;
  *)
    printf '%s' "$EAS_DEFAULT_JSON"
    ;;
esac
`;
  writeFileSync(path.join(binDir, 'pnpm'), pnpmScript, { mode: 0o755 });

  const result = spawnSync(
    process.execPath,
    [...nodeArgs, scriptPath, ...scriptArgs],
    {
      encoding: 'utf8',
      cwd,
      env: {
        ...process.env,
        CI: undefined,
        EAS_CALLS_LOG: callsLog,
        EAS_APPLE_LOG: appleLog,
        EAS_BUILD_JSON: '',
        EAS_BUILD_VIEW_JSON: '',
        EAS_BUILD_VERSION_JSON: '',
        EAS_SUBMIT_JSON: '',
        EAS_DEFAULT_JSON: '',
        ...extraEnv,
        PATH: `${binDir}:${process.env.PATH}`,
      },
    },
  );

  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    calls: readFileSync(callsLog, 'utf8'),
    appleEnvCounts: readFileSync(appleLog, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(Number),
  };
}
