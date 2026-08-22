'use client';

import {
  ChainIdentity,
  ProtocolIcon,
  TokenIcon,
} from '@/components/brand/icons';
import { useTrackRecord } from '@/hooks/useTrackRecord';
import { PositionsTable } from '@/components/track-record/PositionsTable';
import { TrackRecordLoading } from '@/components/track-record/TrackRecordLoading';

export default function PositionsPage() {
  const state = useTrackRecord();
  const { latestSnapshot, positions, isLoading } = state;

  if (isLoading) {
    return <TrackRecordLoading label="Loading positions…" />;
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
                <strong className="asset-name">
                  <TokenIcon symbol={pos.asset} size={18} />
                  {pos.asset}
                </strong>
                <span className="asset-name">
                  <ProtocolIcon protocol={pos.protocol} size={16} />
                  {pos.protocol}
                </span>
                <ChainIdentity chainId={pos.chainId} unknownPrefix="Chain " />
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
