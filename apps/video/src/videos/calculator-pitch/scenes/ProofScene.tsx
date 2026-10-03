import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { font } from '../../../brand/fonts';
import { color } from '../../../brand/tokens';
import { AllocationBars } from '../../../primitives/AllocationBars';
import { Overline } from '../../../primitives/Card';
import { Kicker } from '../../../primitives/Kicker';
import { safe } from '../../../primitives/layout';
import { MatchBanner, MatchCheck } from '../../../primitives/MatchCheck';
import { enter, rise } from '../../../primitives/motion';
import { RevealText } from '../../../primitives/RevealText';
import { UiShot } from '../../../primitives/UiShot';
import { beatOf, cueFrame } from '../../../timeline/beats';
import { recorded, type SceneOf, shot } from '../assets';
import { facts, shortHex } from '../facts';

/** The calculator's answer panel, before and after the call, in one window. */
const ANSWER_WINDOW = { x: 1110, y: 150, width: 670, height: 740 };

const groupDigits = (value: string) => Number(value).toLocaleString('en-US');

export const ProofScene: React.FC<{ readonly scene: SceneOf<'proof'> }> = ({
  scene,
}) => {
  const frame = useCurrentFrame();
  const { kicker, codehash, calls, callCue, barsCue, matchCue } =
    scene.spec.props;
  const bytecode = beatOf(scene, 'proof-bytecode');
  const codehashAt = cueFrame(scene, 'proof-bytecode', codehash.cue);
  const callAt = cueFrame(scene, 'proof-decision', callCue);
  const barsAt = cueFrame(scene, 'proof-decision', barsCue);
  const matchAt = cueFrame(scene, 'proof-decision', matchCue);
  const clickAt = callAt + 20;
  const answerAt = clickAt + 14;
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          paddingBottom: 40,
          opacity: 1 - rise(frame, callAt - 10, 10),
        }}
      >
        <MatchCheck
          expected={{ label: codehash.expected, value: facts.runtimeCodehash }}
          observed={{ label: codehash.observed, value: facts.runtimeCodehash }}
          from={bytecode.from - 4}
          matchAt={codehashAt}
          verdict={codehash.verdict}
          detail={`${facts.network} · ${shortHex(facts.address)} · block ${groupDigits(recorded('identity', 'checkedAtBlock'))}`}
        />
      </AbsoluteFill>
      {frame >= callAt - 8 ? (
        <AbsoluteFill style={enter(frame, callAt - 8, { distance: 24 })}>
          <UiShot
            shot={shot('ready')}
            mode="window"
            region={ANSWER_WINDOW}
            keys={[
              {
                at: 0,
                target: 'answer',
                fill: 0.94,
                anchor: { x: 0.5, y: 0.5 },
              },
            ]}
            click={{ target: 'call', from: callAt, at: clickAt }}
          />
          <UiShot
            shot={shot('receipt')}
            mode="window"
            region={ANSWER_WINDOW}
            keys={[
              {
                at: 0,
                target: 'proof',
                fill: 0.92,
                anchor: { x: 0.5, y: 0.3 },
              },
              {
                at: barsAt + 10,
                target: 'compare',
                fill: 0.92,
                // Puts the window's top edge in the gap above the reason
                // line instead of through the serif verdict.
                anchor: { x: 0.5, y: 0.43 },
              },
              {
                at: matchAt + 8,
                target: 'match',
                fill: 0.92,
                anchor: { x: 0.5, y: 0.62 },
              },
            ]}
            highlights={[
              { target: 'proof', from: answerAt + 6, to: barsAt - 6 },
              { target: 'match', from: matchAt + 10 },
            ]}
            style={{ opacity: rise(frame, answerAt, 8) }}
          />
          <div
            style={{
              position: 'absolute',
              left: safe.left,
              top: ANSWER_WINDOW.y + 40,
              width: 900,
              display: 'flex',
              flexDirection: 'column',
              gap: 36,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                ...enter(frame, callAt + 2, { distance: 12 }),
              }}
            >
              <Overline>{calls.label}</Overline>
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: 30,
                  color: color.inkDim,
                }}
              >
                {calls.path}
              </span>
            </div>
            <RevealText
              text={facts.example.verdict}
              from={answerAt + 2}
              style={{
                fontFamily: font.serif,
                fontSize: 78,
                lineHeight: 1.02,
                color: color.ink,
              }}
            />
            <AllocationBars
              before={facts.example.before}
              after={facts.example.after}
              from={barsAt - 4}
              morphAt={barsAt + 10}
              width={680}
            />
            <MatchBanner
              text={facts.example.match}
              detail={`Recorded example · ${facts.example.date}`}
              from={matchAt}
            />
          </div>
        </AbsoluteFill>
      ) : null}
      <Kicker>{kicker}</Kicker>
    </AbsoluteFill>
  );
};
