import { randomBytes } from 'node:crypto';
import {
  chmod,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Both OAuth session stores (Threads, YouTube) persist one JSON credential
 * file under `~/.zap-pilot/` with the same on-disk shape: read-or-null,
 * parse-or-invalid, and an atomic write through a sibling temp file with
 * owner-only permissions. Only the session fields and their own validation
 * differ between the two, so those stay with each caller.
 */

export async function readJsonSessionFile<T>(
  path: string,
  onInvalid: (path: string) => never,
  parse: (value: unknown, path: string) => T,
): Promise<T | null> {
  const raw = await readFile(path, 'utf8').catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return;
      throw error;
    },
  );
  if (raw === undefined) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return onInvalid(path);
  }
  return parse(parsed, path);
}

export async function writeJsonSessionFileAtomically(
  path: string,
  value: unknown,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });

  const suffix = randomBytes(8).toString('hex');
  const temporaryPath = `${path}.tmp-${process.pid}-${suffix}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, path);
    await chmod(path, 0o600);
  } finally {
    await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
