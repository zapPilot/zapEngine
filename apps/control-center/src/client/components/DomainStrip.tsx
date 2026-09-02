import type {
  OperationalStatus,
  OperationsDomainSummary,
} from '../../shared/types.js';

const DOMAIN_LABELS: Record<string, string> = {
  customers: 'Customers',
  product: 'Product',
  costs: 'Costs',
  social: 'Social',
  jobs: 'Jobs',
  infra: 'Infra',
  errors: 'Errors',
  analytics: 'Analytics',
};

const STATUS_WORDS: Record<OperationalStatus, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  critical: 'Critical',
  unknown: 'Unconfigured',
};

/**
 * All eight domains, always — replaces the topology as L0 on Reliability.
 * An absent domain would read as "fine", so every cell renders regardless of
 * whether anything is wrong with it.
 */
export function DomainStrip(props: { domains: OperationsDomainSummary[] }) {
  return (
    <div className="domain-strip">
      {props.domains.map((domain) => (
        <div className={`domain-chip ${domain.status}`} key={domain.domain}>
          <div className="domain-chip-heading">
            <span>{DOMAIN_LABELS[domain.domain] ?? domain.domain}</span>
          </div>
          <strong>{STATUS_WORDS[domain.status]}</strong>
          <small>
            {domain.signalCount} signal{domain.signalCount === 1 ? '' : 's'}
          </small>
        </div>
      ))}
    </div>
  );
}
