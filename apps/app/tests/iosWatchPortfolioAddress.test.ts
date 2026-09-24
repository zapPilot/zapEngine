import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readIosWatchPortfolioAddress,
  subscribeIosWatchPortfolioAddress,
  writeIosWatchPortfolioAddress,
} from '@/integration/iosWatchPortfolioAddress';

const asyncStorageMock = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: asyncStorageMock,
}));

const WATCH_KEY = 'ios.watchPortfolioAddress';

beforeEach(() => {
  vi.clearAllMocks();
  asyncStorageMock.getItem.mockResolvedValue(null);
  asyncStorageMock.setItem.mockResolvedValue(undefined);
});

describe('iosWatchPortfolioAddress', () => {
  it('normalizes the stored address on read', async () => {
    asyncStorageMock.getItem.mockResolvedValueOnce('  0xAbC123  ');
    await expect(readIosWatchPortfolioAddress()).resolves.toBe('0xabc123');
    expect(asyncStorageMock.getItem).toHaveBeenCalledWith(WATCH_KEY);
  });

  it('returns null for missing or blank stored values', async () => {
    asyncStorageMock.getItem.mockResolvedValueOnce(null);
    await expect(readIosWatchPortfolioAddress()).resolves.toBeNull();

    asyncStorageMock.getItem.mockResolvedValueOnce('');
    await expect(readIosWatchPortfolioAddress()).resolves.toBeNull();

    asyncStorageMock.getItem.mockResolvedValueOnce('   ');
    await expect(readIosWatchPortfolioAddress()).resolves.toBeNull();
  });

  it('writes the normalized address and notifies subscribers', async () => {
    const seen: (string | null)[] = [];
    const unsubscribe = subscribeIosWatchPortfolioAddress((address) => {
      seen.push(address);
    });
    try {
      await writeIosWatchPortfolioAddress('  0xDeF456  ');

      expect(asyncStorageMock.setItem).toHaveBeenCalledWith(
        WATCH_KEY,
        '0xdef456',
      );
      expect(seen).toEqual(['0xdef456']);
    } finally {
      unsubscribe();
    }
  });

  it('writes null as empty storage and notifies with null', async () => {
    const seen: (string | null)[] = [];
    const unsubscribe = subscribeIosWatchPortfolioAddress((address) => {
      seen.push(address);
    });
    try {
      await writeIosWatchPortfolioAddress(null);

      expect(asyncStorageMock.setItem).toHaveBeenCalledWith(WATCH_KEY, '');
      expect(seen).toEqual([null]);
    } finally {
      unsubscribe();
    }
  });

  it('stops notifying after unsubscribe and supports multiple listeners', async () => {
    const first: (string | null)[] = [];
    const second: (string | null)[] = [];
    const unsubscribeFirst = subscribeIosWatchPortfolioAddress((address) => {
      first.push(address);
    });
    const unsubscribeSecond = subscribeIosWatchPortfolioAddress((address) => {
      second.push(address);
    });

    await writeIosWatchPortfolioAddress('0xabc');
    expect(first).toEqual(['0xabc']);
    expect(second).toEqual(['0xabc']);

    unsubscribeFirst();
    await writeIosWatchPortfolioAddress('0xdef');
    expect(first).toEqual(['0xabc']);
    expect(second).toEqual(['0xabc', '0xdef']);

    unsubscribeSecond();
    await writeIosWatchPortfolioAddress('0xghi');
    expect(first).toEqual(['0xabc']);
    expect(second).toEqual(['0xabc', '0xdef']);
  });
});
