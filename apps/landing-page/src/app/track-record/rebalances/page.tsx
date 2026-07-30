'use client';

import { useTrackRecord } from '@/hooks/useTrackRecord';
import { RebalanceTable } from '@/components/track-record/RebalanceTable';
import { TrackRecordLoading } from '@/components/track-record/TrackRecordLoading';
import { hasRebalance } from '@/components/track-record/rebalance';
import { IPFS_GATEWAYS, ipfsGatewayUrl } from '@/config/track-record';

export default function RebalancesPage() {
  const state = useTrackRecord();
  const { snapshots, isLoading } = state;

  if (isLoading) {
    return <TrackRecordLoading label="Loading rebalance data…" />;
  }

  const rebalances = snapshots.filter(hasRebalance);

  return (
    <div className="track-record-rebalances">
      <h2>Rebalances</h2>

      <p className="rebalances-meta">
        {rebalances.length === 0
          ? 'No rebalances recorded yet.'
          : `${rebalances.length} rebalance${rebalances.length === 1 ? '' : 's'} found.`}
      </p>

      <RebalanceTable snapshots={snapshots} />

      {snapshots.length > 0 && snapshots[0]!.rebalanceLogCids && (
        <section className="rebalance-log-links">
          <h3>Rebalance Log CIDs</h3>
          <ul>
            {snapshots.flatMap((s) =>
              (s.rebalanceLogCids ?? []).map((cid) => (
                <li key={cid}>
                  <a
                    href={ipfsGatewayUrl(IPFS_GATEWAYS[0], cid)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {cid}
                  </a>
                </li>
              )),
            )}
          </ul>
        </section>
      )}

      <section className="rebalance-methodology">
        <h3>Methodology</h3>
        <dl>
          <dt>Pricing time</dt>
          <dd>Daily valuation at 00:00 UTC.</dd>
          <dt>Price oracle</dt>
          <dd>
            Chainlink or equivalent price feed; stale price {'\u003e'}1h
            triggers fallback.
          </dd>
          <dt>Gas cost deduction</dt>
          <dd>
            Estimated gas used × fast gas price at execution time, in USD.
          </dd>
          <dt>Slippage estimate</dt>
          <dd>0.5% for liquidity above $100k; 1% otherwise.</dd>
        </dl>
      </section>
    </div>
  );
}
