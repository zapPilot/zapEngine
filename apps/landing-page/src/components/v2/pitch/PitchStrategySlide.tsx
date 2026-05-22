import { ArrowRight } from 'lucide-react';
import { PITCH_STRATEGY } from '@/config/pitch';
import { PitchSlide } from './PitchSlide';

/**
 * Slide 4 — Strategy: signals × jobs × outcomes table.
 * Links out to the docs for the full 6-rule priority breakdown.
 */
export function PitchStrategySlide() {
  return (
    <PitchSlide
      id="strategy"
      index={3}
      kicker={PITCH_STRATEGY.kicker}
      title={PITCH_STRATEGY.headline}
      subtitle={PITCH_STRATEGY.body}
    >
      <table className="pitch-strategy-table">
        <thead>
          <tr>
            <th scope="col">Signal</th>
            <th scope="col">Job</th>
            <th scope="col">Outcome</th>
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
