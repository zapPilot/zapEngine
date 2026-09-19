'use client';

import { useEffect } from 'react';
import { LINKS } from '@/config/links';
import { trackDiscordCtaClicked } from '@/lib/analytics/events';

export function DiscordRedirect() {
  useEffect(() => {
    const timer = setTimeout(() => {
      trackDiscordCtaClicked('redirect', false, { beacon: true });
      window.location.replace(LINKS.social.discord);
    }, 600);
    return () => clearTimeout(timer);
  }, []);
  return (
    <main className="zp-root">
      <div className="zp-container">
        <h1 className="zp-h2">Taking you to the Discord…</h1>
        <p className="zp-lede">Meet the Zap Pilot community.</p>
        <a className="zp-btn zp-btn-primary" href={LINKS.social.discord}>
          Continue to Discord
        </a>
      </div>
    </main>
  );
}
