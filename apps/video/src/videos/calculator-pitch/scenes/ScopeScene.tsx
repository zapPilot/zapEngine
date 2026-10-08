import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { font } from '../../../brand/fonts';
import { color } from '../../../brand/tokens';
import { Glyph } from '../../../primitives/Glyph';
import { Kicker } from '../../../primitives/Kicker';
import { safe } from '../../../primitives/layout';
import { enter, rise } from '../../../primitives/motion';
import { cueFrame } from '../../../timeline/beats';
import type { SceneOf } from '../assets';
import { facts } from '../facts';

const Claim: React.FC<{
  readonly kind: 'check' | 'cross';
  readonly label: string;
  readonly text: string;
  readonly from: number;
}> = ({ kind, label, text, from }) => {
  const frame = useCurrentFrame();
  const tone = kind === 'check' ? color['ink'] : color['ink-2'];
  return (
    <div
      style={{
        display: 'flex',
        gap: 28,
        alignItems: 'flex-start',
        ...enter(frame, from, { distance: 18 }),
      }}
    >
      <Glyph kind={kind} from={from} size={64} tone={tone} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 24,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: tone,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: font.text,
            fontSize: 44,
            lineHeight: 1.2,
            color: color.ink,
          }}
        >
          {text}
        </span>
      </div>
    </div>
  );
};

export const ScopeScene: React.FC<{ readonly scene: SceneOf<'scope'> }> = ({
  scene,
}) => {
  const frame = useCurrentFrame();
  const { kicker, countLabel, proves, doesNotProve, limitCue } =
    scene.spec.props;
  const limitAt = cueFrame(scene, 'scope', limitCue);
  const first = scene.beats[0]?.from ?? 0;
  return (
    <AbsoluteFill>
      <Kicker>{kicker}</Kicker>
      <div
        style={{
          position: 'absolute',
          left: safe.left,
          top: 300,
          display: 'flex',
          flexDirection: 'column',
          gap: 30,
          ...enter(frame, 4, { distance: 24 }),
        }}
      >
        <span
          style={{
            fontFamily: font.display,
            fontSize: 210,
            lineHeight: 0.9,
            color: color.ink,
          }}
        >
          <span style={{ color: color['ink'] }}>{facts.rulesCovered}</span> of{' '}
          {facts.rulesTotal}
        </span>
        <span
          style={{ fontFamily: font.text, fontSize: 34, color: color['ink-2'] }}
        >
          {countLabel}
        </span>
        <div style={{ display: 'flex', gap: 14 }}>
          {Array.from({ length: facts.rulesTotal }, (_, index) => (
            <span
              key={index}
              style={{
                width: 64,
                height: 14,
                borderRadius: 999,
                border:
                  index < facts.rulesCovered
                    ? 'none'
                    : `1px solid ${color['rule-2']}`,
                background:
                  index < facts.rulesCovered ? color['ink'] : 'transparent',
                opacity: rise(frame, 10 + index * 3, 10),
              }}
            />
          ))}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 900,
          right: safe.right,
          top: 300,
          display: 'flex',
          flexDirection: 'column',
          gap: 64,
        }}
      >
        <Claim kind="check" label="Proves" text={proves} from={first + 8} />
        <Claim
          kind="cross"
          label="Doesn’t prove"
          text={doesNotProve}
          from={limitAt}
        />
      </div>
    </AbsoluteFill>
  );
};
