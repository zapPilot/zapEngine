import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { font } from '../../../brand/fonts';
import { color } from '../../../brand/tokens';
import { Arrow } from '../../../primitives/Arrow';
import { Card, Overline } from '../../../primitives/Card';
import { Chip } from '../../../primitives/Chip';
import { Headline } from '../../../primitives/Headline';
import { Kicker } from '../../../primitives/Kicker';
import { safe } from '../../../primitives/layout';
import { enter } from '../../../primitives/motion';
import { cueFrame } from '../../../timeline/beats';
import type { SceneOf } from '../assets';
import { facts, shortHex } from '../facts';

export const RuleScene: React.FC<{ readonly scene: SceneOf<'rule'> }> = ({
  scene,
}) => {
  const frame = useCurrentFrame();
  const { kicker, title, inputs, output, contractCue } = scene.spec.props;
  const contractAt = cueFrame(scene, 'rule', contractCue);
  const first = scene.beats[0]?.from ?? 0;
  return (
    <AbsoluteFill>
      <Kicker>{kicker}</Kicker>
      <Headline
        lead={title.lead}
        accent={title.accent}
        from={6}
        style={{ position: 'absolute', left: safe.left, top: safe.top + 74 }}
      />
      <div
        style={{
          position: 'absolute',
          left: safe.left,
          right: safe.right,
          top: 400,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            width: 330,
          }}
        >
          <span
            style={{
              fontFamily: font.mono,
              fontSize: 22,
              letterSpacing: '0.14em',
              color: color.inkMuted,
              ...enter(frame, first),
            }}
          >
            INPUTS
          </span>
          {inputs.map((input, index) => (
            <Chip key={input} style={enter(frame, first + 6 + index * 7)}>
              {input}
            </Chip>
          ))}
        </div>
        <Arrow from={contractAt - 14} />
        <Card
          from={contractAt}
          glowFrom={contractAt + 10}
          style={{ width: 620, fontFamily: font.mono }}
        >
          <Overline>Vyper contract</Overline>
          <span style={{ fontSize: 38, color: color.ink }}>
            {facts.contractFile}
          </span>
          <span style={{ fontSize: 26, color: color.inkDim }}>
            {facts.network} · {shortHex(facts.address)}
          </span>
          <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
            <Chip tone="accent">Vyper {facts.compiler}</Chip>
            <Chip tone="accent">Sourcify {facts.sourcify}</Chip>
          </div>
        </Card>
        <Arrow from={contractAt + 18} />
        <Card from={contractAt + 28} style={{ width: 300 }}>
          <span
            style={{
              fontFamily: font.mono,
              fontSize: 22,
              letterSpacing: '0.14em',
              color: color.inkMuted,
            }}
          >
            OUTPUT
          </span>
          <span
            style={{
              fontFamily: font.serif,
              fontSize: 64,
              lineHeight: 1,
              color: color.ink,
            }}
          >
            {output}
          </span>
          <span
            style={{ fontFamily: font.sans, fontSize: 26, color: color.inkDim }}
          >
            Target allocation
          </span>
        </Card>
      </div>
    </AbsoluteFill>
  );
};
