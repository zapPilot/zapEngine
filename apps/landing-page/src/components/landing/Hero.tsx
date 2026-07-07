'use client';

import { ArrowRight, Clock3 } from 'lucide-react';
import { useRef } from 'react';
import { LINKS } from '@/config/links';
import { MESSAGES } from '@/config/messages';
import HeroLiquidMetalCanvas from './HeroLiquidMetalCanvas.client';
import { HeroAccountCard } from './HeroAccountCard';

const HERO_DEFAULT_REGIME = 'neutral' as const;

export function Hero() {
  const heroRef = useRef<HTMLElement | null>(null);

  return (
    <section className="hero" ref={heroRef}>
      <div className="hero-left">
        <div className="eyebrow">
          <span className="dot" aria-hidden />
          <span>Non-custodial · Portfolio account · Live on mainnet</span>
        </div>

        <h1 className="hero-title">{MESSAGES.hero.title.primary}</h1>

        <p className="hero-sub">{MESSAGES.hero.subtitle}</p>

        <div className="cta-row" aria-label="Primary actions">
          <a
            className="btn btn-primary"
            href={LINKS.app}
            target="_blank"
            rel="noopener noreferrer"
          >
            {MESSAGES.hero.ctaPrimary}
            <ArrowRight aria-hidden />
          </a>
          <a className="btn btn-ghost" href="#proof">
            <Clock3 aria-hidden />
            {MESSAGES.hero.ctaSecondary}
          </a>
        </div>
      </div>

      <div className="hero-visual" aria-label="Liquid metal allocation scene">
        <HeroLiquidMetalCanvas heroRef={heroRef} regime={HERO_DEFAULT_REGIME} />
        <HeroAccountCard />
      </div>
    </section>
  );
}
