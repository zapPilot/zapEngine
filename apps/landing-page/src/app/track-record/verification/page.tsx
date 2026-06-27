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

      <VerificationPanel state={state} />

      <section className="verification-methodology">
        <h3>Methodology</h3>
        <dl>
          <dt>Pricing time</dt>
          <dd>
            Daily valuation at 00:00 UTC using Chainlink or equivalent oracle.
          </dd>
          <dt>Price oracle source</dt>
          <dd>
            Primary: Chainlink price feeds. Fallback: last known price, flagged
            in snapshot.
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
            All chain positions converted to USD using oracle prices, summed per
            asset, then per pillar.
          </dd>
          <dt>Stablecoin depeg handling</dt>
          <dd>
            Stablecoin positions valued at 1.0 USD unless oracle reports
            deviation {'\u003e'}0.5%, in which case the oracle price is used.
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
