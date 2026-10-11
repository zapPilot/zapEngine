import type { FC } from 'react';
import { interpolate } from 'remotion';

import { enter, rise } from '../../../primitives/motion';
import { hold, key } from '../../../primitives/rig';
import { Sfx } from '../../../primitives/Sfx';
import { typingEnd } from '../../../primitives/typing';
import { cueAt } from '../../../timeline/beats';
import {
  RecordCard,
  ReplyBubble,
  UserBubble,
} from '../../kokode-clinic/primitives/ChatWindow';
import { DataFlow } from '../../kokode-clinic/primitives/NetworkDiagram';
import { theme } from '../../kokode-clinic/theme';
import type { SceneOf } from '../assets';
import { ChapterScene, TileDive, useChapterCopy } from '../ui/Chapter';
import { PAGE_CENTRE, THREAD } from '../ui/Console';
import { Headline } from '../ui/Headline';
import { PROMO_TYPE_SPEED } from './BrowserScene';
import { useSceneClock } from './clock';

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/**
 * Chapter one, referral letters: patient data goes to the AI inside, the
 * draft is written there, then the record and the draft lift off the page.
 */
export const Referral: FC<{ readonly scene: SceneOf<'referral'> }> = ({
  scene,
}) => {
  const { story, props, frame, durationInFrames } = useSceneClock(scene);
  const demo = story.DEMOS.patient;
  const copy = useChapterCopy('referral', story.BEATS.demoPatient.title);
  const flowAt = cueAt(scene, props.flowCue);
  const strike = rise(frame, cueAt(scene, props.cloudCue), 10);
  const askAt = cueAt(scene, props.askCue);
  const typeFrom = askAt + 6;
  const draftAt = Math.max(
    cueAt(scene, props.draftCue),
    typingEnd(demo.prompt, typeFrom, PROMO_TYPE_SPEED) + 6,
  );
  const explodeAt = draftAt + 34;
  const diveAt = durationInFrames - 26;
  const lift = interpolate(frame, [explodeAt, explodeAt + 18], [0, 1], CLAMP);
  const flowGone = interpolate(frame, [askAt - 10, askAt], [0, 1], CLAMP);
  const keys = [
    ...hold(0, askAt - 8, {
      ...PAGE_CENTRE,
      x: 2750,
      y: 560,
      ry: -40,
      rz: 8,
      scale: 0.7,
    }),
    key(askAt + 6, {
      ...PAGE_CENTRE,
      x: 1180,
      y: 600,
      ry: -12,
      rz: 1,
      scale: 0.72,
    }),
    key(draftAt + 16, {
      fx: THREAD.x + 420,
      fy: 560,
      x: 1060,
      y: 560,
      ry: -6,
      scale: 1.18,
    }),
    key(explodeAt + 22, {
      ...PAGE_CENTRE,
      x: 1200,
      y: 640,
      rx: 30,
      ry: 22,
      rz: -10,
      scale: 0.64,
    }),
    key(durationInFrames, {
      ...PAGE_CENTRE,
      x: 1200,
      y: 640,
      rx: 32,
      ry: 28,
      rz: -11,
      scale: 0.62,
    }),
  ];
  return (
    <ChapterScene
      copy={copy}
      askAt={askAt}
      notes={story.PROMO.referral.notes}
      keys={keys}
      captionExit={draftAt}
      lift={[lift * 90, lift * 40, lift * 150]}
      thread={[
        <RecordCard
          key="record"
          title={demo.record.title}
          lines={demo.record.lines}
          from={askAt + 2}
        />,
        <UserBubble
          key="ask"
          text={demo.prompt}
          typeFrom={typeFrom}
          variant="kokode"
          speed={PROMO_TYPE_SPEED}
        />,
        <ReplyBubble
          key="draft"
          title={demo.reply.title}
          lines={demo.reply.lines}
          from={draftAt}
          draft
        />,
      ]}
    >
      {frame < askAt ? (
        <div
          style={{
            position: 'absolute',
            left: 760,
            top: 360,
            transform: `perspective(2000px) rotateX(16deg) rotateY(-18deg) translateY(${-flowGone * 80}px) scale(1.3)`,
            transformOrigin: '0 0',
            opacity: 1 - flowGone,
            ...enter(frame, flowAt - 8, { distance: 40 }),
          }}
        >
          <DataFlow from={flowAt} />
          {/* "Not out to the cloud": the cloud route is struck through. */}
          <div
            style={{
              position: 'absolute',
              left: -10,
              top: 76,
              width: `${strike * 104}%`,
              height: 5,
              borderRadius: 3,
              background: theme.danger,
            }}
          />
        </div>
      ) : null}
      <Headline
        lines={story.BEATS.beforeAfter.title}
        at={explodeAt}
        width={660}
        max={84}
        style={{ left: 150, top: 300 }}
      />
      <TileDive id="materials" at={diveAt} />
      <Sfx kind="chime" at={draftAt} />
      <Sfx kind="pop" at={explodeAt} />
      <Sfx kind="swish" at={diveAt + 6} />
    </ChapterScene>
  );
};
