import { ExternalLink } from 'lucide-react';
import { MESSAGES } from '@/config/messages';

export function ProtocolsV2() {
  return (
    <section className="v2-section protocols-v2" id="protocols">
      <div className="section-inner">
        <div className="section-kicker">Between trades</div>
        <h2>{MESSAGES.protocols.title}</h2>
        <p className="protocol-copy">{MESSAGES.protocols.subtitle}</p>

        <div className="protocol-chip-row" aria-label="Supported protocols">
          {MESSAGES.protocols.items.map((protocol) => (
            <a
              className="protocol-chip"
              key={protocol.name}
              href={protocol.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>{protocol.category}</span>
              <strong>{protocol.name}</strong>
              <ExternalLink aria-hidden />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
