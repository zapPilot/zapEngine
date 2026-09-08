import type { CostProvider } from '@zapengine/cost-observability';

import {
  type CostProviderResult,
  FLY_RUN_RATE_USAGE_KEY,
} from '../../shared/types.js';
import { costBasisLabel } from '../cost-basis.js';
import { integer, providerUsage, usd } from '../format.js';

/**
 * The usage counter each provider leads with. Every collector names its own
 * keys, so a shared guess ("monthly" or "monthly_units") silently blanked the
 * column for anyone who did not happen to use those two — Supabase and Fly
 * both read as "—" while reporting usage perfectly well.
 */
const PRIMARY_USAGE_KEY: Record<CostProvider, string> = {
  debank: 'monthly_units',
  fly: FLY_RUN_RATE_USAGE_KEY,
  openrouter: 'monthly',
  brave: 'monthly_requests',
  supabase: 'monthly_plan',
};

export function ProviderLedger(props: {
  providers: CostProviderResult[];
  detailed?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
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
              (item) => item.key === PRIMARY_USAGE_KEY[provider.provider],
            );
            return (
              <tr key={provider.provider}>
                <td className="cell-title">{provider.label}</td>
                <td className={`basis-${provider.costType}`}>
                  {costBasisLabel(provider.costType, provider.snapshot?.source)}
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
                  {primaryUsage ? (
                    <>
                      {providerUsage(primaryUsage.unit, primaryUsage.value)}
                      {/*
                        A run-rate sits in a money column next to real spend, so
                        it says so: it is what the fleet would cost at full load
                        for a whole month, not an amount anyone will be billed.
                      */}
                      {primaryUsage.key === FLY_RUN_RATE_USAGE_KEY ? (
                        <small className="usage-qualifier">run-rate</small>
                      ) : null}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className={`status-${provider.status}`}>
                  {statusLabel(provider.status)}
                  {/*
                    The one place an unpriced provider's remedy is spelled out.
                    The KPI band only names what it excluded; the sentence that
                    says how to close the gap lives here, beside the row it is
                    about.
                  */}
                  {provider.message ? (
                    <small className="provider-note">{provider.message}</small>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {props.providers.length === 0 ? (
        <div className="empty-inline">No providers configured.</div>
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

function statusLabel(value: CostProviderResult['status']): string {
  if (value === 'ok') {
    return 'Connected';
  }
  if (value === 'error') {
    return 'Needs attention';
  }
  return 'Not connected';
}
