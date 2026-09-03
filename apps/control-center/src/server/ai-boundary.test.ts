import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const appRoot = resolve(import.meta.dirname, '../..');
const productionRoots = ['src', 'api', 'scripts'].map((path) =>
  resolve(appRoot, path),
);

const forbiddenDependency =
  /^(?:ai|openai|@ai-sdk\/|@anthropic-ai\/sdk|@google\/generative-ai|langchain|@langchain\/)/;
const forbiddenInferenceMarkers = [
  '/chat/completions',
  '/v1/responses',
  '/v1/messages',
  ':generateContent',
  'LLM_MODEL',
  'LLM_THINKING_MODEL',
  'generateText(',
  'streamText(',
  'generateObject(',
] as const;

function productionSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__fixtures__' ? [] : productionSourceFiles(path);
    }
    if (!/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) return [];
    if (/\.(?:test|spec)\./.test(entry.name)) return [];
    return [path];
  });
}

describe('Control Center AI boundary', () => {
  it('has no LLM inference SDK dependency', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(appRoot, 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencies = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ];

    expect(
      dependencies.filter((name) => forbiddenDependency.test(name)),
    ).toEqual([]);
  });

  it('contains no model config or inference endpoint in production code', () => {
    const violations = productionRoots.flatMap((root) =>
      productionSourceFiles(root).flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        return forbiddenInferenceMarkers
          .filter((marker) => source.includes(marker))
          .map((marker) => `${file.slice(appRoot.length + 1)} -> ${marker}`);
      }),
    );

    expect(violations).toEqual([]);
  });
});
