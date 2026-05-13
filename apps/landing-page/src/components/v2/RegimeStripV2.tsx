'use client';

import { useEffect, useState } from 'react';
import { MESSAGES } from '@/config/messages';
import {
  fetchRegimeStrip,
  type RegimeStripData,
  type RegimeStripItem,
} from '@/lib/api/market';

type RegimeItemProps = {
  item: RegimeStripItem;
  loading: boolean;
};

function RegimeItem({ item, loading }: RegimeItemProps) {
  return (
    <div
      className={`regime-strip-item${loading ? ' is-loading' : ''}`}
      aria-busy={loading || undefined}
    >
      <span>{item.label}</span>
      <strong>{item.value}</strong>
      <small>{item.detail}</small>
    </div>
  );
}

export function RegimeStripV2() {
  const [data, setData] = useState<RegimeStripData | null>(null);
  const [loading, setLoading] = useState(true);

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

  const items = data?.items ?? MESSAGES.regimeTelemetry.items;
  const loadingFallback = loading && data === null;

  return (
    <section className="regime-strip-section" aria-label="Regime data">
      <div className="regime-strip-header">
        <span className="live-status">
          <span aria-hidden />
          {MESSAGES.regimeTelemetry.status}
        </span>
        <strong>Telemetry feeding the next bundle</strong>
      </div>
      <div className="regime-strip" aria-live="polite">
        {items.map((item) => (
          <RegimeItem key={item.label} item={item} loading={loadingFallback} />
        ))}
      </div>
    </section>
  );
}
