import type { FC, ReactNode } from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';

import { BROWSER } from '../../../primitives/Browser';
import {
  RecordCard,
  ReplyBubble,
  UserBubble,
} from '../../kokode-clinic/primitives/ChatWindow';
import { SketchCanvas } from '../../kokode-clinic/primitives/SketchCanvas';
import { theme } from '../../kokode-clinic/theme';
import { usePromo } from '../context';
import { Console } from './Console';

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const CARD = { width: 480, height: 300, gap: 40 } as const;
const COLUMNS = 6;
const ROWS = 3;
const SCALE = CARD.width / BROWSER.width;
/** Long ago: everything on a wall card is already on screen. */
const DRAWN = -1000;

/** Where the camera cuts to on each beat: a shift of the wall and a zoom. */
const VIEWS = [
  { x: 0, y: 0, scale: 1 },
  { x: -620, y: 150, scale: 1.3 },
  { x: 520, y: -170, scale: 1.2 },
  { x: -260, y: -260, scale: 1.45 },
  { x: 700, y: 210, scale: 1.25 },
  { x: -820, y: -90, scale: 1.15 },
  { x: 240, y: 260, scale: 1.4 },
  { x: -420, y: 40, scale: 1.2 },
] as const;

/** A console screen shrunk onto a wall card. */
const Mini: FC<{ readonly children: ReactNode }> = ({ children }) => (
  <div
    style={{
      position: 'absolute',
      width: BROWSER.width,
      height: BROWSER.height,
      scale: SCALE,
      transformOrigin: '0 0',
    }}
  >
    {children}
  </div>
);

/** The one card that carries the brand instead of a screen. */
const BRAND_CARD = 8;

function useScreens(): readonly ReactNode[] {
  const { story } = usePromo();
  const { patient, image, chat } = story.DEMOS;
  return [
    <Console key="home" view="home" />,
    <Console key="referral" view="chat" active="referral">
      <RecordCard
        title={patient.record.title}
        lines={patient.record.lines}
        from={DRAWN}
      />
      <UserBubble text={patient.prompt} typeFrom={DRAWN} variant="kokode" />
      <ReplyBubble
        title={patient.reply.title}
        lines={patient.reply.lines}
        from={DRAWN}
        draft
      />
    </Console>,
    <Console key="diagram" view="chat" active="materials">
      <UserBubble text={image.prompt} typeFrom={DRAWN} variant="kokode" />
      <div
        style={{
          alignSelf: 'flex-start',
          padding: 16,
          borderRadius: 22,
          border: `1px solid ${theme.line}`,
        }}
      >
        <SketchCanvas from={DRAWN} width={420} />
      </div>
    </Console>,
    <Console key="manual" view="chat" active="search">
      <UserBubble text={chat.prompt} typeFrom={DRAWN} variant="kokode" />
      <ReplyBubble
        title={story.CHAT_UI.assistant}
        lines={chat.reply}
        from={DRAWN}
      />
    </Console>,
    <Console key="signin" view="signin" />,
  ];
}

function useBrand(): ReactNode {
  const { story } = usePromo();
  return (
    <AbsoluteFill
      style={{
        background: theme.blue,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 40,
      }}
    >
      <Img
        src={staticFile('brand/kokode-mark.svg')}
        style={{ width: 220, height: 220, filter: 'brightness(0) invert(1)' }}
      />
      <span
        style={{
          fontSize: 120,
          fontWeight: 800,
          color: theme.surface,
          letterSpacing: '-0.03em',
        }}
      >
        {story.BEATS.hero.eyebrow}
      </span>
    </AbsoluteFill>
  );
}

/**
 * Every screen of the film on a tilted wall. The camera hard-cuts to a new
 * corner on each beat (`perBeat` frames from `from`), drifts and settles.
 */
export const Wall: FC<{ readonly from: number; readonly perBeat: number }> = ({
  from,
  perBeat,
}) => {
  const frame = useCurrentFrame();
  const { fontFamily } = usePromo();
  const screens = useScreens();
  const brand = useBrand();
  const beat = Math.max(0, Math.floor((frame - from) / perBeat));
  const view = VIEWS[beat % VIEWS.length] ?? VIEWS[0];
  const inBeat = (frame - from - beat * perBeat) / perBeat;
  const punch = interpolate(inBeat, [0, 0.5], [1.08, 1], {
    ...CLAMP,
    easing: Easing.out(Easing.cubic),
  });
  const width = COLUMNS * CARD.width + (COLUMNS - 1) * CARD.gap;
  const height = ROWS * CARD.height + (ROWS - 1) * CARD.gap;
  return (
    <AbsoluteFill
      style={{
        perspective: 2200,
        perspectiveOrigin: '50% 50%',
        overflow: 'hidden',
        fontFamily,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 960 - width / 2,
          top: 540 - height / 2,
          width,
          height,
          transformStyle: 'preserve-3d',
          transform: `translate(${view.x - inBeat * 40}px, ${view.y + inBeat * 16}px) scale(${view.scale * punch}) rotateX(48deg) rotateZ(-28deg)`,
        }}
      >
        {Array.from({ length: COLUMNS * ROWS }, (_, index) => {
          const column = index % COLUMNS;
          const row = Math.floor(index / COLUMNS);
          const lifted = (index + beat) % 5 === 0;
          return (
            <div
              key={index}
              style={{
                position: 'absolute',
                left: column * (CARD.width + CARD.gap),
                top: row * (CARD.height + CARD.gap),
                width: CARD.width,
                height: CARD.height,
                overflow: 'hidden',
                borderRadius: 18,
                background: theme.surface,
                boxShadow: lifted
                  ? '0 40px 60px rgba(0, 0, 0, 0.18)'
                  : '0 12px 26px rgba(0, 0, 0, 0.10)',
                transform: `translateZ(${lifted ? 70 : 0}px)`,
              }}
            >
              <Mini>
                {index === BRAND_CARD
                  ? brand
                  : screens[(index * 5 + row) % screens.length]}
              </Mini>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
