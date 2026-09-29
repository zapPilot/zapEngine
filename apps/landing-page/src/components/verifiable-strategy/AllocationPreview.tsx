import { AllocationBar } from '@/components/primitives/AllocationBar';
import {
  ALLOCATION_ASSETS,
  displayDecimal,
  wadToPercent,
} from '@/lib/verifiable-strategy/encoding';

export const allocationColor = (asset: string) =>
  asset === 'Alt' ? 'var(--ink-faint)' : `var(--event-${asset.toLowerCase()})`;

// Empty buckets are dropped so the bar's segment gaps never double up.
const segments = (values: number[]) =>
  values
    .map((value, i) => ({
      value: Number.isFinite(value) && value > 0 ? value : 0,
      color: allocationColor(ALLOCATION_ASSETS[i]!),
    }))
    .filter((segment) => segment.value > 0);

export function AllocationPreview({
  values,
  label,
}: {
  values: string[];
  label: string;
}) {
  return (
    <AllocationBar
      className="calc-bar"
      ariaLabel={label}
      height={10}
      segments={segments(values.map(Number))}
    />
  );
}

/** Four-bucket BTC/ETH/SPY/Stable comparison; both sides are WAD shares. */
export function AllocationCompare({
  before,
  after,
  afterLabel = 'After',
}: {
  before: readonly bigint[];
  after: readonly bigint[];
  afterLabel?: string;
}) {
  const percent = (value: bigint) => displayDecimal(wadToPercent(value));
  const share = (values: readonly bigint[]) =>
    segments(values.map((value) => Number(wadToPercent(value))));
  return (
    <div className="calc-compare">
      <div className="calc-compare-bars">
        <span>Before</span>
        <AllocationBar
          className="calc-bar"
          ariaLabel="Allocation before"
          height={8}
          segments={share(before)}
        />
        <span>{afterLabel}</span>
        <AllocationBar
          className="calc-bar"
          ariaLabel={`Allocation ${afterLabel.toLowerCase()}`}
          height={8}
          segments={share(after)}
        />
      </div>
      <table>
        <thead>
          <tr>
            <th scope="col">Asset</th>
            <th scope="col">Before</th>
            <th scope="col">{afterLabel}</th>
          </tr>
        </thead>
        <tbody>
          {before.map((value, i) => {
            const asset = ALLOCATION_ASSETS[i]!;
            return (
              <tr
                key={asset}
                className={
                  percent(value) === percent(after[i] ?? 0n)
                    ? undefined
                    : 'calc-changed'
                }
              >
                <th scope="row">
                  <i
                    className="calc-swatch"
                    style={{ background: allocationColor(asset) }}
                  />
                  {asset}
                </th>
                <td>{percent(value)}%</td>
                <td>{percent(after[i] ?? 0n)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
