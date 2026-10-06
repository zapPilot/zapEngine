import { assertOnlyKnownFlags, parseFlagArgs } from '../lib/cli-args.js';
import { runCli } from '../lib/cli-runner.js';
import { isMainModule } from '../lib/is-main-module.js';
import {
  createArtifactGcDependencies,
  releaseArtifactGcOwner,
  runArtifactGc,
} from './artifact-gc.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function runArtifactGcCli(argv: string[]): Promise<void> {
  const parsed = parseFlagArgs(['gc', ...argv]);
  assertOnlyKnownFlags(
    parsed,
    ['apply', 'dry-run', 'owner', 'max-minutes', 'release-owner'],
    'Usage: artifacts:gc [--apply | --dry-run] [--owner uuid] [--max-minutes N] | --release-owner uuid',
  );
  const flags = parsed.flags;
  for (const flag of ['apply', 'dry-run'])
    if (flags[flag] !== undefined && flags[flag] !== true)
      throw new Error(`Invalid --${flag}`);
  if (flags['apply'] && flags['dry-run']) throw new Error('Conflicting modes');
  for (const flag of ['owner', 'release-owner'])
    if (
      flags[flag] !== undefined &&
      (typeof flags[flag] !== 'string' || !UUID.test(flags[flag]))
    )
      throw new Error(`Invalid --${flag}`);
  const minutes =
    flags['max-minutes'] === undefined
      ? undefined
      : Number(flags['max-minutes']);
  if (
    minutes !== undefined &&
    (typeof flags['max-minutes'] !== 'string' ||
      !Number.isFinite(minutes) ||
      minutes <= 0)
  )
    throw new Error('Invalid --max-minutes');
  if (flags['release-owner'] && Object.keys(flags).length !== 1)
    throw new Error('Release mode takes only --release-owner');
  const deps = createArtifactGcDependencies();
  if (typeof flags['release-owner'] === 'string')
    return releaseArtifactGcOwner(deps, flags['release-owner']);
  const result = await runArtifactGc(deps, {
    apply: flags['apply'] === true,
    ...(typeof flags['owner'] === 'string' ? { owner: flags['owner'] } : {}),
    ...(minutes === undefined ? {} : { maxMinutes: minutes }),
  });
  if (result.failures) process.exitCode = 1;
}
if (isMainModule(import.meta.url))
  runCli(() => runArtifactGcCli(process.argv.slice(2)));
