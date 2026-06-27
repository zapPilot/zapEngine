'use client';

import Link from 'next/link';
import { useTrackRecord } from '@/hooks/useTrackRecord';
import { TrackRecordNav } from '@/components/track-record/TrackRecordNav';
import { BrandMark } from '@/components/landing/BrandMark';

export default function TrackRecordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const state = useTrackRecord();

  return (
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

        {state.meta?.latestSnapshotCid ? (
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
  );
}
