import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { localPaths } from './config/local.js';
import { main } from './main.js';
import { approvedReview } from './test-utils/fixtures.js';

const EPISODE = '11111111-1111-4111-8111-111111111111';
const env = () => ({
  accountUrl: 'https://account.example',
  podcastUrl: 'https://podcast.example',
  allowedUserIds: '',
});
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

async function initialized() {
  const dir = await mkdtemp(join(tmpdir(), 'agent-main-'));
  const keyFile = join(dir, 'mb-key');
  await writeFile(keyFile, 'mb-secret\n');
  const paths = localPaths(join(dir, 'home'));
  const lines: string[] = [];
  await main(
    [
      'init',
      '--multibaas-url',
      'https://mb.example',
      '--multibaas-key-file',
      keyFile,
    ],
    { paths, log: (line) => lines.push(line) },
  );
  return { paths, lines, key: (await readFile(paths.key, 'utf8')).trim() };
}

const ALIAS_URL = /\/chains\/ethereum\/addresses(?:\/([^/]+)(\/contracts)?)?$/;

// Remembers what `multibaas-setup` registers, as MultiBaas would.
function router() {
  const aliases = new Map<
    string,
    { address: string; contracts: { label: string }[] }
  >();
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    const alias = ALIAS_URL.exec(url);
    if (alias) {
      const body = init?.body
        ? (JSON.parse(String(init.body)) as {
            alias?: string;
            address?: string;
            label?: string;
          })
        : {};
      const [, name, link] = alias;
      if (!name)
        aliases.set(body.alias!, { address: body.address!, contracts: [] });
      else if (link) aliases.get(name)?.contracts.push({ label: body.label! });
      else {
        const found = aliases.get(name);
        return found
          ? json({ status: 200, result: { alias: name, ...found } })
          : new Response(JSON.stringify({ status: 404 }), { status: 404 });
      }
      return json({ status: 200, result: null });
    }
    if (url.endsWith('/chains/ethereum/status'))
      return json({ status: 200, result: { chainID: 8453, blockNumber: 9 } });
    if (url.endsWith('/v1/systemone'))
      return json({
        answers: {
          exchange_hack: { noul: 0.96 },
          eth_pressure: { choice: 'upward', probabilities: { upward: 0.78 } },
        },
      });
    if (url.endsWith('/plan-orchestration/rotate/review'))
      return json(approvedReview());
    if (url.includes(`/episodes/${EPISODE}`))
      return json({ id: EPISODE, title: 'Bitget hacked', script: 'text' });
    if (url.endsWith('/contracts')) return json({ status: 200, result: [] });
    return json({ status: 200, result: null });
  });
}

describe('CLI entry', () => {
  it('creates the agent wallet without ever printing the private key', async () => {
    const { paths, lines, key } = await initialized();
    expect(lines[0]).toMatch(/^Created agent wallet 0x[0-9a-fA-F]{40}/);
    expect(lines.join('\n')).not.toContain(key.slice(2));
    expect(JSON.parse(await readFile(paths.multibaas, 'utf8'))).toEqual({
      url: 'https://mb.example',
      apiKey: 'mb-secret',
    });
    const again: string[] = [];
    await main(['init'], { paths, log: (line) => again.push(line) });
    expect(again[0]).toMatch(/^Reusing agent wallet/);
  });
  it('runs setup and a dry-run demo through the injected transport', async () => {
    const { paths, key } = await initialized();
    const fetcher = router();
    const lines: string[] = [];
    await main(['multibaas-setup'], {
      paths,
      fetcher,
      log: (line) => lines.push(line),
    });
    await main(['demo', '--episode', EPISODE], {
      paths,
      fetcher,
      env,
      log: (line) => lines.push(line),
      now: () => Date.parse('2026-09-26T00:00:00Z'),
      sleep: async () => undefined,
    });
    const output = lines.join('\n');
    expect(output).toContain('MultiBaas setup complete');
    expect(output).toContain('Laya     exchange hack 96%');
    expect(output).toContain('News     Bitget hacked');
    // The fixture review is for another wallet, so the guard must block it.
    expect(output).toContain('Outcome: blocked');
    expect(output).not.toContain(key.slice(2));
    const composeCalls = fetcher.mock.calls.filter(([url]) =>
      String(url).includes('/methods/'),
    );
    expect(composeCalls).toHaveLength(0);
  });
  it('stops before planning when a MultiBaas registration is missing', async () => {
    const { paths } = await initialized();
    const fetcher = router();
    await expect(
      main(['demo', '--episode', EPISODE], {
        paths,
        fetcher,
        env,
        log: () => undefined,
      }),
    ).rejects.toThrow(
      'MultiBaas is missing weth/wethtoken, clearstarethvault/clearstarethvault, usdc/usdctoken, sparkusdcvault/sparkusdcvault; run `pnpm --filter @zapengine/news-agent agent multibaas-setup`',
    );
    const urls = fetcher.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.endsWith('/rotate/review'))).toBe(false);
    expect(urls.some((url) => url.includes('/methods/'))).toBe(false);
  });
  it('refuses to execute without a Telegram destination', async () => {
    const { paths } = await initialized();
    const fetcher = router();
    await expect(
      main(['demo', '--episode', EPISODE, '--execute'], {
        paths,
        fetcher,
        env,
      }),
    ).rejects.toThrow('Telegram needs');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
