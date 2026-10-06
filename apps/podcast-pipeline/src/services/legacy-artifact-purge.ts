import { assertOnlyKnownFlags, parseFlagArgs } from '../lib/cli-args.js';
import { runCli } from '../lib/cli-runner.js';
import { getRequiredEnv } from '../lib/env.js';
import { isMainModule } from '../lib/is-main-module.js';
import {
  createR2ClientFromEnv,
  deleteR2Objects,
  listR2Objects,
  type StoredObject,
} from './r2-objects.js';

const SEG = '[a-zA-Z0-9][a-zA-Z0-9._-]*';
const RULES = {
  slides: new RegExp(
    `^episodes/${SEG}/localizations/(?:zh-Hant|en|ja)/video/${SEG}/${SEG}/slides/${SEG}\\.png$`,
  ),
  input: new RegExp(
    `^episodes/${SEG}/(?:localizations/(?:zh-Hant|en|ja)/)?(?:main|classroom)(?:/(?:zh-Hant|en|ja))?/input\\.mp3$`,
  ),
  threads: new RegExp(`^social/threads/[a-f0-9]{64}/${SEG}/video\\.mp4$`),
};
export function classifyLegacyArtifact(key: string): keyof typeof RULES | null {
  if (key.split('/').some((part) => part === '.' || part === '..')) return null;
  for (const category of Object.keys(RULES) as (keyof typeof RULES)[])
    if (RULES[category].test(key)) return category;
  return null;
}
export function planLegacyPurge(objects: readonly StoredObject[]) {
  return Object.keys(RULES).map((category) => {
    const selected = objects.filter(
      (object) => classifyLegacyArtifact(object.key) === category,
    );
    return {
      category,
      count: selected.length,
      bytes: selected.reduce((sum, object) => sum + object.size, 0),
      examples: selected.slice(0, 5).map((object) => object.key),
      keys: selected.map((object) => object.key),
    };
  });
}
export async function runLegacyPurgeCli(argv: string[]): Promise<void> {
  const parsed = parseFlagArgs(['purge', ...argv]);
  assertOnlyKnownFlags(
    parsed,
    ['apply', 'dry-run', 'max-objects'],
    'Usage: artifacts:purge-legacy [--dry-run | --apply --max-objects N]',
  );
  const flags = parsed.flags;
  if (
    (flags['apply'] !== undefined && flags['apply'] !== true) ||
    (flags['dry-run'] !== undefined && flags['dry-run'] !== true) ||
    (flags['apply'] && flags['dry-run'])
  )
    throw new Error('Invalid purge mode');
  const max = Number(flags['max-objects']);
  if (
    flags['apply'] &&
    (typeof flags['max-objects'] !== 'string' ||
      !Number.isSafeInteger(max) ||
      max < 0)
  )
    throw new Error('--apply requires --max-objects N');
  const r2 = createR2ClientFromEnv();
  const bucket = getRequiredEnv('R2_BUCKET_NAME');
  const objects = [
    ...(await listR2Objects(r2, bucket, 'episodes/')),
    ...(await listR2Objects(r2, bucket, 'social/threads/')),
  ];
  const plan = planLegacyPurge(objects);
  for (const { category, count, bytes, examples } of plan)
    console.log(
      JSON.stringify({
        event: 'purge:category',
        category,
        count,
        bytes,
        examples,
      }),
    );
  for (const object of objects)
    if (!classifyLegacyArtifact(object.key))
      console.log(
        JSON.stringify({ event: 'purge:unmatched', key: object.key }),
      );
  const keys = plan.flatMap((category) => category.keys);
  if (flags['apply']) {
    if (keys.length > max)
      throw new Error(`Purge exceeds --max-objects: ${keys.length} > ${max}`);
    await deleteR2Objects(r2, bucket, keys);
  }
  console.log(
    JSON.stringify({
      event: 'purge:summary',
      dryRun: !flags['apply'],
      count: keys.length,
      bytes: plan.reduce((sum, category) => sum + category.bytes, 0),
    }),
  );
}
if (isMainModule(import.meta.url))
  runCli(() => runLegacyPurgeCli(process.argv.slice(2)));
