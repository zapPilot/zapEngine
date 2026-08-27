import { LINKS } from '@/config/links';
import { AppCtaLink } from './AppCtaLink';

export function ClosingCta() {
  return (
    <section className="zp-section" aria-label="Closing call to action">
      <div className="zp-closing">
        <p className="zp-closing-quote">
          “The goal isn’t to trade more;
          <br />
          it’s to trade right.”
        </p>
        <p className="zp-closing-sub">
          A rules engine watches the regime, builds the rebalance, and hands
          your account a single signature. Custody never leaves your wallet.
        </p>
        <div className="zp-closing-ctas">
          {/* jscpd:ignore-start — CTA button pair, intentionally consistent styling across landing sections */}
          <AppCtaLink className="zp-btn zp-btn-primary" location="closing">
            Open the app <span aria-hidden>→</span>
          </AppCtaLink>
          <a
            className="zp-btn zp-btn-ghost"
            href={LINKS.social.github}
            target="_blank"
            rel="noopener noreferrer"
          >
            Read the strategy
          </a>
          {/* jscpd:ignore-end */}
        </div>
      </div>
    </section>
  );
}
