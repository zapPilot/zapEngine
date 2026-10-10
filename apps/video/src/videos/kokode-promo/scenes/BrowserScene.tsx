import type { FC } from 'react';
import { AbsoluteFill, interpolate } from 'remotion';

import { BROWSER, Browser, BROWSER_PAGE } from '../../../primitives/Browser';
import { DeviceShot } from '../../../primitives/DeviceShot';
import { hold, key, rigStyle } from '../../../primitives/rig';
import { Sfx } from '../../../primitives/Sfx';
import { TABLET, Tablet, TABLET_SCREEN } from '../../../primitives/Tablet';
import { typingEnd } from '../../../primitives/typing';
import { cueAt } from '../../../timeline/beats';
import {
  ReplyBubble,
  UserBubble,
} from '../../kokode-clinic/primitives/ChatWindow';
import { Disclaimers } from '../../kokode-clinic/primitives/Disclaimers';
import { theme } from '../../kokode-clinic/theme';
import type { SceneOf } from '../assets';
import { TileDive } from '../ui/Chapter';
import { Console, homeCard, PAGE_CENTRE, SIGN_IN, Tap } from '../ui/Console';
import { Headline } from '../ui/Headline';
import { useSceneClock } from './clock';

/** Frames per character while a prompt types itself in the promo. */
export const PROMO_TYPE_SPEED = 0.4;

const TABLET_CENTRE = { fx: TABLET.width / 2, fy: TABLET.height / 2 } as const;
const TABLET_SCALE = TABLET.width / BROWSER.width;

/**
 * kokode.local on a staff PC: sign in, the four workflows, then the same
 * screen on a tablet; one tap on both and the facility manual answers.
 */
export const BrowserScene: FC<{ readonly scene: SceneOf<'browser'> }> = ({
  scene,
}) => {
  const { story, props, fontFamily, frame, durationInFrames } =
    useSceneClock(scene);
  const browserIn = Math.max(10, cueAt(scene, props.browserCue) - 2);
  const signIn = Math.max(browserIn + 14, cueAt(scene, props.signInCue));
  const home = signIn + 4;
  const pull = home + 14;
  const tapSearch = pull + 14;
  const typeFrom = tapSearch + 6;
  const chat = story.DEMOS.chat;
  const replyAt = Math.max(
    cueAt(scene, props.askCue),
    typingEnd(chat.prompt, typeFrom, PROMO_TYPE_SPEED) + 4,
  );
  const diveAt = durationInFrames - 26;
  const searchIndex = Math.max(
    0,
    story.PROMO_UI.tiles.findIndex((tile) => tile.id === 'search'),
  );
  const searchCard = homeCard(searchIndex);
  const view =
    frame < home ? 'signin' : frame < tapSearch + 4 ? 'home' : 'chat';
  const screen = (
    <>
      <Console view={view} active="search" homeFrom={home}>
        <UserBubble
          text={chat.prompt}
          typeFrom={typeFrom}
          variant="kokode"
          speed={PROMO_TYPE_SPEED}
        />
        <ReplyBubble
          title={story.CHAT_UI.assistant}
          lines={chat.reply}
          from={replyAt}
        />
      </Console>
      <Tap x={SIGN_IN.x} y={SIGN_IN.y} at={signIn} />
      <Tap x={searchCard.tileX} y={searchCard.tileY} at={tapSearch} />
    </>
  );
  const browserKeys = [
    key(0, { ...PAGE_CENTRE, x: 2750, y: 560, ry: -42, rz: 9, scale: 0.78 }),
    key(browserIn, {
      ...PAGE_CENTRE,
      x: 1010,
      y: 560,
      ry: -14,
      rz: 2,
      scale: 0.86,
    }),
    key(signIn - 2, {
      fx: SIGN_IN.x,
      fy: SIGN_IN.y,
      x: 980,
      y: 600,
      ry: -8,
      rz: 1,
      scale: 1.12,
    }),
    key(home + 4, {
      ...PAGE_CENTRE,
      x: 1010,
      y: 560,
      ry: -10,
      rz: 1,
      scale: 0.86,
    }),
    key(pull + 10, { ...PAGE_CENTRE, x: 1220, y: 600, ry: -9, scale: 0.6 }),
    key(durationInFrames, {
      ...PAGE_CENTRE,
      x: 1240,
      y: 600,
      ry: 6,
      scale: 0.62,
    }),
  ];
  const tabletKeys = [
    ...hold(0, pull, {
      ...TABLET_CENTRE,
      x: -900,
      y: 640,
      ry: 30,
      rz: -6,
      scale: 0.5,
    }),
    key(pull + 12, {
      ...TABLET_CENTRE,
      x: 520,
      y: 650,
      ry: 14,
      rz: -2,
      scale: 0.46,
    }),
    key(durationInFrames, {
      ...TABLET_CENTRE,
      x: 540,
      y: 650,
      ry: 4,
      scale: 0.47,
    }),
  ];
  const intro = interpolate(frame, [0, 9], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ fontFamily }}>
      <DeviceShot keys={tabletKeys}>
        {(pose) => (
          <Tablet light={pose.ry} style={rigStyle(pose, TABLET_SCREEN)}>
            <div
              style={{
                position: 'absolute',
                width: BROWSER.width,
                height: BROWSER.height,
                scale: TABLET_SCALE,
                transformOrigin: '0 0',
              }}
            >
              {screen}
            </div>
          </Tablet>
        )}
      </DeviceShot>
      <DeviceShot keys={browserKeys}>
        {(pose) => (
          <Browser
            address={chat.address}
            fontFamily={fontFamily}
            light={pose.ry}
            style={rigStyle(pose, BROWSER_PAGE)}
          >
            {screen}
          </Browser>
        )}
      </DeviceShot>
      <Headline
        lines={story.BEATS.experience.title}
        at={pull + 6}
        exit={diveAt}
        width={900}
        max={74}
        style={{ left: 150, top: 92 }}
      />
      <AbsoluteFill
        style={{
          background: theme.blue,
          opacity: intro,
          scale: 1 - (1 - intro) * 0.06,
        }}
      />
      <TileDive id="referral" at={diveAt} />
      <Disclaimers notes={story.PROMO.browser.notes} from={browserIn} />
      <Sfx kind="whoosh" at={browserIn - 8} />
      <Sfx kind="tap" at={signIn} />
      <Sfx kind="whoosh" at={pull - 2} />
      <Sfx kind="tap" at={tapSearch} />
      <Sfx kind="type" at={typeFrom} />
      <Sfx kind="chime" at={replyAt} />
      <Sfx kind="swish" at={diveAt + 6} />
    </AbsoluteFill>
  );
};
