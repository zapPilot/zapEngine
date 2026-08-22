import type { CostProviderResult } from '../../shared/types.js';
import { integer, providerUsage, usd } from '../format.js';

export function ProviderLedger(props: {
  providers: CostProviderResult[];
  detailed?: boolean;
}) {
  return (
    <div className="ledger-wrap">
      <table className="ledger-table">
        <thead>
          <tr>
            <th>Provider</th>
            <th>Cost basis</th>
            <th>Accrued</th>
            {props.detailed ? <th>Projected</th> : null}
            <th>Usage</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {props.providers.map((provider) => {
            const primaryUsage = provider.snapshot?.usage.find(
              (item) => item.key === 'monthly' || item.key === 'monthly_units',
            );
            return (
              <tr key={provider.provider}>
                <td className="provider-name">
                  <i className={`provider-mark ${provider.provider}`} />
                  {provider.label}
                </td>
                <td className={`basis-${provider.costType}`}>
                  {basisLabel(provider.costType)}
                </td>
                <td className="mono">
                  {usd(provider.snapshot?.accruedCostUsd)}
                </td>
                {props.detailed ? (
                  <td className="mono projected-text">
                    {usd(provider.snapshot?.projectedCostUsd)}
                  </td>
                ) : null}
                <td className="mono">
                  {primaryUsage
                    ? providerUsage(primaryUsage.unit, primaryUsage.value)
                    : '—'}
                </td>
                <td className={`status-${provider.status}`}>
                  {statusLabel(provider.status)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {props.providers.length === 0 ? (
        <div className="empty-row">No providers configured.</div>
      ) : null}
    </div>
  );
}

export function UsageSignals(props: { providers: CostProviderResult[] }) {
  const active = props.providers.filter((provider) => provider.snapshot);
  if (active.length === 0) {
    return (
      <div className="empty-inline">
        Add provider credentials on the server to see usage signals.
      </div>
    );
  }
  return (
    <div className="usage-signals">
      {active.map((provider) => (
        <section className="usage-provider" key={provider.provider}>
          <h3>{provider.label}</h3>
          {provider.snapshot!.usage.map((item) => (
            <div className="usage-row" key={item.key}>
              <span>{item.label}</span>
              <strong className="mono">
                {item.unit === 'usd' ? usd(item.value) : integer(item.value)}
              </strong>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function basisLabel(value: CostProviderResult['costType']): string {
  if (value === 'list-price-equivalent') {
    return 'List-price equivalent';
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function statusLabel(value: CostProviderResult['status']): string {
  if (value === 'ok') {
    return 'Connected';
  }
  if (value === 'error') {
    return 'Needs attention';
  }
  return 'Not connected';
}
