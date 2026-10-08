import { tokens } from '@zapengine/design-tokens/tokens';
export function BrandMark() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg
        aria-hidden="true"
        width={22}
        height={22}
        className="brand-mark"
        fill="none"
        viewBox={tokens.mark.viewBox.join(' ')}
      >
        {tokens.mark.layers.map((layer) =>
          layer.kind === 'path' ? (
            <path
              key={layer.id}
              d={layer.d}
              stroke={`var(--${layer.role})`}
              strokeWidth={layer.strokeWidth}
              strokeLinecap="round"
            />
          ) : (
            <circle
              key={layer.id}
              cx={layer.cx}
              cy={layer.cy}
              r={layer.r}
              fill={`var(--${layer.role})`}
            />
          ),
        )}
      </svg>
      <span
        style={{
          color: 'var(--ink)',
          fontFamily: 'var(--font-display)',
          fontWeight: 640,
        }}
      >
        Zap Pilot
      </span>
    </span>
  );
}
