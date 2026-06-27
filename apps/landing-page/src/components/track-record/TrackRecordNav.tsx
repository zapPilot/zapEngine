import Link from 'next/link';
import { TABS } from '@/config/track-record';

export function TrackRecordNav() {
  return (
    <nav className="track-record-nav" aria-label="Track record sections">
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
