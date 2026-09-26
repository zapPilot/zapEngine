import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { type Hex, isHex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';

export interface LocalPaths {
  dir: string;
  key: string;
  multibaas: string;
}
export function localPaths(
  dir = join(homedir(), '.zap-news-agent'),
): LocalPaths {
  return {
    dir,
    key: join(dir, 'agent.key'),
    multibaas: join(dir, 'multibaas.json'),
  };
}

const multibaasSchema = z.object({ url: z.url(), apiKey: z.string().min(1) });
export type MultibaasConfig = z.infer<typeof multibaasSchema>;

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// Secrets live outside the repo; refuse files other users could read.
async function readPrivate(path: string): Promise<string> {
  const info = await stat(path);
  if ((info.mode & 0o077) !== 0) throw new Error(`${path} must be chmod 600`);
  return (await readFile(path, 'utf8')).trim();
}

export async function initLocal(
  paths: LocalPaths,
  multibaas?: MultibaasConfig,
): Promise<{ address: `0x${string}`; created: boolean }> {
  await mkdir(paths.dir, { recursive: true, mode: 0o700 });
  const created = !(await exists(paths.key));
  if (created)
    await writeFile(paths.key, `${generatePrivateKey()}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
  if (multibaas)
    await writeFile(
      paths.multibaas,
      `${JSON.stringify(multibaasSchema.parse(multibaas))}\n`,
      { mode: 0o600 },
    );
  return {
    address: privateKeyToAccount(await readAgentKey(paths)).address,
    created,
  };
}

export async function readAgentKey(paths: LocalPaths): Promise<Hex> {
  const key = await readPrivate(paths.key);
  if (!isHex(key) || key.length !== 66) throw new Error('Malformed agent key');
  return key;
}

export async function readMultibaasConfig(
  paths: LocalPaths,
): Promise<MultibaasConfig> {
  return multibaasSchema.parse(JSON.parse(await readPrivate(paths.multibaas)));
}
