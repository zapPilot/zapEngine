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
  const { meta, snapshots, verification, latestSnapshot } = state;

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
                ? `Valid — signer: ${latestSnapshot.signature.signer}`
                : 'No signature (v0 — optional)'}
            </span>
          </div>
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
            {snapshots.slice(-10).map((snap) => (
              <li key={snap.previousCid ?? 'genesis'}>
                <span className="cid-date">{snap.date}</span>
                <span className="cid-value">
                  {snap.previousCid
                    ? `${snap.previousCid.slice(0, 16)}…`
                    : '(genesis)'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
