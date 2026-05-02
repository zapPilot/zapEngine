'use client';

import { ArrowRight, Clock3 } from 'lucide-react';
import { useRef } from 'react';
import { LINKS } from '@/config/links';
import { MESSAGES } from '@/config/messages';
import HeroLiquidMetalCanvas from './HeroLiquidMetalCanvas.client';

const HERO_PILLARS = [
  {
    className: 'spy',
    name: 'S&P 500',
    tag: 'Risk-on · equities',
  },
  {
    className: 'btc',
    name: 'BTC / ETH',
    tag: 'Crypto · beta',
  },
  {
    className: 'usd',
    name: 'Stablecoins',
    tag: 'Defensive · yield',
  },
] as const;

export function HeroV2() {
  const heroRef = useRef<HTMLElement | null>(null);

  return (
    <section className="hero" ref={heroRef}>
      <div className="hero-left">
        <div className="eyebrow">
          <span className="dot" aria-hidden />
          <span>Non-custodial · Self-directed · Live on mainnet</span>
        </div>

        <h1 className="hero-title">
          The{' '}
          <em>
            Non-Custodial
            <br />
            BlackRock
          </em>{' '}
          in <span className="accent-block">Your Wallet.</span>
        </h1>

        <p className="hero-sub">{MESSAGES.hero.subtitle}</p>

        <div className="cta-row" aria-label="Primary actions">
          <a
            className="btn btn-primary"
            href={LINKS.telegramBot}
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

        <div className="pillars" id="strategy">
          {HERO_PILLARS.map((pillar) => (
            <div key={pillar.name} className={`pillar ${pillar.className}`}>
              <div className="p-icon" aria-hidden />
              <div className="p-name">{pillar.name}</div>
              <div className="p-tag">{pillar.tag}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="hero-visual" aria-label="Liquid metal allocation scene">
        <HeroLiquidMetalCanvas heroRef={heroRef} />
      </div>

      <div className="regime-ribbon" aria-label="Current regime snapshot">
        <span className="pulse" aria-hidden />
        <span>Regime</span>
        <span className="v">Risk-On</span>
        <span className="sep">·</span>
        <span>FGI</span>
        <span className="v">72</span>
        <span className="sep">·</span>
        <span>200MA</span>
        <span className="v">+14.2%</span>
        <span className="sep">·</span>
        <span>Live</span>
      </div>
    </section>
  );
}
