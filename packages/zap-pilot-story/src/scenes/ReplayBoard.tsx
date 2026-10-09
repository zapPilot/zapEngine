import { parseKinetic } from '@zapengine/story-kit';
import { KineticText } from '@zapengine/story-kit/react';
import { replay } from '../facts/replay.js';
import { chapters } from '../facts/chapters.js';
import { CHAPTER_COPY } from '../copy/beats.js';
import {
  allocationPolygons,
  eventRug,
  replayChart,
  replayView,
} from '../model/replay.js';
import { StatusBadge } from './StatusBadge.js';
const SLEEVE_LABEL: Record<string, string> = {
  btc: 'BTC',
  eth: 'ETH',
  spy: 'S&P',
  stable: 'Stables',
};
const percent = (value: number) =>
  `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(2)}%`;
export function ReplayBoard({ progress = 1 }: { progress?: number }) {
  const view = replayView(progress);
  const chapter = chapters[view.chapter]!;
  const copy = CHAPTER_COPY[view.chapter]!;
  const x = view.fraction * 100;
  const strategy = replay.snapshot.strategies.dma_fgi_portfolio_rules;
  const dca = replay.snapshot.strategies.dca_classic;
  return (
    <div className="zp-rstage">
      <div className="zp-r-head">
        <div>
          <p className="zp-lbl">
            Replay · {replay.window.days} days · reference strategy
          </p>
          <h2 className="zp-kt zp-r-h">
            <KineticText
              lines={parseKinetic([
                ['Every', 'move', 'has'],
                ['a', 'rule', 'behind', 'it.'],
              ])}
              progress={1}
              exit={true}
            />
          </h2>
        </div>
        <div className="zp-r-now">
          <div>
            <p className="zp-lbl">Date</p>
            <p className="zp-r-date">{view.date}</p>
          </div>
          <div>
            <p className="zp-lbl">Rules</p>
            <p className="zp-r-v">{percent(view.strategy)}</p>
          </div>
          <div>
            <p className="zp-lbl">DCA Classic</p>
            <p className="zp-r-v zp-r-v2">{percent(view.dca)}</p>
          </div>
        </div>
      </div>
      <div
        className="zp-r-chart"
        role="img"
        aria-label={`Hypothetical reference-strategy backtest through ${view.date}: ${percent(view.strategy)}, DCA Classic ${percent(view.dca)}`}
      >
        {[200, 150, 100, 75].map((v) => (
          <span
            className="zp-r-ax"
            key={v}
            style={{ bottom: `calc(${((v - 60) / 140) * 100}% - 7px)` }}
          >
            {v}
          </span>
        ))}
        {chapters.map((ch, i) => (
          <span
            className="zp-r-cn"
            key={ch.id}
            style={{ left: `${(ch.day / 497) * 100}%` }}
          >
            {String(i + 1).padStart(2, '0')}
          </span>
        ))}
        <svg
          className="zp-r-svg"
          viewBox="0 0 1000 320"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <clipPath id="zp-replay-clip">
              <rect x="-10" y="-20" width={x * 10 + 10} height="360" />
            </clipPath>
          </defs>
          <path
            className="zp-r-grid"
            d="M0 0H1000M0 57.1H1000M0 114.3H1000M0 171.4H1000M0 285.7H1000"
          />
          <path className="zp-r-grid2" d="M0 228.6H1000" />
          {chapters.slice(1).map((ch) => (
            <path
              key={ch.id}
              className="zp-r-grid"
              d={`M${(ch.day / 497) * 1000} 0V320`}
            />
          ))}
          <polyline className="zp-r-lc0" points={replayChart[1]} />
          <polyline className="zp-r-ls0" points={replayChart[0]} />
          <g clipPath="url(#zp-replay-clip)">
            <polyline className="zp-r-lc" points={replayChart[1]} />
            <polyline className="zp-r-ls" points={replayChart[0]} />
          </g>
        </svg>
        <span className="zp-r-ph" style={{ left: `${x}%` }} />
        <span
          className="zp-r-ds"
          style={{
            left: `${x}%`,
            top: `${((200 - (view.strategy + 100)) / 140) * 100}%`,
          }}
        />
        <span
          className="zp-r-dc"
          style={{
            left: `${x}%`,
            top: `${((200 - (view.dca + 100)) / 140) * 100}%`,
          }}
        />
      </div>
      <div className="zp-r-axis">
        <svg
          className="zp-r-rug"
          viewBox="0 0 1000 10"
          preserveAspectRatio="none"
        >
          <path className="zp-r-rug0" d={eventRug} />
        </svg>
        {[
          '2025-06-01',
          '2025-09-01',
          '2025-12-01',
          '2026-03-01',
          '2026-06-01',
          '2026-09-01',
        ].map((date) => {
          const day = replay.series[0]!.values.findIndex(
            (v) => v.date === date,
          );
          return (
            <span
              key={date}
              className="zp-r-tk"
              style={{ left: `${(day / 497) * 100}%` }}
            >
              {new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', {
                month: 'short',
                year: '2-digit',
                timeZone: 'UTC',
              })}
            </span>
          );
        })}
      </div>
      <div>
        <div className="zp-r-legend">
          <p className="zp-lbl">What the rules held</p>
          <ul>
            {replay.allocations.assets.map((asset, slot) => (
              <li key={asset}>
                <i style={{ background: `var(--sleeve-${asset})` }} />
                {SLEEVE_LABEL[asset]}{' '}
                {(view.allocation[slot]! * 100).toFixed(1)}
              </li>
            ))}
          </ul>
        </div>
        <div className="zp-r-strip">
          <svg
            className="zp-r-svg"
            viewBox="0 0 1000 100"
            preserveAspectRatio="none"
          >
            {allocationPolygons.map((p) => (
              <polygon
                key={p.asset}
                points={p.points}
                fill={`var(--sleeve-${p.asset})`}
              />
            ))}
            <rect
              x={x * 10}
              y="0"
              width={1000 - x * 10}
              height="100"
              fill="var(--ground)"
              opacity=".74"
            />
          </svg>
          <span className="zp-r-ph2" style={{ left: `${x}%` }} />
        </div>
      </div>
      <div className="zp-r-foot">
        <div className="zp-r-ch">
          <p className="zp-lbl">
            {String(view.chapter + 1).padStart(2, '0')} · {chapter.date} ·{' '}
            {copy.rule}
          </p>
          {'capability' in copy && <StatusBadge capability={copy.capability} />}
          <h3 className="zp-kt zp-r-cht">{copy.title}</h3>
          <p className="zp-r-chb">{copy.body}</p>
        </div>
        <div className="zp-r-side">
          {progress < 0.99 ? (
            <div>
              <p className="zp-lbl">Latest move · {view.lastDate}</p>
              <p className="zp-r-lt">
                <span className="zp-r-rule">Rule {view.lastRule}</span>
                {view.last}
              </p>
              <p className="zp-r-fired">
                {view.fired} rule-driven moves so far
              </p>
            </div>
          ) : (
            <div>
              <p className="zp-lbl">
                {replay.window.days} days · rules vs DCA Classic
              </p>
              <div className="zp-r-stats">
                {[
                  [
                    'Max drawdown',
                    percent(strategy.max_drawdown_percent),
                    percent(dca.max_drawdown_percent),
                    strategy.max_drawdown_percent,
                    dca.max_drawdown_percent,
                  ],
                  [
                    'Sharpe',
                    strategy.sharpe_ratio.toFixed(2),
                    dca.sharpe_ratio.toFixed(2),
                    strategy.sharpe_ratio,
                    dca.sharpe_ratio,
                  ],
                  [
                    'Trades',
                    String(strategy.trade_count),
                    String(dca.trade_count),
                    strategy.trade_count,
                    dca.trade_count,
                  ],
                ].map(([label, a, b, av, bv]) => (
                  <div key={label} style={{ display: 'contents' }}>
                    <span className="zp-r-sk">{label}</span>
                    <span className="zp-r-sv">
                      <i
                        className="zp-stat-bar"
                        style={{
                          width: `${(Math.abs(Number(av)) / Math.max(Math.abs(Number(av)), Math.abs(Number(bv)), 1)) * 100}%`,
                        }}
                      />
                      Rules {a}
                    </span>
                    <span className="zp-r-sd">
                      <i
                        className="zp-stat-bar"
                        style={{
                          width: `${(Math.abs(Number(bv)) / Math.max(Math.abs(Number(av)), Math.abs(Number(bv)), 1)) * 100}%`,
                        }}
                      />
                      DCA {b}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="zp-r-disc">
        Hypothetical backtest, {replay.window.start} to {replay.window.end}.
        Index 100 = ${replay.snapshot.total_capital.toLocaleString('en-US')}. It
        assumes yield on stablecoin and crypto balances and includes an S&amp;P
        500 sleeve Zap Pilot can’t execute yet. Past performance does not
        guarantee future results.{' '}
        <a className="zp-tlink" href="/track-record/">
          Track record
        </a>
      </p>
    </div>
  );
}
