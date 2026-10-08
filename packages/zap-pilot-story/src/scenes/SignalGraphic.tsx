import { engineDecision } from '../facts/decision.js';
import { AssetGlyph, type Sleeve } from './AssetGlyph.js';
const decision = engineDecision();
const sleeves: Sleeve[] = ['btc', 'eth', 'spy', 'stable'];
/** Two recorded closes normalized to their daily DMA; no interpolated history. */
export function SignalGraphic({ target }: { target: number | null }) {
  return (
    <div
      className="zp-signal"
      role="img"
      aria-label={
        target === null
          ? `Recorded closes versus 200DMA on ${decision.date}`
          : 'Recorded sleeve allocation percentages'
      }
    >
      {target !== null && (
        <svg
          className="zp-allocation-ring"
          viewBox="0 0 100 100"
          aria-hidden="true"
        >
          {sleeves.map((asset, i) => {
            const value =
              decision.held[i]! +
              (decision.target[i]! - decision.held[i]!) * target;
            const offset = sleeves
              .slice(0, i)
              .reduce(
                (sum, _, j) =>
                  sum +
                  decision.held[j]! +
                  (decision.target[j]! - decision.held[j]!) * target,
                0,
              );
            return (
              <circle
                key={asset}
                cx="50"
                cy="50"
                r="38"
                pathLength="100"
                fill="none"
                stroke={`var(--sleeve-${asset})`}
                strokeWidth="12"
                strokeDasharray={`${value} ${100 - value}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 50 50)"
              />
            );
          })}
        </svg>
      )}
      {(target === null ? sleeves.slice(0, 3) : sleeves).map((asset, i) => {
        const value =
          target === null
            ? decision.dmaDistance[asset.toUpperCase()]!
            : decision.held[i]! +
              (decision.target[i]! - decision.held[i]!) * target;
        const prior = decision.previousDmaDistance[asset.toUpperCase()] ?? 0;
        const range = Math.max(Math.abs(prior), Math.abs(value), 1);
        return (
          <div className="zp-signal-row" key={asset}>
            <AssetGlyph asset={asset} />
            <span>{asset === 'stable' ? 'Stables' : asset.toUpperCase()}</span>
            <svg viewBox="0 0 100 20" aria-hidden="true">
              <path d="M0 10H100" stroke="var(--rule)" />
              {target === null ? (
                <>
                  <path
                    d="M0 10H100"
                    stroke="var(--ink-3)"
                    strokeDasharray="2 2"
                  />
                  <path
                    d={`M4 ${10 - (prior / range) * 7}L96 ${10 - (value / range) * 7}`}
                    stroke={`var(--sleeve-${asset})`}
                    strokeWidth="2"
                    fill="none"
                  />
                  <circle
                    cx="96"
                    cy={10 - (value / range) * 7}
                    r="2"
                    fill="var(--ink)"
                  />
                </>
              ) : (
                <path
                  d={`M0 10H${value}`}
                  stroke={`var(--sleeve-${asset})`}
                  strokeWidth="12"
                />
              )}
            </svg>
            <strong>{value.toFixed(2)}%</strong>
          </div>
        );
      })}
      <p className="zp-lbl">
        {target === null ? (
          <>
            <span>
              {decision.previousDate} → {decision.date}
            </span>
            <br />
            <span>200DMA dashed · scale per asset</span>
          </>
        ) : (
          'Sleeve weights · hypothetical reference strategy'
        )}
      </p>
    </div>
  );
}
