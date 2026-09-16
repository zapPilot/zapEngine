import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../../../..');

describe('Ops MCP repository wiring', () => {
  it('advertises the canonical launcher from .mcp.json', async () => {
    const raw = await readFile(path.join(repoRoot, '.mcp.json'), 'utf8');
    const config = JSON.parse(raw) as McpConfig;

    expect(config.mcpServers['zap-pilot-ops']).toEqual({
      command: 'node',
      args: ['scripts/ops-mcp.mjs'],
    });
  });

  it('advertises the same launcher to OpenCode', async () => {
    const raw = await readFile(path.join(repoRoot, 'opencode.json'), 'utf8');
    const config = JSON.parse(raw) as OpenCodeConfig;

    expect(config.mcp['zap-pilot-ops']).toMatchObject({
      type: 'local',
      command: ['node', 'scripts/ops-mcp.mjs'],
      enabled: true,
    });
  });

  it('pins the stdio launcher to the production environment', async () => {
    const launcher = await readFile(
      path.join(repoRoot, 'scripts/ops-mcp.mjs'),
      'utf8',
    );

    expect(launcher).toMatch(/'--environment',\s*'prod'/u);
    expect(launcher).toContain("'apps/control-center/src/server/mcp/stdio.ts'");
  });

  it('keeps production ops runbooks on the merged environment runner', async () => {
    const runbooks = [
      'apps/control-center/AGENTS.md',
      'apps/control-center/README.md',
      'apps/control-center/MCP.md',
      'apps/control-center/OPERATOR.md',
      'docs/operations/autonomous-engineering-loop.md',
      'docs/operations/coverage-review.md',
      '.agents/skills/coverage-review/SKILL.md',
    ];
    const contents = await Promise.all(
      runbooks.map(async (file) => ({
        file,
        text: await readFile(path.join(repoRoot, file), 'utf8'),
      })),
    );

    for (const { file, text } of contents) {
      expect(text, file).not.toMatch(/^\s*infisical run --env=prod --/mu);
    }

    for (const file of [
      'apps/control-center/AGENTS.md',
      'apps/control-center/README.md',
      '.agents/skills/coverage-review/SKILL.md',
    ]) {
      expect(
        contents.find((entry) => entry.file === file)?.text,
        file,
      ).toContain('node scripts/env/run.mjs --environment prod --');
    }
  });
});

interface McpConfig {
  mcpServers: Record<string, { command: string; args: string[] }>;
}

interface OpenCodeConfig {
  mcp: Record<
    string,
    {
      type: string;
      command: string[];
      enabled?: boolean;
    }
  >;
}
