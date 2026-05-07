/* eslint-disable @next/next/no-img-element -- Protocol logos are small local WebP assets with fixed dimensions. */
import type { CSSProperties } from 'react';
import { ExternalLink } from 'lucide-react';
import { MESSAGES } from '@/config/messages';
import { Section } from './primitives/Section';

type ProtocolCardStyle = CSSProperties & {
  '--protocol-accent': string;
  '--protocol-glow': string;
};

export function ProtocolsV2() {
  return (
    <Section id="protocols" className="protocols-v2" kicker="Between trades">
      <h2>{MESSAGES.protocols.title}</h2>
      <p className="protocol-copy">{MESSAGES.protocols.subtitle}</p>

      <div className="protocol-card-grid" aria-label="Supported protocols">
        {MESSAGES.protocols.items.map((protocol) => (
          <a
            className="protocol-card"
            key={protocol.name}
            href={protocol.link}
            target="_blank"
            rel="noopener noreferrer"
            style={
              {
                '--protocol-accent': protocol.accent,
                '--protocol-glow': protocol.glow,
              } as ProtocolCardStyle
            }
          >
            <span className="protocol-card-top">
              <span className="protocol-logo-shell" aria-hidden>
                <span className="protocol-logo-halo" />
                <img
                  src={protocol.logo}
                  alt={`${protocol.name} logo`}
                  width="64"
                  height="64"
                  loading="lazy"
                />
              </span>
              <ExternalLink aria-hidden />
            </span>
            <span className="protocol-category">{protocol.category}</span>
            <strong>{protocol.name}</strong>
            <span className="protocol-description">{protocol.description}</span>
          </a>
        ))}
      </div>
    </Section>
  );
}
