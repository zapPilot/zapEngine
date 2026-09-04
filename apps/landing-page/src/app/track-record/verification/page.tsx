'use client';

import { useTrackRecord } from '@/hooks/useTrackRecord';
import { VerificationPanel } from '@/components/track-record/VerificationPanel';

export default function VerificationPage() {
  const state = useTrackRecord();

  return (
    <div className="track-record-verification">
      <h2>Verification</h2>

      <p className="verification-intro">
        The Zap Pilot track record is cryptographically verifiable. Each daily
        snapshot is pinned to IPFS with an immutable CID derived from its
        content. The CID chain links every snapshot to the previous one, forming
        a tamper-evident history. Optionally, snapshots are signed by the Zap
        Pilot official EOA.
      </p>

      {state.source === 'backtest' && (
        <div className="pending-banner" role="status">
          <p>
            <strong>Backtest mode</strong> — the checks below describe the
            committed backtest dataset, not a published on-chain snapshot.
            Switch to Live above for an independently verifiable record.
          </p>
        </div>
      )}

      <VerificationPanel state={state} />

      <section className="verification-methodology">
        <h3>Methodology</h3>
        <dl>
          <dt>Pricing time</dt>
          <dd>Daily valuation when the UTC snapshot workflow runs.</dd>
          <dt>Price source</dt>
          <dd>
            Spot USD token prices from LI.FI, keyed by chain ID and token
            address. Deterministic backfills/tests may supply an explicit price
            override in the snapshot tooling.
          </dd>
          <dt>LP token valuation</dt>
          <dd>
            Mark-to-market using underlying asset prices × LP share of pool
            reserves.
          </dd>
          <dt>Pendle PT valuation</dt>
          <dd>
            PT price from Pendle market oracle; accrued yield added separately.
          </dd>
          <dt>Unclaimed rewards</dt>
          <dd>Not included in NAV until claimed on-chain.</dd>
          <dt>Gas cost deduction</dt>
          <dd>
            Estimated gas used × fast gas price at execution time, in USD,
            deducted from NAV.
          </dd>
          <dt>Cross-chain aggregation</dt>
          <dd>
            All chain positions converted to USD using their recorded pricing
            source, summed per asset, then per pillar.
          </dd>
          <dt>Stablecoin handling</dt>
          <dd>
            Stablecoins use their live USD spot price instead of assuming a
            fixed 1.0 USD peg.
          </dd>
        </dl>
      </section>

      <section className="verification-cli">
        <h3>Full Verification (CLI)</h3>
        <p>
          The browser verifies CID chain linkage and signatures. For full
          content-hash verification and metric recomputation, use the CLI:
        </p>
        <pre>
          <code>pnpm track-record:verify</code>
        </pre>
        <p>
          This walks the full CID chain, validates schema, verifies signatures,
          recomputes performance metrics, and checks CID content hashes.
        </p>
      </section>
    </div>
  );
}
