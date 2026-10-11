import type { FC } from 'react';
import { interpolate } from 'remotion';

import { enter, rise } from '../../../primitives/motion';
import { hold, key } from '../../../primitives/rig';
import { Sfx } from '../../../primitives/Sfx';
import { cueAt } from '../../../timeline/beats';
import { UserBubble } from '../../kokode-clinic/primitives/ChatWindow';
import {
  SketchCanvas,
  StepLabel,
} from '../../kokode-clinic/primitives/SketchCanvas';
import { theme } from '../../kokode-clinic/theme';
import type { SceneOf } from '../assets';
import { ChapterScene, useChapterCopy } from '../ui/Chapter';
import { PAGE_CENTRE } from '../ui/Console';
import { PROMO_TYPE_SPEED } from './BrowserScene';
import { useSceneClock } from './clock';

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/**
 * Chapter two, diagrams: the browser lies flat like a desk, the line drawing
 * draws itself, and the finished slide lifts off the page towards the viewer.
 */
export const Diagram: FC<{ readonly scene: SceneOf<'diagram'> }> = ({
  scene,
}) => {
  const { story, props, frame, durationInFrames } = useSceneClock(scene);
  const demo = story.DEMOS.image;
  const copy = useChapterCopy('materials', story.BEATS.demoImage.title);
  const askAt = cueAt(scene, props.askCue);
  const sketchAt = cueAt(scene, props.sketchCue);
  const slideAt = cueAt(scene, props.slideCue);
  const [sketchStep = '', slideStep = ''] = demo.steps;
  const lift = interpolate(frame, [slideAt, slideAt + 20], [0, 1], CLAMP);
  const glint = interpolate(
    frame,
    [slideAt + 16, slideAt + 34],
    [-40, 140],
    CLAMP,
  );
  const keys = [
    ...hold(0, askAt - 10, {
      ...PAGE_CENTRE,
      x: 2600,
      y: 640,
      rx: 30,
      ry: -30,
      rz: -10,
      scale: 0.7,
    }),
    key(askAt + 6, {
      ...PAGE_CENTRE,
      x: 1150,
      y: 600,
      rx: 46,
      rz: -18,
      scale: 0.8,
    }),
    key(sketchAt + 30, {
      ...PAGE_CENTRE,
      x: 1110,
      y: 590,
      rx: 50,
      rz: -10,
      scale: 0.86,
    }),
    key(slideAt + 8, {
      ...PAGE_CENTRE,
      x: 1120,
      y: 620,
      rx: 40,
      rz: -6,
      scale: 0.76,
    }),
    key(durationInFrames, {
      ...PAGE_CENTRE,
      x: 1140,
      y: 620,
      rx: 38,
      ry: 14,
      rz: -2,
      scale: 0.74,
    }),
  ];
  return (
    <ChapterScene
      copy={copy}
      askAt={askAt}
      notes={story.PROMO.diagram.notes}
      keys={keys}
      lift={[0, 0, lift * 260]}
      thread={[
        <UserBubble
          key="ask"
          text={demo.prompt}
          typeFrom={askAt + 4}
          variant="kokode"
          speed={PROMO_TYPE_SPEED}
        />,
        <div
          key="sketch"
          style={{
            alignSelf: 'flex-start',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            padding: 18,
            borderRadius: 22,
            background: theme.surface,
            border: `1px solid ${theme.line}`,
            ...enter(frame, sketchAt - 6, { distance: 14 }),
          }}
        >
          <SketchCanvas from={sketchAt} width={360} />
          <StepLabel label={sketchStep} at={sketchAt + 10} />
        </div>,
        <div
          key="slide"
          style={{
            position: 'relative',
            alignSelf: 'flex-end',
            width: 520,
            aspectRatio: '16 / 9',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            padding: 22,
            boxSizing: 'border-box',
            overflow: 'hidden',
            borderRadius: 16,
            background: theme.surface,
            border: `1px solid ${theme.line}`,
            boxShadow: `0 ${16 + lift * 40}px ${40 + lift * 50}px rgba(0, 0, 0, ${0.1 + lift * 0.12})`,
            rotate: `${-lift * 6}deg`,
            opacity: rise(frame, slideAt - 4, 8),
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <strong style={{ fontSize: 28 }}>{demo.slide.title}</strong>
            <span style={{ fontSize: 17, color: theme.muted }}>
              {demo.slide.note}
            </span>
            <StepLabel label={slideStep} at={slideAt + 6} />
          </div>
          <SketchCanvas from={slideAt - 60} width={210} />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(110deg, rgba(255, 255, 255, 0) ${glint - 20}%, rgba(255, 255, 255, 0.75) ${glint}%, rgba(255, 255, 255, 0) ${glint + 20}%)`,
            }}
          />
        </div>,
      ]}
    >
      <Sfx kind="swish" at={sketchAt} />
      <Sfx kind="whoosh" at={slideAt} />
      <Sfx kind="chime" at={slideAt + 16} />
    </ChapterScene>
  );
};
