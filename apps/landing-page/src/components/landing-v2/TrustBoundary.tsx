import { StatusBadge } from '@/components/StatusBadge';
import { MESSAGES } from '@/config/messages';

/** The five wallet-boundary guarantees, shared by the home page and /pitch. */
export function GuaranteeList({ className }: { className: string }) {
  return (
    <ul className={className}>
      {MESSAGES.trust.guarantees.map((item) => (
        <li key={item.title}>
          <StatusBadge capability={item.capability} />
          <span>
            <strong>{item.title}</strong> <span>{item.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TrustBoundary() {
  const { trust } = MESSAGES;
  return (
    <section
      id="trust"
      className="zp-section zp-section-alt"
      aria-labelledby="trust-title"
    >
      <div className="zp-container zp-trust">
        <div>
          <p className="zp-kicker">{trust.kicker}</p>
          <h2 id="trust-title" className="zp-h2">
            {trust.title}
          </h2>
          <p className="zp-lede">{trust.lede}</p>
          <GuaranteeList className="zp-trust-list" />
        </div>
        <div
          className="zp-bundle"
          role="group"
          aria-label={trust.mock.ariaLabel}
        >
          <div className="zp-bundle-head">
            <p className="zp-bundle-kicker">{trust.mock.title}</p>
            <span className="zp-bundle-tag">{trust.mock.tag}</span>
          </div>
          <dl className="zp-bundle-rows">
            {trust.mock.rows.map((row) => (
              <div key={row.label} className="zp-bundle-row">
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          <div className="zp-bundle-sign" aria-hidden>
            {trust.mock.action}
          </div>
          <p className="zp-bundle-footnote">{trust.mock.footnote}</p>
        </div>
      </div>
    </section>
  );
}
