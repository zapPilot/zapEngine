import Link from 'next/link';
import { BrandMark } from '@/components/BrandMark';
import { LINKS } from '@/config/links';
export function SiteHeader() {
  return (
    <header className="zp-site-header" data-theme="paper">
      <div className="zp-wrap">
        <a className="zp-logo" href="#engine">
          <BrandMark />
        </a>
        <nav aria-label="Page">
          <a className="zp-hl" href="#engine">
            Runtime
          </a>
          <a className="zp-hl" href="#replay">
            Replay
          </a>
          <Link className="zp-hl zp-hide-sm" href="/docs/">
            Docs
          </Link>
          <a className="zp-hl zp-hide-sm" href={LINKS.social.github}>
            GitHub
          </a>
        </nav>
        <a className="zp-btn zp-btn-sign" href="#join">
          Join waitlist
        </a>
      </div>
      <span className="zp-navprog" aria-hidden="true" />
    </header>
  );
}
