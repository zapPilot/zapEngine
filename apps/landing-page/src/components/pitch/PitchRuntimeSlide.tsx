import { StatusNote } from '@/components/StatusBadge';
import { PITCH_RUNTIME } from '@/config/pitch';
import { PitchSlide } from './PitchSlide';

/**
 * Slide 4 — The runtime loop. Every stage shows the status of the capability
 * behind it, so the deck separates what runs today from what is planned.
 */
export function PitchRuntimeSlide() {
  return (
    <PitchSlide
      id="runtime"
      kicker={PITCH_RUNTIME.kicker}
      title={PITCH_RUNTIME.headline}
    >
      <ol className="pitch-runtime-stages">
        {PITCH_RUNTIME.stages.map((stage, index) => (
          <li key={stage.label} className="pitch-runtime-stage">
            <span className="pitch-runtime-index">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="pitch-runtime-label">{stage.label}</span>
            <span className="pitch-runtime-parts">
              {stage.parts.map((part) => (
                <StatusNote key={part.text} note={part} />
              ))}
            </span>
          </li>
        ))}
      </ol>
      <p className="pitch-runtime-footer">
        <StatusNote note={PITCH_RUNTIME.footer} />
      </p>
    </PitchSlide>
  );
}
