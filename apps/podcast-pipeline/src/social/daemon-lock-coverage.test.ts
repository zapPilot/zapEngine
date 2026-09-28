import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const { fsFaults } = vi.hoisted(() => ({
  fsFaults: {
    readError: null as NodeJS.ErrnoException | null,
    writeError: null as NodeJS.ErrnoException | null,
  },
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    // The default lock path is captured at module import; point it at a
    // scratch home so the real daemon lock on this machine is never touched.
    homedir: () => join(tmpdir(), 'social-daemon-lock-cov-home'),
  };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) => {
      if (fsFaults.readError) throw fsFaults.readError;
      return actual.readFileSync(...args);
    },
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => {
      if (fsFaults.writeError) throw fsFaults.writeError;
      return actual.writeFileSync(...args);
    },
  };
});

const {
  acquireSocialDaemonLock,
  isProcessAliveDefault,
  SocialDaemonAlreadyRunningError,
} = await import('./daemon-lock.js');

const noSleep = (): Promise<void> => Promise.resolve();

function errno(code: string): NodeJS.ErrnoException {
  const error = new Error(`${code}: injected filesystem fault`);
  (error as NodeJS.ErrnoException).code = code;
  return error as NodeJS.ErrnoException;
}

async function scratchLockPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'social-daemon-lock-cov-'));
  return join(directory, 'nested', 'social-daemon.pid');
}

async function seedLock(lockPath: string, contents: string): Promise<void> {
  await mkdir(dirname(lockPath), { recursive: true });
  await writeFile(lockPath, contents);
}

// A synchronously reaped child leaves a pid the OS has already released, so
// the default liveness check below observes a deterministically dead process.
function deadPid(): number {
  const { pid } = spawnSync(process.execPath, ['--eval', '']);
  if (!pid) throw new Error('Expected the probe child to report a pid.');
  return pid;
}

afterEach(() => {
  fsFaults.readError = null;
  fsFaults.writeError = null;
  vi.restoreAllMocks();
});

describe('social daemon lock fallback paths', () => {
  it('propagates a lock read failure that is not a missing file', async () => {
    const lockPath = await scratchLockPath();
    await seedLock(lockPath, '4242\n');
    fsFaults.readError = errno('EACCES');

    await expect(
      acquireSocialDaemonLock({
        lockPath,
        sleep: noSleep,
        isProcessAlive: () => false,
      }),
    ).rejects.toMatchObject({ code: 'EACCES' });
  });

  it('propagates a lock write failure that is not a contended lock', async () => {
    const lockPath = await scratchLockPath();
    fsFaults.writeError = errno('EACCES');

    await expect(
      acquireSocialDaemonLock({ lockPath, sleep: noSleep }),
    ).rejects.toMatchObject({ code: 'EACCES' });
  });

  it('evaluates the default lock path without touching the real home directory', async () => {
    fsFaults.writeError = errno('EEXIST');

    await expect(
      acquireSocialDaemonLock({ sleep: noSleep, maxAttempts: 1 }),
    ).rejects.toThrow('after 1 attempts');
  });

  it('waits with the default sleep before taking over an unreadable lock', async () => {
    const lockPath = await scratchLockPath();
    await seedLock(lockPath, 'not-a-pid\n');
    const messages: string[] = [];

    const lock = await acquireSocialDaemonLock({
      lockPath,
      isProcessAlive: () => true,
      log: (message) => messages.push(message),
    });
    try {
      expect(messages).toEqual([
        `🔓 [social-daemon] taking over unreadable lock at ${lockPath}`,
      ]);
    } finally {
      lock.release();
    }
  });

  it('applies the default liveness check to a live holder', async () => {
    const lockPath = await scratchLockPath();
    await seedLock(lockPath, `${process.pid}\n`);

    const error: unknown = await acquireSocialDaemonLock({
      lockPath,
      sleep: noSleep,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SocialDaemonAlreadyRunningError);
    expect(
      (error as InstanceType<typeof SocialDaemonAlreadyRunningError>).pid,
    ).toBe(process.pid);
  });

  it('applies the default liveness check to a dead holder', async () => {
    const lockPath = await scratchLockPath();
    await seedLock(lockPath, `${deadPid()}\n`);

    const lock = await acquireSocialDaemonLock({
      lockPath,
      sleep: noSleep,
      log: () => {},
    });
    try {
      expect(lock).toHaveProperty('release');
    } finally {
      lock.release();
    }
  });
});

describe('isProcessAliveDefault', () => {
  it('reports the current process as alive', () => {
    expect(isProcessAliveDefault(process.pid)).toBe(true);
  });

  it('treats a permission error as a live process owned by someone else', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation((() => {
      throw errno('EPERM');
    }) as typeof process.kill);

    expect(isProcessAliveDefault(4242)).toBe(true);
    expect(kill).toHaveBeenCalledWith(4242, 0);
  });

  it('treats a missing pid as dead', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation((() => {
      throw errno('ESRCH');
    }) as typeof process.kill);

    expect(isProcessAliveDefault(4242)).toBe(false);
  });

  it('rethrows any other kill failure instead of guessing liveness', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw errno('EINVAL');
    });

    expect(() => isProcessAliveDefault(4242)).toThrow(
      expect.objectContaining({ code: 'EINVAL' }),
    );
  });
});
