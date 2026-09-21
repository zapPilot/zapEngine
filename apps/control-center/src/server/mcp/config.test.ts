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

  it('registers the Cloudflare vendor MCP in every agent profile', async () => {
    const url = 'https://mcp.cloudflare.com/mcp';
    for (const file of ['.mcp.json', '.claude/mcp.coverage-review.json']) {
      const config = JSON.parse(
        await readFile(path.join(repoRoot, file), 'utf8'),
      ) as McpConfig;
      expect(config.mcpServers['cloudflare'], file).toEqual({
        type: 'http',
        url,
      });
    }

    const openCode = JSON.parse(
      await readFile(path.join(repoRoot, 'opencode.json'), 'utf8'),
    ) as OpenCodeConfig;
    expect(openCode.mcp['cloudflare']).toEqual({
      type: 'remote',
      url,
      enabled: true,
    });
  });

  // Cloudflare's MCP accepts a bearer token as well as OAuth, and a token
  // committed here would grant every clone of this repository whatever that
  // grant allows. Authority stays with the operator's interactive sign-in.
  it('commits no credential in any MCP server entry', async () => {
    const files = [
      '.mcp.json',
      '.claude/mcp.coverage-review.json',
      'opencode.json',
    ];
    for (const file of files) {
      const raw = await readFile(path.join(repoRoot, file), 'utf8');
      const parsed = JSON.parse(raw) as Partial<McpConfig & OpenCodeConfig>;
      const entries = Object.entries({
        ...parsed.mcpServers,
        ...parsed.mcp,
      });
      expect(entries.length, file).toBeGreaterThan(0);
      for (const [name, entry] of entries) {
        expect(entry.headers, `${file}:${name}`).toBeUndefined();
        expect(entry.env, `${file}:${name}`).toBeUndefined();
      }
      expect(raw, file).not.toMatch(/authorization/iu);
    }
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

/**
 * A server entry is either a local launcher or a remote URL. `headers` and
 * `env` are declared although nothing may set them: the contract below asserts
 * their absence, and an untyped field would make that assertion unwritable.
 */
interface McpServerEntry {
  command?: string;
  args?: string[];
  type?: string;
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

interface McpConfig {
  mcpServers: Record<string, McpServerEntry>;
}

interface OpenCodeConfig {
  mcp: Record<
    string,
    McpServerEntry & {
      command?: string[];
      enabled?: boolean;
    }
  >;
}
