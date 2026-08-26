import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { sleep as defaultSleep } from '../lib/sleep.js';

export const DEFAULT_SOCIAL_DAEMON_LOCK_PATH = join(
  homedir(),
  '.zap-pilot',
  'social-daemon.pid',
);

const MAX_ATTEMPTS = 5;
const GARBAGE_GRACE_MS = 100;

export class SocialDaemonAlreadyRunningError extends Error {
  readonly pid: number;

  constructor(pid: number, lockPath: string) {
    super(
      `another social daemon already holds the lock as pid ${pid}. Confirm it with \`ps -p ${pid}\` and stop that process, or delete ${lockPath} if the pid belongs to something else.`,
    );
    this.name = 'SocialDaemonAlreadyRunningError';
    this.pid = pid;
  }
}

export interface SocialDaemonLock {
  release(): void;
}

export interface AcquireSocialDaemonLockOptions {
  lockPath?: string;
  isProcessAlive?: (pid: number) => boolean;
  sleep?: (milliseconds: number) => Promise<void>;
  maxAttempts?: number;
  log?: (message: string) => void;
}

type LockFileState =
  | { kind: 'missing' }
  | { kind: 'pid'; pid: number }
  | { kind: 'garbage' };

function readLockFile(lockPath: string): LockFileState {
  let raw: string;
  try {
    raw = readFileSync(lockPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { kind: 'missing' };
    }
    throw error;
  }

  const pid = Number(raw.trim());
  return Number.isInteger(pid) && pid > 0
    ? { kind: 'pid', pid }
    : { kind: 'garbage' };
}

function isProcessAliveDefault(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the pid is live but owned by another user.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function createLock(lockPath: string): SocialDaemonLock {
  const ownerPid = process.pid;
  let released = false;

  function release(): void {
    if (released) return;
    released = true;
    process.removeListener('exit', release);

    // Only drop a lock this process still owns: a takeover may already have
    // replaced the file with another daemon's pid.
    const state = readLockFile(lockPath);
    if (state.kind === 'pid' && state.pid === ownerPid) {
      rmSync(lockPath, { force: true });
    }
  }

  // Best-effort only. A daemon killed by SIGTERM never fires `exit`, so a dead
  // pid left behind is the normal case and pid liveness is what actually
  // decides ownership. Signals stay unhandled on purpose: Playwright's
  // launchPersistentContext installs its own SIGINT/SIGTERM handlers to close
  // Chrome, and pre-empting them would orphan the browser.
  process.once('exit', release);

  return { release };
}

export async function acquireSocialDaemonLock(
  options: AcquireSocialDaemonLockOptions = {},
): Promise<SocialDaemonLock> {
  const lockPath = options.lockPath ?? DEFAULT_SOCIAL_DAEMON_LOCK_PATH;
  const isProcessAlive = options.isProcessAlive ?? isProcessAliveDefault;
  const sleep = options.sleep ?? defaultSleep;
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const log = options.log ?? console.log;

  mkdirSync(dirname(lockPath), { recursive: true, mode: 0o700 });

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      writeFileSync(lockPath, `${process.pid}\n`, { flag: 'wx' });
      return createLock(lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }

    let state = readLockFile(lockPath);
    if (state.kind === 'garbage') {
      // `wx` creation is atomic but the pid write that follows is not, so a
      // lock caught mid-write can still resolve into a live owner.
      await sleep(GARBAGE_GRACE_MS);
      state = readLockFile(lockPath);
    }

    if (state.kind === 'pid' && isProcessAlive(state.pid)) {
      throw new SocialDaemonAlreadyRunningError(state.pid, lockPath);
    }

    if (state.kind === 'pid') {
      log(`🔓 [social-daemon] taking over lock from dead pid ${state.pid}`);
      rmSync(lockPath, { force: true });
    } else if (state.kind === 'garbage') {
      log(`🔓 [social-daemon] taking over unreadable lock at ${lockPath}`);
      rmSync(lockPath, { force: true });
    }
  }

  throw new Error(
    `Could not acquire the social daemon lock at ${lockPath} after ${maxAttempts} attempts.`,
  );
}
