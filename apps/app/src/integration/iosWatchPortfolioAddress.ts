import appKeyValueStorage from '@/storage/appKeyValueStorage.native';

const WATCH_PORTFOLIO_ADDRESS_KEY = 'ios.watchPortfolioAddress';

type WatchAddressListener = (address: string | null) => void;

const listeners = new Set<WatchAddressListener>();

function normalizeWatchAddress(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  return normalized || null;
}

export async function readIosWatchPortfolioAddress(): Promise<string | null> {
  return normalizeWatchAddress(
    await appKeyValueStorage.getItem(WATCH_PORTFOLIO_ADDRESS_KEY),
  );
}

export async function writeIosWatchPortfolioAddress(
  address: string | null,
): Promise<void> {
  const normalized = normalizeWatchAddress(address);
  await appKeyValueStorage.setItem(
    WATCH_PORTFOLIO_ADDRESS_KEY,
    normalized ?? '',
  );
  for (const listener of listeners) {
    listener(normalized);
  }
}

export function subscribeIosWatchPortfolioAddress(
  listener: WatchAddressListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
