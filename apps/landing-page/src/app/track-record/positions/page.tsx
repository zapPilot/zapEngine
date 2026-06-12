'use client';

import { useTrackRecord } from '@/hooks/useTrackRecord';
import { PositionsTable } from '@/components/track-record/PositionsTable';

export default function PositionsPage() {
  const state = useTrackRecord();
  const { latestSnapshot, positions, isLoading } = state;

  if (isLoading) {
    return (
      <div className="track-record-loading">
        <p>Loading positions…</p>
      </div>
    );
  }

  return (
    <div className="track-record-positions">
      <h2>Positions</h2>

      {latestSnapshot && (
        <p className="positions-meta">
          As of {latestSnapshot.date} · NAV: ${latestSnapshot.nav.usd}
        </p>
      )}

      <PositionsTable positions={positions} />

      {latestSnapshot && latestSnapshot.positions.length > 0 && (
        <section className="positions-legend">
          <h3>Position Details</h3>
          {latestSnapshot.positions.map((pos, i) => (
            <article className="position-detail" key={i}>
              <div className="pos-detail-header">
                <strong>{pos.asset}</strong>
                <span>{pos.protocol}</span>
                <span>Chain {pos.chainId}</span>
              </div>
              <dl className="pos-detail-grid">
                <div>
                  <dt>Token Address</dt>
                  <dd>{pos.tokenAddress ?? 'N/A'}</dd>
                </div>
                <div>
                  <dt>Amount</dt>
                  <dd>{pos.amount}</dd>
                </div>
                <div>
                  <dt>Value USD</dt>
                  <dd>${pos.valueUsd}</dd>
                </div>
                <div>
                  <dt>Weight</dt>
                  <dd>{pos.weight}</dd>
                </div>
                <div>
                  <dt>Pricing Source</dt>
                  <dd>{pos.pricingSource}</dd>
                </div>
              </dl>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
