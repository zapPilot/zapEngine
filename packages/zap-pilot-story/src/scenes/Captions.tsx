import { clamp, easeInOutCubic, parseKinetic } from '@zapengine/story-kit';
import { KineticText } from '@zapengine/story-kit/react';
import { STAGES } from '../copy/beats.js';
import { engineDecision } from '../facts/decision.js';
import { StatusBadge } from './StatusBadge.js';
const decision = engineDecision();
export function Captions({ time }: { time: number }) {
  const beat =
    STAGES.find((stage) => time < stage.end) ?? STAGES[STAGES.length - 1]!;
  const progress = clamp((time - beat.start) / (beat.end - beat.start));
  const target = easeInOutCubic(clamp((time - 0.43) / 0.08));
  const stable =
    decision.held[3]! + (decision.target[3]! - decision.held[3]!) * target;
  const lines = parseKinetic(
    beat.name === 'Target'
      ? [[`${stable.toFixed(2)}%`], ['stables.']]
      : beat.lines,
  );
  if (beat.name === 'Sign') {
    lines.at(-1)!.underline = 'signature';
  }
  return (
    <div className="zp-capbox">
      <p className="zp-lbl zp-cap-k">{beat.kick}</p>
      <h2 className="zp-kt zp-cap-t">
        <KineticText
          lines={lines}
          progress={progress}
          exit={beat.name === 'Status' ? true : undefined}
        />
      </h2>
      <p className="zp-cap-s">{beat.sub}</p>
      {beat.name === 'Parts' && (
        <ul className="zp-crows">
          {(
            ['reference-strategy', 'self-hosting', 'wallet-signing'] as const
          ).map((id, i) => (
            <li key={id}>
              <span className="zp-crow-t">
                {['Strategy rules', 'Your machine', 'Wallet signing'][i]}
              </span>
              <StatusBadge capability={id} />
            </li>
          ))}
        </ul>
      )}
      {beat.badge && (
        <p className="zp-cap-b">
          <StatusBadge capability={beat.badge} />
        </p>
      )}
    </div>
  );
}
