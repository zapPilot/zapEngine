import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * `import.meta.dirname` sits at a different depth under `tsx` than in the
 * `tsconfig.server.json` output tree, so a fixed count of `..` segments is
 * wrong in one of the two. The workspace manifest is the marker that holds in
 * both.
 */
export function findRepoRoot(startDir: string): string {
  let current = startDir;
  while (!existsSync(join(current, 'pnpm-workspace.yaml'))) {
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`no pnpm-workspace.yaml above ${startDir}`);
    }
    current = parent;
  }
  return current;
}
