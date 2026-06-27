'use client';

import Link from 'next/link';
import { useTrackRecord } from '@/hooks/useTrackRecord';
import { MetricsRow } from '@/components/track-record/MetricsRow';
import { NavCurveChart } from '@/components/track-record/NavCurveChart';
import { Section } from '@/components/primitives/Section';

export default function TrackRecordPage() {
  const state = useTrackRecord();
  const { meta, latestSnapshot, summary, snapshots, isLoading, error } = state;

  const hasLiveData = !!meta?.latestSnapshotCid;

  return (
    <div className="track-record-page">
      {error && (
        <div className="track-record-error" role="alert">
          <p>Failed to load track record: {error}</p>
        </div>
      )}

      {!hasLiveData && !isLoading && (
        <div className="pending-banner" role="status">
          <p>
            <strong>Live tracking pending</strong> — first snapshot not yet
            committed. Showing backtest performance below.
          </p>
        </div>
      )}

      <section className="track-record-status">
        <div className="status-block">
          <p className="status-kicker">Strategy</p>
          <strong>{meta?.strategyId ?? '—'}</strong>
          <span>v{meta?.strategyVersion ?? '—'}</span>
        </div>
        <div className="status-block">
          <p className="status-kicker">Snapshots</p>
          <strong>{snapshots.length}</strong>
          <span>
            {snapshots.length > 0
              ? `${snapshots[0]!.date} → ${snapshots[snapshots.length - 1]!.date}`
              : 'No data'}
          </span>
        </div>
        {latestSnapshot && (
          <>
            <div className="status-block">
              <p className="status-kicker">Current NAV</p>
              <strong>${latestSnapshot.nav.usd}</strong>
              <span>{latestSnapshot.date}</span>
            </div>
            <div className="status-block">
              <p className="status-kicker">Cumulative Return</p>
              <strong>{latestSnapshot.performance.cumulativeReturn}</strong>
            </div>
          </>
        )}
      </section>

      {hasLiveData && <NavCurveChart snapshots={snapshots} />}

      {!hasLiveData && (
        <Section kicker="Backtest" title="Historical performance">
          <p className="no-live-notice">
            No live snapshots yet. The chart below shows backtested performance
            from {snapshots.length > 0 ? snapshots[0]!.date : '2024-12-02'} to{' '}
            {snapshots.length > 0
              ? snapshots[snapshots.length - 1]!.date
              : '2026-04-15'}
            .
          </p>
          {snapshots.length > 0 && <NavCurveChart snapshots={snapshots} />}
        </Section>
      )}

      <MetricsRow summary={summary} />

      <section className="model-wallets">
        <h3>Model Portfolio Wallets</h3>
        {latestSnapshot ? (
          <ul className="wallet-list">
            {latestSnapshot.walletAddresses.map((addr, i) => (
              <li key={addr}>
                <a
                  href={`https://etherscan.io/address/${addr}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {addr}
                </a>
                <span className="chain-badge">
                  chain {latestSnapshot.chainIds[i] ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="no-data-note">
            Live wallet addresses will appear here once the first snapshot is
            committed.
          </p>
        )}
      </section>

      <section className="backtest-vs-live">
        <h3>Backtest vs Live</h3>
        <p>
          Backtest covers 500 days (2024-12-02 → 2026-04-15). Live tracking
          began after first IPFS snapshot. Live results include actual gas
          costs, slippage, and protocol fees. Backtest uses estimated costs.
        </p>
        <p>
          <Link href="/docs/track-record/dma-fgi-portfolio-rules-v1">
            Read strategy methodology →
          </Link>
        </p>
      </section>
    </div>
  );
}
