'use client';

import Link from 'next/link';
import { useTrackRecord } from '@/hooks/useTrackRecord';
import { TrackRecordNav } from '@/components/track-record/TrackRecordNav';
import { BrandMark } from '@/components/landing/BrandMark';
import { MOCK_LATEST_CID } from '@/data/mock-track-record';

export default function TrackRecordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const state = useTrackRecord();

  const isDemo = state.meta?.latestSnapshotCid === MOCK_LATEST_CID;
  const hasLiveData = !isDemo && !!state.meta?.latestSnapshotCid;

  return (
    // `.shell-root` activates the landing CSS scoped under it (landing.css
    // defines every track-record rule as `.shell-root .track-record-*`).
    <div className="shell-root">
      <div className="track-record-shell">
        <header className="track-record-header">
          <Link className="brand" href="/" aria-label="Zap Pilot home">
            <BrandMark />
            <span className="brand-name">Zap Pilot</span>
          </Link>

          <nav className="track-record-breadcrumb" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden>›</span>
            <span>Track Record</span>
          </nav>

          {isDemo ? (
            <div className="pending-badge">Demo data</div>
          ) : hasLiveData ? (
            <div className="live-badge">
              <span className="live-dot" aria-hidden />
              Live
            </div>
          ) : (
            <div className="pending-badge">Pending first snapshot</div>
          )}
        </header>

        <TrackRecordNav />

        <main className="track-record-main">{children}</main>
      </div>
    </div>
  );
}
