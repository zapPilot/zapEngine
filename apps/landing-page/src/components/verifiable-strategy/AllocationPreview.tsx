import { AllocationBar } from '@/components/primitives/AllocationBar';
import { ALLOCATION_ASSETS } from '@/lib/verifiable-strategy/encoding';
export function AllocationPreview({
  values,
  label,
}: {
  values: string[];
  label: string;
}) {
  return (
    <div className="track-record-calculator-allocation">
      <AllocationBar
        ariaLabel={label}
        height={12}
        segments={values.map((value, i) => ({
          value: Math.max(
            0,
            Number.isFinite(Number(value)) ? Number(value) : 0,
          ),
          color: `var(--event-${(ALLOCATION_ASSETS[i] ?? 'Alt').toLowerCase()}, var(--ink-dim))`,
        }))}
      />
      <div>
        {values.map((value, i) => (
          <span key={i}>
            {ALLOCATION_ASSETS[i]}{' '}
            <b>
              {Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '—'}%
            </b>
          </span>
        ))}
      </div>
    </div>
  );
}
