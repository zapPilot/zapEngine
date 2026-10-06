import { ProtocolIcon, TokenIcon } from '@/components/brand/icons';
import { StatusBadge } from '@/components/StatusBadge';
import { MESSAGES, type AdapterKey } from '@/config/messages';

const ADAPTER_ICONS: Record<AdapterKey, React.ReactNode> = {
  morpho: <ProtocolIcon protocol="morpho" size={26} />,
  'gmx-v2': <ProtocolIcon protocol="gmx-v2" size={26} />,
  hyperliquid: <ProtocolIcon protocol="hyperliquid" size={26} />,
  lifi: <ProtocolIcon protocol="LI.FI" size={26} />,
  'tokenized-sp500': <TokenIcon symbol="SPY" size={26} />,
};

export function Adapters() {
  const { adapters } = MESSAGES;
  return (
    <section
      id="adapters"
      className="zp-section"
      aria-labelledby="adapters-title"
    >
      <div className="zp-container zp-venues-container">
        <p className="zp-kicker">{adapters.kicker}</p>
        <h2 id="adapters-title" className="zp-h2">
          {adapters.title}
        </h2>
        <p className="zp-lede">{adapters.lede}</p>
        <div className="zp-venues">
          {adapters.cards.map((card) => (
            <article key={card.key} className="zp-venue">
              <div className="zp-venue-head">
                {ADAPTER_ICONS[card.key]}
                <h3 className="zp-venue-name">{card.name}</h3>
              </div>
              <div className="zp-venue-meta">
                <span className="zp-venue-tag">{card.tag}</span>
                <StatusBadge capability={card.capability} />
              </div>
              <p className="zp-venue-body">{card.text}</p>
            </article>
          ))}
        </div>
        <p className="zp-footnote zp-adapters-note">{adapters.note}</p>
      </div>
    </section>
  );
}
