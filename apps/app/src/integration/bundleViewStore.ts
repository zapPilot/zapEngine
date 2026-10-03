import { useSyncExternalStore } from 'react';

import { getBundleViewUserId } from './bundleViewParam';

export interface BundleView {
  userId: string;
  matchedAddress: string | null;
}

let overridden = false;
let snapshot: BundleView | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): BundleView | null {
  if (!overridden) {
    const userId = getBundleViewUserId();
    if (snapshot?.userId !== userId) {
      snapshot = userId ? { userId, matchedAddress: null } : null;
    }
  }
  return snapshot;
}

export function setBundleView(view: BundleView | null): void {
  overridden = true;
  snapshot = view;
  listeners.forEach((listener) => listener());
}

export function subscribeBundleView(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useBundleView(): BundleView | null {
  return useSyncExternalStore(subscribeBundleView, getSnapshot, () => null);
}
