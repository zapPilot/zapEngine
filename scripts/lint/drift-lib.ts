/**
 * Shared scaffolding for the repo drift checks in this directory.
 * Each checker owns its own rules; only the tree walk, the JSON reader and the
 * issue report/exit convention live here.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export interface DriftIssue {
  type: string;
  file: string;
  issue: string;
  severity: string;
}

/** Reads a JSON file, treating unreadable/invalid content as "no config". */
export function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return {} as T;
  }
}

/**
 * Collects `<dir>/<child>/<fileName>` for every immediate subdirectory of
 * `dir`. `accept` opts a file out after it has been read (e.g. package.json
 * files without a `scripts` block).
 */
export function findWorkspaceFiles(
  dir: string,
  fileName: string,
  accept?: (content: string) => boolean,
): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (!statSync(fullPath).isDirectory()) continue;

    const filePath = join(fullPath, fileName);
    try {
      const content = readFileSync(filePath, 'utf-8');
      if (!accept || accept(content)) {
        results.push(filePath);
      }
    } catch {
      // subdirectory has no such file
    }
  }
  return results;
}

/** Prints the collected issues (or the all-clear line) and exits accordingly. */
export function reportAndExit(
  issues: DriftIssue[],
  labels: { header: string; ok: string; footer?: string },
): never {
  if (issues.length === 0) {
    console.log(labels.ok);
    process.exit(0);
  }

  console.log(labels.header);
  for (const issue of issues) {
    console.log(`[${issue.severity}] ${issue.type}: ${issue.file}`);
    console.log(`        ${issue.issue}`);
  }
  if (labels.footer !== undefined) console.log(labels.footer);
  process.exit(1);
}
