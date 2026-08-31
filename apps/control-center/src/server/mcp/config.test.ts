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

  it('pins the stdio launcher to the production environment', async () => {
    const launcher = await readFile(
      path.join(repoRoot, 'scripts/ops-mcp.mjs'),
      'utf8',
    );

    expect(launcher).toMatch(/['"]--environment['"],\s*['"]prod['"]/u);
    expect(launcher).toContain(
      "'apps/control-center/src/server/mcp/stdio.ts'",
    );
  });
});

interface McpConfig {
  mcpServers: Record<string, { command: string; args: string[] }>;
}
