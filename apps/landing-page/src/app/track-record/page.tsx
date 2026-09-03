'use client';

import Link from 'next/link';
import { ChainIdentity } from '@/components/brand/icons';
import { useTrackRecord } from '@/hooks/useTrackRecord';
import { MetricsRow } from '@/components/track-record/MetricsRow';
import { NavCurveChart } from '@/components/track-record/NavCurveChart';
import { Section } from '@/components/primitives/Section';
import equityCurve from '@/data/equity-curve.json';
import { hasLiveTrackRecordData } from '@/data/mock-track-record';

const BACKTEST_WINDOW = equityCurve.window;

export default function TrackRecordPage() {
  const state = useTrackRecord();
  const {
    meta,
    latestSnapshot,
    summary,
    snapshots,
    events,
    isLoading,
    error,
    source,
  } = state;

  const hasLiveData = source === 'live' && hasLiveTrackRecordData(meta);

  return (
    <div className="track-record-page">
      {error && (
        <div className="track-record-error" role="alert">
          <p>
            Failed to load {source === 'live' ? 'live ' : ''}track record: {error}
          </p>
        </div>
      )}

      {source === 'backtest' && !isLoading && (
        <div className="pending-banner" role="status">
          <p>
            <strong>Backtest mode</strong> — showing historical strategy results.
            Switch to Live above to load published IPFS snapshots.
          </p>
        </div>
      )}

      {source === 'live' && !hasLiveData && !isLoading && !error && (
        <div className="pending-banner" role="status">
          <p>
            <strong>Live tracking unavailable</strong> — no published snapshot is
            currently available.
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

      {hasLiveData && <NavCurveChart snapshots={snapshots} events={events} />}

      {source === 'backtest' && (
        <Section kicker="Backtest" title="Historical performance">
          <p className="no-live-notice">
            The chart below shows backtested performance from{' '}
            {snapshots.length > 0 ? snapshots[0]!.date : BACKTEST_WINDOW.start} to{' '}
            {snapshots.length > 0
              ? snapshots[snapshots.length - 1]!.date
              : BACKTEST_WINDOW.end}
            .
          </p>
          {snapshots.length > 0 && (
            <NavCurveChart snapshots={snapshots} events={events} />
          )}
        </Section>
      )}

      <MetricsRow summary={summary} />

      <section className="model-wallets">
        <h3>Model Portfolio Wallets</h3>
        {hasLiveData && latestSnapshot ? (
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
                  {latestSnapshot.chainIds[i] === undefined ? (
                    'chain —'
                  ) : (
                    <ChainIdentity
                      chainId={latestSnapshot.chainIds[i]}
                      size={12}
                      unknownPrefix="chain "
                    />
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="no-data-note">
            {source === 'backtest'
              ? 'Wallet addresses are only shown in Live mode.'
              : 'Live wallet addresses are unavailable.'}
          </p>
        )}
      </section>

      <section className="backtest-vs-live">
        <h3>Backtest vs Live</h3>
        <p>
          Backtest covers {BACKTEST_WINDOW.days} days ({BACKTEST_WINDOW.start} →{' '}
          {BACKTEST_WINDOW.end}). Live tracking began after first IPFS snapshot.
          Live results include actual gas costs, slippage, and protocol fees.
          Backtest uses estimated costs.
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
