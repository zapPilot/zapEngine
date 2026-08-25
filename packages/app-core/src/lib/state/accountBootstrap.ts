export type AccountBootstrapOutcome = 'ready' | 'suspended' | 'stale';

const suspendedWallets = new Set<string>();
const bootstrappedWallets = new Set<string>();
const inFlight = new Map<string, Promise<AccountBootstrapOutcome>>();
const generations = new Map<string, number>();

function normalizeWallet(wallet: string): string {
  return wallet.trim().toLowerCase();
}

function getGeneration(key: string): number {
  return generations.get(key) ?? 0;
}

function invalidate(key: string): void {
  generations.set(key, getGeneration(key) + 1);
  bootstrappedWallets.delete(key);
  inFlight.delete(key);
}

async function runBootstrap(
  key: string,
  generationAtStart: number,
  bootstrap: () => Promise<unknown>,
): Promise<AccountBootstrapOutcome> {
  await bootstrap();
  if (generationAtStart !== getGeneration(key)) {
    return 'stale';
  }
  if (suspendedWallets.has(key)) {
    return 'suspended';
  }
  bootstrappedWallets.add(key);
  return 'ready';
}

/**
 * Runs the account bootstrap for a wallet session at most once: concurrent
 * and late callers share the same in-flight promise, an already-bootstrapped
 * wallet resolves immediately, and a suspended wallet never bootstraps.
 *
 * The bootstrap callback runs exactly once per session; API errors reject the
 * shared promise so every waiter observes the failure and can retry.
 */
export function ensureAccountBootstrap(
  wallet: string,
  bootstrap: () => Promise<unknown>,
): Promise<AccountBootstrapOutcome> {
  const key = normalizeWallet(wallet);

  if (suspendedWallets.has(key)) {
    return Promise.resolve('suspended');
  }
  if (bootstrappedWallets.has(key)) {
    return Promise.resolve('ready');
  }

  const existing = inFlight.get(key);
  if (existing) {
    return existing;
  }

  const promise = runBootstrap(key, getGeneration(key), bootstrap);
  inFlight.set(key, promise);

  // Only the promise that still owns the map slot may remove itself; a stale
  // bootstrap cleared mid-flight must not delete a newer session's promise.
  void (async () => {
    try {
      await promise;
    } catch {
      // The rejection already propagates to every waiter; release the slot.
    }
    if (inFlight.get(key) === promise) {
      inFlight.delete(key);
    }
  })();

  return promise;
}

export function isAccountBootstrapped(
  wallet: string | null | undefined,
): boolean {
  return wallet ? bootstrappedWallets.has(normalizeWallet(wallet)) : false;
}

/**
 * Invalidates any bootstrap state for the wallet (e.g. observed disconnect).
 * An in-flight request is not cancellable; its completion becomes `stale`
 * through the generation guard. Does not lift deletion suspension.
 */
export function clearAccountBootstrap(wallet: string): void {
  const normalized = normalizeWallet(wallet);
  if (normalized) {
    invalidate(normalized);
  }
}

/**
 * Blocks bootstrap for the current connected wallet from this moment on:
 * remounts, refetches, and stale request completions may not recreate the
 * account. Used while an account is being torn down.
 */
export function suspendAccountBootstrap(wallet: string): void {
  const normalized = normalizeWallet(wallet);
  if (normalized) {
    suspendedWallets.add(normalized);
    invalidate(normalized);
  }
}

/** Re-enables bootstrap for a genuinely new wallet session. */
export function resumeAccountBootstrap(wallet: string): void {
  suspendedWallets.delete(normalizeWallet(wallet));
}

export function isAccountBootstrapSuspended(
  wallet: string | null | undefined,
): boolean {
  return wallet ? suspendedWallets.has(normalizeWallet(wallet)) : false;
}

/** Clears all module-level coordinator state. Test isolation only. */
export function resetAccountBootstrapForTests(): void {
  suspendedWallets.clear();
  bootstrappedWallets.clear();
  inFlight.clear();
  generations.clear();
}
