import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';
import { LINKS } from '@/config/links';
import { MESSAGES } from '@/config/messages';

export function CTAV2() {
  return (
    <section className="v2-section cta-v2">
      <div className="cta-inner">
        <p className="cta-quote">
          “{MESSAGES.cta.title}
          <br />
          {MESSAGES.cta.titleSecondLine}”
        </p>
        <p>{MESSAGES.cta.subtitle}</p>
        <div className="cta-row center">
          <a
            className="btn btn-primary"
            href={LINKS.telegramBot}
            target="_blank"
            rel="noopener noreferrer"
          >
            {MESSAGES.cta.ctaPrimary}
            <ArrowRight aria-hidden />
          </a>
          <Link className="btn btn-ghost" href="/docs/">
            <BookOpen aria-hidden />
            {MESSAGES.cta.ctaSecondary}
          </Link>
        </div>
      </div>
    </section>
  );
}
