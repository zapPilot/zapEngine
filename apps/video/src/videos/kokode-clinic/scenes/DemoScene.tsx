import type { FC } from 'react';
import { useCurrentFrame } from 'remotion';

import { enter } from '../../../primitives/motion';
import { typingEnd } from '../../../primitives/typing';
import { cueAt } from '../../../timeline/beats';
import type { SceneOf } from '../assets';
import { jaFont } from '../fonts';
import {
  ChatWindow,
  RecordCard,
  ReplyBubble,
  TYPE_SPEED,
  UserBubble,
} from '../primitives/ChatWindow';
import { Disclaimers } from '../primitives/Disclaimers';
import { Icon } from '../primitives/icons';
import { JaHeadline } from '../primitives/JaHeadline';
import { DataFlow } from '../primitives/NetworkDiagram';
import { SketchCanvas } from '../primitives/SketchCanvas';
import { Stage } from '../primitives/Stage';
import { Swap } from '../primitives/Swap';
import { BEATS, DEMOS } from '../story';
import { theme } from '../theme';

/** Patient data stays in the building; the referral summary is drafted there. */
const PatientDemo: FC<{ readonly scene: SceneOf<'demo-patient'> }> = ({
  scene,
}) => {
  const { props } = scene.spec;
  const flowFrom = cueAt(scene, props.flowCue);
  const askFrom = cueAt(scene, props.askCue);
  const typeFrom = askFrom + 4;
  const demo = DEMOS.patient;
  return (
    <Stage
      copy={
        <Swap
          at={askFrom}
          height={460}
          before={
            <JaHeadline
              lines={props.film.headline}
              eyebrow={BEATS.beforeAfter.eyebrow}
              from={flowFrom}
              size={70}
            />
          }
          after={
            <JaHeadline
              lines={BEATS.demoPatient.title}
              eyebrow={BEATS.demoPatient.eyebrow}
              from={askFrom - 6}
              size={70}
            />
          }
        />
      }
      screen={
        <Swap
          at={askFrom}
          height={680}
          before={<DataFlow from={flowFrom + 6} />}
          after={
            <ChatWindow variant="kokode" from={askFrom - 8}>
              <RecordCard
                title={demo.record.title}
                lines={demo.record.lines}
                from={askFrom - 4}
              />
              <UserBubble
                text={demo.prompt}
                typeFrom={typeFrom}
                variant="kokode"
              />
              <ReplyBubble
                title={demo.reply.title}
                lines={demo.reply.lines}
                from={Math.max(
                  cueAt(scene, props.draftCue),
                  typingEnd(demo.prompt, typeFrom, TYPE_SPEED) + 6,
                )}
                draft
              />
            </ChatWindow>
          }
        />
      }
      notes={<Disclaimers notes={props.film.notes} />}
    />
  );
};

/** An anatomy sketch drafted on site, then placed on a slide. */
const ImageDemo: FC<{ readonly scene: SceneOf<'demo-image'> }> = ({
  scene,
}) => {
  const frame = useCurrentFrame();
  const { props } = scene.spec;
  const askFrom = cueAt(scene, props.askCue);
  const sketchFrom = cueAt(scene, props.sketchCue);
  const slideFrom = cueAt(scene, props.slideCue);
  const demo = DEMOS.image;
  const [sketchStep = '', slideStep = ''] = demo.steps;
  const step = (label: string, at: number) => (
    <span
      style={{
        fontSize: 22,
        color: theme.muted,
        ...enter(frame, at, { distance: 8 }),
      }}
    >
      {label}
    </span>
  );
  return (
    <Stage
      copy={
        <JaHeadline
          lines={props.film.headline}
          eyebrow={BEATS.demoImage.eyebrow}
          from={askFrom}
          size={70}
        />
      }
      screen={
        <ChatWindow variant="kokode" from={askFrom - 8}>
          <UserBubble
            text={demo.prompt}
            typeFrom={askFrom + 2}
            variant="kokode"
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 22,
              fontFamily: jaFont,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div
                style={{
                  padding: 14,
                  borderRadius: 18,
                  border: `1px solid ${theme.line}`,
                  ...enter(frame, sketchFrom - 6, { distance: 12 }),
                }}
              >
                <SketchCanvas from={sketchFrom} width={300} />
              </div>
              {step(sketchStep, sketchFrom)}
            </div>
            <span style={enter(frame, slideFrom - 6, { distance: 0 })}>
              <Icon name="arrow" size={40} color="#8e8e93" />
            </span>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 380,
                  aspectRatio: '16 / 9',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  padding: 16,
                  borderRadius: 14,
                  background: theme.surface,
                  border: `1px solid ${theme.line}`,
                  boxShadow: '0 16px 40px rgba(0, 0, 0, 0.10)',
                  ...enter(frame, slideFrom, { distance: 20 }),
                }}
              >
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                >
                  <strong style={{ fontSize: 24 }}>{demo.slide.title}</strong>
                  <span style={{ fontSize: 16, color: theme.muted }}>
                    {demo.slide.note}
                  </span>
                </div>
                <SketchCanvas from={slideFrom - 60} width={160} />
              </div>
              {step(slideStep, slideFrom)}
            </div>
          </div>
        </ChatWindow>
      }
      notes={<Disclaimers notes={props.film.notes} />}
    />
  );
};

/** Both demos share a scene type: a request typed into KOKODE on site. */
export const DemoScene: FC<{
  readonly scene: SceneOf<'demo-patient' | 'demo-image'>;
}> = ({ scene }) =>
  scene.spec.id === 'demo-patient' ? (
    <PatientDemo scene={scene as SceneOf<'demo-patient'>} />
  ) : (
    <ImageDemo scene={scene as SceneOf<'demo-image'>} />
  );
