import type React from 'react';
import type { ReactNode } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { font } from '../../../brand/fonts';
import { color } from '../../../brand/tokens';
import { Card, Overline } from '../../../primitives/Card';
import { Chip } from '../../../primitives/Chip';
import { Headline } from '../../../primitives/Headline';
import { HexResolve } from '../../../primitives/HexResolve';
import { Kicker } from '../../../primitives/Kicker';
import { safe } from '../../../primitives/layout';
import { enter, rise } from '../../../primitives/motion';
import { cueFrame } from '../../../timeline/beats';
import type { SceneOf } from '../assets';
import { facts, shortHex } from '../facts';

const Operand: React.FC<{
  readonly label: string;
  readonly from: number;
  readonly width: number;
  readonly children: ReactNode;
}> = ({ label, from, width, children }) => (
  <Card from={from} style={{ width, minHeight: 190, fontFamily: font.mono }}>
    <Overline>{label}</Overline>
    <span style={{ fontSize: 26, lineHeight: 1.4, color: color.ink }}>
      {children}
    </span>
  </Card>
);

// Break the salt label after its second "/" so it never wraps mid-word.
const saltBreak =
  facts.saltLabel.indexOf('/', facts.saltLabel.indexOf('/') + 1) + 1;
const saltHead = facts.saltLabel.slice(0, saltBreak);
const saltTail = facts.saltLabel.slice(saltBreak);

const Plus: React.FC<{ readonly from: number }> = ({ from }) => {
  const frame = useCurrentFrame();
  return (
    <span
      style={{
        fontFamily: font.mono,
        fontSize: 40,
        color: color['ink-3'],
        ...enter(frame, from),
      }}
    >
      +
    </span>
  );
};

export const DeployScene: React.FC<{ readonly scene: SceneOf<'deploy'> }> = ({
  scene,
}) => {
  const frame = useCurrentFrame();
  const { kicker, title, wallet, note, create2Cue, noteCue } = scene.spec.props;
  const create2At = cueFrame(scene, 'deploy', create2Cue);
  const noteAt = cueFrame(scene, 'deploy', noteCue);
  const resultAt = create2At + 26;
  return (
    <AbsoluteFill>
      <Kicker>{kicker}</Kicker>
      <Headline
        lead={title.lead}
        accent={title.accent}
        from={6}
        size={70}
        style={{ position: 'absolute', left: safe.left, top: safe.top + 74 }}
      />
      <div
        style={{
          position: 'absolute',
          right: safe.right,
          top: safe.top + 96,
          ...enter(frame, 14),
        }}
      >
        <Chip>{wallet}</Chip>
      </div>
      <div
        style={{
          position: 'absolute',
          left: safe.left,
          right: safe.right,
          top: 360,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Operand label="CREATE2 factory" from={create2At - 4} width={410}>
          {shortHex(facts.factory, 10, 6)}
        </Operand>
        <Plus from={create2At + 2} />
        <Operand label="Salt" from={create2At + 6} width={600}>
          keccak256(&quot;{saltHead}
          <br />
          {saltTail}&quot;)
        </Operand>
        <Plus from={create2At + 12} />
        <Operand label="Initcode" from={create2At + 14} width={430}>
          {facts.contractFile}
          <br />
          Vyper {facts.compiler}
        </Operand>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 600,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
        }}
      >
        <span
          style={{
            width: 2,
            height: 56 * rise(frame, resultAt - 10, 12),
            background: color['rule-2'],
          }}
        />
        <div style={{ ...enter(frame, resultAt - 4, { distance: 14 }) }}>
          <HexResolve
            value={facts.address}
            from={resultAt}
            duration={34}
            style={{ fontSize: 52, color: color['ink'] }}
          />
        </div>
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 24,
            color: color['ink-2'],
            ...enter(frame, resultAt + 30),
          }}
        >
          tx {shortHex(facts.deployTransaction)} · block{' '}
          {facts.deployBlock.toLocaleString('en-US')}
        </span>
        <div
          style={{ marginTop: 8, ...enter(frame, noteAt, { distance: 12 }) }}
        >
          <Chip tone="accent">{note}</Chip>
        </div>
      </div>
    </AbsoluteFill>
  );
};
