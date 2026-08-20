import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const { fsOverrides } = vi.hoisted(() => ({
  fsOverrides: { alwaysExists: false },
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => {
      if (fsOverrides.alwaysExists) {
        const error: NodeJS.ErrnoException = new Error(
          'EEXIST: file already exists',
        );
        error.code = 'EEXIST';
        throw error;
      }
      return actual.writeFileSync(...args);
    },
  };
});

const { acquireSocialDaemonLock, SocialDaemonAlreadyRunningError } =
  await import('./daemon-lock.js');

const noSleep = (): Promise<void> => Promise.resolve();

// The extra path segment proves the lock creates its own directory tree.
async function scratchLockPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'social-daemon-lock-'));
  return join(directory, 'nested', 'social-daemon.pid');
}

async function seedLock(lockPath: string, contents: string): Promise<void> {
  await mkdir(dirname(lockPath), { recursive: true });
  await writeFile(lockPath, contents);
}

async function readLockOrNull(lockPath: string): Promise<string | null> {
  return readFile(lockPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
}

afterEach(() => {
  fsOverrides.alwaysExists = false;
});

describe('social daemon lock', () => {
  it('creates the lock file and its directory on a first acquire', async () => {
    const lockPath = await scratchLockPath();

    const lock = await acquireSocialDaemonLock({ lockPath, sleep: noSleep });
    try {
      expect((await readFile(lockPath, 'utf8')).trim()).toBe(
        String(process.pid),
      );
    } finally {
      lock.release();
    }
  });

  it('refuses to start when the lock belongs to a live pid', async () => {
    const lockPath = await scratchLockPath();
    await seedLock(lockPath, '4242\n');

    const error: unknown = await acquireSocialDaemonLock({
      lockPath,
      sleep: noSleep,
      isProcessAlive: () => true,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SocialDaemonAlreadyRunningError);
    expect(
      (error as InstanceType<typeof SocialDaemonAlreadyRunningError>).pid,
    ).toBe(4242);
    expect(await readFile(lockPath, 'utf8')).toBe('4242\n');
  });

  it('takes over a lock left behind by a dead pid', async () => {
    const lockPath = await scratchLockPath();
    await seedLock(lockPath, '4242\n');
    const messages: string[] = [];

    const lock = await acquireSocialDaemonLock({
      lockPath,
      sleep: noSleep,
      isProcessAlive: () => false,
      log: (message) => messages.push(message),
    });
    try {
      expect((await readFile(lockPath, 'utf8')).trim()).toBe(
        String(process.pid),
      );
      expect(messages).toEqual([
        '[social-daemon] taking over the lock left by dead pid 4242.',
      ]);
    } finally {
      lock.release();
    }
  });

  it.each([
    ['unparseable', 'not-a-pid\n'],
    ['empty', ''],
  ])('takes over an %s lock file after the grace recheck', async (_, seed) => {
    const lockPath = await scratchLockPath();
    await seedLock(lockPath, seed);
    const messages: string[] = [];
    const sleep = vi.fn(noSleep);

    const lock = await acquireSocialDaemonLock({
      lockPath,
      sleep,
      isProcessAlive: () => true,
      log: (message) => messages.push(message),
    });
    try {
      expect(sleep).toHaveBeenCalledOnce();
      expect((await readFile(lockPath, 'utf8')).trim()).toBe(
        String(process.pid),
      );
      expect(messages).toEqual([
        `[social-daemon] taking over an unreadable lock at ${lockPath}.`,
      ]);
    } finally {
      lock.release();
    }
  });

  it('yields to a pid that finishes writing during the grace window', async () => {
    const lockPath = await scratchLockPath();
    await seedLock(lockPath, '');

    const error: unknown = await acquireSocialDaemonLock({
      lockPath,
      isProcessAlive: () => true,
      sleep: async () => {
        await writeFile(lockPath, '4242\n');
      },
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SocialDaemonAlreadyRunningError);
    expect(
      (error as InstanceType<typeof SocialDaemonAlreadyRunningError>).pid,
    ).toBe(4242);
  });

  it('frees the lock on release, and releasing twice is a no-op', async () => {
    const lockPath = await scratchLockPath();

    const first = await acquireSocialDaemonLock({ lockPath, sleep: noSleep });
    first.release();
    first.release();
    expect(await readLockOrNull(lockPath)).toBeNull();

    const second = await acquireSocialDaemonLock({ lockPath, sleep: noSleep });
    second.release();
  });

  it('leaves the lock alone when another pid has already taken it over', async () => {
    const lockPath = await scratchLockPath();

    const lock = await acquireSocialDaemonLock({ lockPath, sleep: noSleep });
    await writeFile(lockPath, '4242\n');
    lock.release();

    expect(await readFile(lockPath, 'utf8')).toBe('4242\n');
  });

  it('gives up after maxAttempts when the lock is never free', async () => {
    const lockPath = await scratchLockPath();
    fsOverrides.alwaysExists = true;

    await expect(
      acquireSocialDaemonLock({ lockPath, sleep: noSleep, maxAttempts: 3 }),
    ).rejects.toThrow(`after 3 attempts`);
  });
});
