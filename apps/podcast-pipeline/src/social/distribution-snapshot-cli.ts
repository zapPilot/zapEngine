import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { errorMessage } from '../lib/errorMessage.js';
import {
  assertPublishableDistributionSnapshot,
  buildDistributionSnapshot,
} from './distribution-snapshot.js';
import { loadDistributionSnapshotSource } from './distribution-snapshot-source.js';
import { isMainModule } from './is-main-module.js';

/**
 * Regenerates the committed distribution snapshot that `/distribution` renders.
 *
 * The page imports the JSON at build time, exactly as `/track-record` imports
 * `equity-curve.json`, so the landing page never needs Supabase credentials and
 * never goes blank because the database was slow.
 */

const USAGE = `Usage: pnpm social:distribution-snapshot [--out <path>]

Regenerates the committed distribution snapshot read by the landing page's
/distribution route. Writes nothing when Supabase is not configured.`;

/**
 * Resolved against the working directory rather than this module's own URL: a
 * pnpm package script always runs with the package as its cwd, while the
 * compiled copy under dist/ sits one level deeper than the source.
 */
const DEFAULT_OUT = '../landing-page/src/data/distribution-snapshot.json';

export interface DistributionSnapshotCliDependencies {
  loadSource?: typeof loadDistributionSnapshotSource;
  write?: (path: string, contents: string) => Promise<void>;
  env?: Record<string, string | undefined>;
  log?: (message: string) => void;
  warn?: (message: string) => void;
}

export async function runDistributionSnapshotCli(
  args: string[],
  dependencies: DistributionSnapshotCliDependencies = {},
): Promise<void> {
  const env = dependencies.env ?? process.env;
  const log = dependencies.log ?? console.log;
  const warn = dependencies.warn ?? console.warn;
  const { values } = parseArgs({
    args,
    strict: true,
    options: {
      help: { type: 'boolean', short: 'h', default: false },
      out: { type: 'string' },
    },
  });

  if (values.help) {
    log(USAGE);
    return;
  }

  // Skip rather than fail so a contributor without production credentials can
  // still run the full test and lint suite, the same contract the analytics
  // landing-artifact generators use.
  if (!env['SUPABASE_URL'] || !env['SUPABASE_SERVICE_ROLE_KEY']) {
    warn(
      'SKIP: distribution snapshot needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
    return;
  }

  const outPath = resolve(process.cwd(), values.out ?? DEFAULT_OUT);
  const loadSource = dependencies.loadSource ?? loadDistributionSnapshotSource;
  const snapshot = buildDistributionSnapshot(await loadSource());
  assertPublishableDistributionSnapshot(snapshot);

  const write = dependencies.write ?? writeArtifact;
  // Two spaces and a trailing newline keep the artifact prettier-clean, so the
  // commit hook does not reformat it into a second diff.
  await write(outPath, `${JSON.stringify(snapshot, null, 2)}\n`);

  log(formatDistributionSnapshotSummary(snapshot, outPath));
}

export function formatDistributionSnapshotSummary(
  snapshot: ReturnType<typeof buildDistributionSnapshot>,
  outPath: string,
): string {
  const { funnel } = snapshot;
  return [
    `Wrote distribution snapshot as of ${snapshot.asOf} to ${outPath}`,
    `  ${funnel.articles} articles -> ${funnel.localizations} localizations -> ${funnel.videos} videos -> ${funnel.posts} posts on ${funnel.platforms} platforms`,
    `  ${funnel.reach} reach across ${snapshot.channels.length} channels`,
  ].join('\n');
}

async function writeArtifact(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, 'utf8');
}

// jscpd:ignore-start — CLI direct-invocation check, same pattern as social/cli.ts
if (isMainModule(import.meta.url)) {
  try {
    await runDistributionSnapshotCli(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(errorMessage(error));
    process.exitCode = 1;
  }
}
// jscpd:ignore-end
