import { LINKS } from '@/config/links';

export function Footer() {
  return (
    <footer className="zp-footer">
      <div className="zp-footer-inner">
        <div className="zp-footer-items">
          <span>100% self-custody · EOA</span>
          <span className="zp-footer-live">
            <span className="zp-dot zp-dot-sm" aria-hidden />
            Live on mainnet
          </span>
          <a
            href={LINKS.social.github}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open-source strategy
          </a>
        </div>
        <span className="zp-footer-brand">Zap Pilot</span>
      </div>
    </footer>
  );
}
