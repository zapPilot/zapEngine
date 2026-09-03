import type { CostSource, CostType } from '@zapengine/cost-observability';
import { humanizeSlug } from '@zapengine/types/shared';

import type {
  CostHistoryProviderPoint,
  CostProviderResult,
} from '../shared/types.js';

/**
 * One vocabulary for "how do we know this number", shared by every surface
 * that prints a cost so the ledger and the chart cannot drift apart.
 *
 * `Estimated` on its own is not a readable basis. The same cost type covers a
 * real billed amount an operator read off a provider dashboard and typed in,
 * and a full-month list-price ceiling derived from one instantaneous snapshot
 * of running infrastructure — a $67.70 saturation figure standing in for a $14
 * invoice is exactly the failure this vocabulary exists to prevent. Only the
 * snapshot's source separates the two, so the label carries it.
 */
export function costBasisLabel(
  costType: CostType,
  source?: CostSource,
): string {
  if (costType === 'list-price-equivalent') {
    return 'List-price equivalent';
  }
  if (costType === 'estimated') {
    return source === 'manual' ? 'Estimated · manual' : 'Estimated · run-rate';
  }
  return humanizeSlug(costType);
}

/**
 * A provider the headline totals cannot include.
 *
 * `qualifier` is the few words a tooltip or a KPI caption can spare for what
 * we hold instead of a bill. `reason` is the provider's own message, and it is
 * the only place the situations are actually told apart: a run-rate with no
 * invoice behind it, prepaid units with no price, a provider that was never
 * connected, and a recorded figure belonging to an earlier month all arrive
 * here as the same thing — no amount — and an operator acts differently on
 * each. The collector knows which one it is; this file must not guess.
 */
export interface ExcludedProvider {
  label: string;
  qualifier: string;
  reason: string | null;
}

/**
 * No snapshot at all is a different omission from an unpriced one: nothing has
 * been collected or recorded for the provider, so there is not even a run-rate
 * standing behind the gap.
 */
const NO_SNAPSHOT_QUALIFIER = 'nothing recorded';

/**
 * Every provider in the roster that contributes no amount to the headline
 * totals.
 *
 * A missing snapshot counts. `FLY_COST_MODE` defaults to `manual`, so on a
 * dashboard where nobody has run the collector or recorded a figure Fly has no
 * snapshot at all; calling that "absent, not excluded" is how the $67.70 came
 * back as an unannounced gap rather than an announced one. Accrued and
 * projected are tested together because this one list qualifies both totals,
 * and a collector that cannot price a provider nulls the pair.
 */
export function excludedProviders(
  providers: readonly CostProviderResult[],
): ExcludedProvider[] {
  return providers.flatMap((provider) => {
    const snapshot = provider.snapshot;
    if (
      snapshot &&
      snapshot.accruedCostUsd !== null &&
      snapshot.projectedCostUsd !== null
    ) {
      return [];
    }
    return [
      {
        label: provider.label,
        qualifier: snapshot
          ? unpricedQualifier(provider.costType)
          : NO_SNAPSHOT_QUALIFIER,
        reason: provider.message,
      },
    ];
  });
}

/**
 * The same rule inside one persisted day. A daily row exists only because a
 * snapshot was written, so the only reason it can be excluded is that its
 * amount is unknown, and the row carries no message to explain it further.
 */
export function excludedDailyProviders(
  points: readonly CostHistoryProviderPoint[],
): ExcludedProvider[] {
  return points.flatMap((point) =>
    point.accruedCostUsd === null
      ? [
          {
            label: point.label,
            qualifier: unpricedQualifier(point.costType),
            reason: null,
          },
        ]
      : [],
  );
}

/**
 * The single line a tooltip or a KPI tile spends on excluded providers: it
 * names them instead of letting the total quietly shrink, and the qualifier
 * says what we hold in place of a bill.
 */
export function excludedNote(
  entries: readonly ExcludedProvider[],
): string | null {
  if (entries.length === 0) {
    return null;
  }
  // Grouped by qualifier rather than repeated after every name: a roster where
  // nothing has been collected would otherwise print the same parenthetical
  // once per provider in a line meant to be read at a glance.
  const byQualifier = new Map<string, string[]>();
  for (const entry of entries) {
    const labels = byQualifier.get(entry.qualifier) ?? [];
    labels.push(entry.label);
    byQualifier.set(entry.qualifier, labels);
  }
  const groups = [...byQualifier].map(
    ([qualifier, labels]) => `${labels.join(', ')} (${qualifier})`,
  );
  return `Excluded: ${groups.join('; ')}`;
}

/**
 * The long form, one line per provider, for a caption with room for it. It
 * carries the provider's own message verbatim because that message says what
 * an operator has to run to turn the gap into a figure, and a phrase rebuilt
 * here would drift from it.
 */
/**
 * What a headline total says about the providers it leaves out: the name and
 * the short reason, nothing more. The provider's full `message` carries the
 * command that closes the gap, which is an instruction to act on rather than a
 * figure to read past — it belongs in the provider ledger, where an operator
 * goes to do something, not wrapped across four lines of a KPI caption.
 */
export function exclusionNotes(
  providers: readonly CostProviderResult[],
): string[] {
  return excludedProviders(providers).map(
    (item) => `Excludes ${item.label} (${item.qualifier})`,
  );
}

function unpricedQualifier(costType: CostType): string {
  return costType === 'estimated' ? 'run-rate only' : 'cost unknown';
}
