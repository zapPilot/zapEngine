import { BrandMark } from '@/components/BrandMark';
import { LINKS } from '@/config/links';
export function SiteFooter() {
  return (
    <footer className="zp-site-footer" data-theme="night">
      <div className="zp-wrap">
        <a className="zp-logo" href="#engine">
          <BrandMark />
        </a>
        <nav aria-label="Footer">
          <ul className="zp-fl">
            {[
              ['Docs', '/docs/'],
              ['Track record', '/track-record/'],
              ['GitHub', LINKS.social.github],
              ['Discord', LINKS.social.discord],
              ['X', LINKS.social.x],
              ['App Store', LINKS.downloads.appStore],
            ].map(([label, url]) => (
              <li key={label}>
                <a href={url}>{label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <p className="zp-footer-note">
          Zap Pilot is in development. Backtests are not a promise of future
          returns, and nothing here is investment advice.
        </p>
      </div>
    </footer>
  );
}
