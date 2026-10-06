import { ArrowRight } from 'lucide-react';
import { StatusNote } from '@/components/StatusBadge';
import { PITCH_STRATEGY } from '@/config/pitch';
import { PitchSlide } from './PitchSlide';

/**
 * Slide 5 — The reference strategy: signals × jobs × outcomes table, plus the
 * sleeve that no adapter can execute yet. Links to the spec's rule list.
 */
export function PitchStrategySlide() {
  return (
    <PitchSlide
      id="strategy"
      kicker={PITCH_STRATEGY.kicker}
      title={PITCH_STRATEGY.headline}
      subtitle={PITCH_STRATEGY.body}
    >
      <table className="pitch-strategy-table">
        <thead>
          <tr>
            <th scope="col">{PITCH_STRATEGY.tableHead.signal}</th>
            <th scope="col">{PITCH_STRATEGY.tableHead.job}</th>
            <th scope="col">{PITCH_STRATEGY.tableHead.outcome}</th>
          </tr>
        </thead>
        <tbody>
          {PITCH_STRATEGY.table.map((row) => (
            <tr key={row.signal}>
              <td>{row.signal}</td>
              <td>{row.job}</td>
              <td>{row.outcome}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pitch-strategy-sleeves">
        <StatusNote note={PITCH_STRATEGY.sleeves} />
      </p>
      <a
        className="pitch-strategy-footer-link"
        href={PITCH_STRATEGY.footerLink.href}
      >
        {PITCH_STRATEGY.footerLink.label}
        <ArrowRight size={14} aria-hidden />
      </a>
    </PitchSlide>
  );
}
