'use client';

import { useTrackRecord } from '@/hooks/useTrackRecord';
import { RebalanceTable } from '@/components/track-record/RebalanceTable';

export default function RebalancesPage() {
  const state = useTrackRecord();
  const { snapshots, isLoading } = state;

  if (isLoading) {
    return (
      <div className="track-record-loading">
        <p>Loading rebalance data…</p>
      </div>
    );
  }

  const rebalances = snapshots.filter((s) =>
    s.transactions.some((t) => t.type === 'rebalance'),
  );

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
                    href={`https://ipfs.io/ipfs/${cid}`}
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
