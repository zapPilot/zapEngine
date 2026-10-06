'use client';
import { useSyncExternalStore } from 'react';
import { DOWNLOAD_AVAILABILITY, LINKS } from '@/config/links';
import { MESSAGES } from '@/config/messages';
import { trackDownloadCtaClicked } from '@/lib/analytics/events';
import {
  detectDownloadPlatform,
  resolveDownloadOptions,
  type DownloadPlatform,
  type DownloadTarget,
} from '@/lib/download-platform';
import { AppCtaLink } from './AppCtaLink';
const subscribe = () => () => {};
const serverSnapshot = (): DownloadPlatform => 'other';
const clientSnapshot = () =>
  detectDownloadPlatform({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    userAgentDataPlatform: (
      navigator as Navigator & { userAgentData?: { platform?: string } }
    ).userAgentData?.platform,
  });
export function DownloadCta() {
  const platform = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );
  const { primary, all } = resolveDownloadOptions(
    platform,
    DOWNLOAD_AVAILABILITY,
  );
  const link = (target: DownloadTarget, className?: string) => (
    <a
      key={target}
      href={LINKS.downloads[target]}
      className={className}
      onClick={() =>
        trackDownloadCtaClicked({ location: 'hero', platform, target })
      }
    >
      {MESSAGES.download[target]}
      {target === 'mac' ? ` · ${MESSAGES.download.macRequirement}` : ''}
      {target === 'appStore' ? ` · ${MESSAGES.download.appStoreNote}` : ''}
    </a>
  );
  return (
    <>
      {primary ? link(primary, 'zp-btn zp-btn-primary') : null}
      <AppCtaLink
        className={`zp-btn ${primary ? 'zp-btn-ghost' : 'zp-btn-primary'}`}
        location="hero"
      >
        {MESSAGES.download.waitlist} <span aria-hidden>→</span>
      </AppCtaLink>
      {all.length ? (
        <div aria-label={MESSAGES.download.all}>
          {all.map((target) => link(target))}
        </div>
      ) : null}
    </>
  );
}
