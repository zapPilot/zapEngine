#!/usr/bin/env pnpm tsx

/**
 * The headline policy has one canonical copy under `.agents/`, where it is
 * editable and reviewable alongside the skill that explains it. The social
 * writer reads its prompts from `apps/podcast-pipeline/prompts/social/`, a
 * directory resolved relative to the running module, so `.agents/` is not
 * reachable from both `src/` (local daemon) and `dist/` (container). The
 * prompt copy is therefore generated and committed, like any other build
 * output, and this gate fails when the two diverge.
 */

import { copyFileSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const CANONICAL = join(ROOT, '.agents/skills/social-headline/HEADLINE.md');
const GENERATED = join(
  ROOT,
  'apps/podcast-pipeline/prompts/social/headline.md',
);

function main(): void {
  const shouldFix = process.argv.includes('--fix');
  const canonical = readFileSync(CANONICAL, 'utf-8');
  let generated: string | null;
  try {
    generated = readFileSync(GENERATED, 'utf-8');
  } catch {
    generated = null;
  }

  if (canonical === generated) {
    console.log('Headline policy prompt is in sync.');
    return;
  }

  if (shouldFix) {
    copyFileSync(CANONICAL, GENERATED);
    console.log(
      `Synced headline policy: ${relative(ROOT, CANONICAL)} → ${relative(
        ROOT,
        GENERATED,
      )}`,
    );
    return;
  }

  console.error('Headline policy drift detected.');
  console.error(
    `${relative(ROOT, CANONICAL)} is canonical. Run \`pnpm lint headline-policy --fix\` to regenerate ${relative(
      ROOT,
      GENERATED,
    )}; do not edit the generated file by hand.`,
  );
  process.exit(1);
}

main();
