import { GuaranteeList } from '@/components/landing-v2/TrustBoundary';
import { StatusBadge, StatusNote } from '@/components/StatusBadge';
import { PITCH_WALLET } from '@/config/pitch';
import { PitchSlide } from './PitchSlide';

/**
 * Slide 7 — Wallet. The home page's wallet-boundary guarantees on the left;
 * on the right, today's deposit flow (the "you sign" step in brand gold)
 * above the planned rebalance flow, each step badged with its status.
 */
export function PitchExecutionSlide() {
  const { flowToday, flowPlanned } = PITCH_WALLET;
  return (
    <PitchSlide
      id="wallet"
      kicker={PITCH_WALLET.kicker}
      title={PITCH_WALLET.headline}
    >
      <div className="pitch-execution-grid">
        <GuaranteeList className="pitch-execution-bullets" />

        <div className="pitch-execution-flows">
          <p className="pitch-execution-flow-label">
            {flowToday.label} <StatusBadge capability={flowToday.capability} />
          </p>
          <ol className="pitch-execution-flow" aria-label={flowToday.label}>
            {flowToday.steps.map((step, index) => (
              <li
                key={step}
                className={
                  index === flowToday.signStepIndex
                    ? 'pitch-execution-step pitch-execution-step--highlight'
                    : 'pitch-execution-step'
                }
              >
                {String(index + 1).padStart(2, '0')} · {step}
              </li>
            ))}
          </ol>
          <p className="pitch-execution-flow-label">{flowPlanned.label}</p>
          <ol className="pitch-execution-flow" aria-label={flowPlanned.label}>
            {flowPlanned.steps.map((step) => (
              <li key={step.text} className="pitch-execution-step">
                <StatusNote note={step} />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </PitchSlide>
  );
}
