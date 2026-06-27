import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import type { TrackRecordState } from '@/hooks/useTrackRecord';
import { IPFS_GATEWAYS } from '@/config/track-record';

interface VerificationPanelProps {
  state: TrackRecordState;
  className?: string;
}

export function VerificationPanel({
  state,
  className,
}: VerificationPanelProps) {
  const { meta, snapshotEntries, verification, latestSnapshot } = state;

  if (state.isLoading) {
    return (
      <div className={`verification-panel-loading ${className ?? ''}`}>
        <p>Loading verification data…</p>
      </div>
    );
  }

  const hasLiveData = !!meta?.latestSnapshotCid;

  return (
    <div className={`verification-panel ${className ?? ''}`}>
      <section className="verification-section">
        <h3>CID Chain Linkage</h3>
        <div className="verification-items">
          <div className="verification-item">
            {verification.chainValid ? (
              <CheckCircle aria-hidden />
            ) : (
              <XCircle aria-hidden />
            )}
            <span>
              {verification.chainValid ? 'Valid' : 'Broken at snapshot '}
              {verification.chainBrokenAt}
            </span>
          </div>
          <div className="verification-item">
            <span>Total snapshots in chain: {verification.totalSnapshots}</span>
          </div>
        </div>
      </section>

      <section className="verification-section">
        <h3>Signature</h3>
        <div className="verification-items">
          <div className="verification-item">
            {verification.signatureValid ? (
              <CheckCircle aria-hidden />
            ) : latestSnapshot?.signature ? (
              <XCircle aria-hidden />
            ) : (
              <AlertCircle aria-hidden />
            )}
            <span>
              {latestSnapshot?.signature
                ? verification.signatureValid
                  ? `Valid — recovered signer: ${verification.signature?.recoveredSigner ?? latestSnapshot.signature.signer}`
                  : `Invalid — ${verification.signature?.reason ?? 'signature check failed'}`
                : 'No signature (v0 — optional)'}
            </span>
          </div>
          {latestSnapshot?.signature && (
            <>
              <div className="verification-item">
                <span>
                  Message hash:{' '}
                  {verification.signature?.messageHashValid === false
                    ? 'mismatch'
                    : 'verified'}
                </span>
              </div>
              {verification.signature?.computedMessageHash && (
                <div className="verification-item">
                  <span>
                    Computed hash:{' '}
                    {verification.signature.computedMessageHash.slice(0, 18)}…
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section className="verification-section">
        <h3>Schema</h3>
        <div className="verification-items">
          <div className="verification-item">
            <CheckCircle aria-hidden />
            <span>DailySnapshotSchema v{meta?.schemaVersion ?? 'unknown'}</span>
          </div>
        </div>
      </section>

      <section className="verification-section">
        <h3>Performance recomputation</h3>
        <div className="verification-items">
          <div className="verification-item">
            {verification.performanceValid ? (
              <CheckCircle aria-hidden />
            ) : (
              <XCircle aria-hidden />
            )}
            <span>
              {verification.performanceValid
                ? 'PASS — returns, drawdown, volatility and ratios match snapshot data'
                : `FAIL — ${verification.performanceErrors[0] ?? 'performance mismatch'}`}
            </span>
          </div>
        </div>
      </section>

      <section className="verification-section">
        <h3>Latest Snapshot</h3>
        <div className="verification-items">
          {hasLiveData ? (
            <>
              <div className="verification-item">
                <CheckCircle aria-hidden />
                <span>CID: {meta!.latestSnapshotCid}</span>
              </div>
              {IPFS_GATEWAYS.map((gw) => (
                <div className="verification-item" key={gw}>
                  <a
                    href={`${gw}/${meta!.latestSnapshotCid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {gw}/ipfs/{meta!.latestSnapshotCid.slice(0, 16)}…
                  </a>
                </div>
              ))}
            </>
          ) : (
            <div className="verification-item">
              <AlertCircle aria-hidden />
              <span>No live snapshot yet</span>
            </div>
          )}
        </div>
      </section>

      {hasLiveData && (
        <section className="verification-section">
          <h3>Full Chain Snapshots</h3>
          <ul className="snapshot-cid-list">
            {snapshotEntries.slice(-10).map((entry) => (
              <li key={entry.cid}>
                <span className="cid-date">{entry.snapshot.date}</span>
                <span className="cid-value">{entry.cid.slice(0, 16)}…</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
