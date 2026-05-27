'use client';

import { useEffect, useState } from 'react';
import { MESSAGES } from '@/config/messages';
import {
  fetchRegimeStrip,
  type RegimeStripData,
  type RegimeStripItem,
} from '@/lib/api/market';

const SKELETON_ITEM_KEYS = ['regime', 'fgi', 'dma'] as const;

type RegimeItemProps = {
  item: RegimeStripItem;
};

function RegimeItem({ item }: RegimeItemProps) {
  return (
    <div className="regime-strip-item">
      <span>{item.label}</span>
      <strong>{item.value}</strong>
      <small>{item.detail}</small>
    </div>
  );
}

function RegimeSkeletonItem() {
  return (
    <div className="regime-strip-item is-skeleton" aria-hidden="true">
      <span className="skeleton-bar skeleton-label" />
      <strong className="skeleton-bar skeleton-value" />
      <small className="skeleton-bar skeleton-detail" />
    </div>
  );
}

export function RegimeStrip() {
  const [data, setData] = useState<RegimeStripData | null>(null);
  const [loading, setLoading] = useState(true);
  const { regimeStrip } = MESSAGES;

  useEffect(() => {
    let cancelled = false;

    fetchRegimeStrip()
      .then((nextData) => {
        if (!cancelled) {
          setData(nextData);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const showSkeleton = loading || data === null;
  const liveItems = data?.items ?? [];

  return (
    <section
      className="regime-strip-section"
      aria-label={regimeStrip.ariaLabel}
    >
      <div className="regime-strip-header">
        <span className="live-status">
          {showSkeleton ? null : <span aria-hidden />}
          {showSkeleton ? regimeStrip.pendingStatus : regimeStrip.liveStatus}
        </span>
        <strong>{regimeStrip.header}</strong>
      </div>
      <div
        className="regime-strip"
        aria-live="polite"
        aria-busy={showSkeleton || undefined}
      >
        {showSkeleton
          ? SKELETON_ITEM_KEYS.map((key) => <RegimeSkeletonItem key={key} />)
          : liveItems.map((item) => (
              <RegimeItem key={item.label} item={item} />
            ))}
      </div>
    </section>
  );
}
