import type { ReactNode } from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';

import { Browser, BROWSER_PAGE } from '../../../primitives/Browser';
import { DeviceShot } from '../../../primitives/DeviceShot';
import { Rise } from '../../../primitives/Kinetic';
import { type RigKey, rigStyle } from '../../../primitives/rig';
import { Sfx } from '../../../primitives/Sfx';
import { fitFontSize } from '../../../primitives/text';
import { Disclaimers } from '../../kokode-clinic/primitives/Disclaimers';
import { theme } from '../../kokode-clinic/theme';
import { usePromo } from '../context';
import type { DisclaimerId, InterestId } from '../story';
import { Console, Thread } from './Console';
import { headline, subline } from './look';
import { Tile, tileLook } from './Tile';

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Where a chapter's tile, title and line sit, on the slab and on the page. */
const SPOT = {
  left: 150,
  tile: 230,
  title: 390,
  sub: 600,
  tileSize: 124,
  width: 1500,
} as const;

export interface ChapterCopy {
  readonly id: InterestId;
  readonly title: string;
  readonly sub: string;
}

function useChapterType(copy: ChapterCopy) {
  const { fontFamily, lang } = usePromo();
  return {
    title: headline(
      fontFamily,
      lang,
      fitFontSize([copy.title], SPOT.width, 168),
    ),
    sub: subline(fontFamily, fitFontSize([copy.sub], SPOT.width, 58)),
  };
}

/**
 * The chapter's opening: its tile colour fills the frame, the title rises in
 * white, then the colour wipes away right to left and uncovers the same words
 * in ink on the page (`ChapterCaption`).
 */
export function ChapterSlab({
  copy,
  wipeAt,
}: {
  readonly copy: ChapterCopy;
  readonly wipeAt: number;
}) {
  const frame = useCurrentFrame();
  const type = useChapterType(copy);
  const look = tileLook(copy.id);
  const pop = interpolate(frame, [0, 10], [0.5, 1], {
    ...CLAMP,
    easing: Easing.out(Easing.back(1.8)),
  });
  const wipe = interpolate(frame, [wipeAt, wipeAt + 12], [0, 100], {
    ...CLAMP,
    easing: Easing.bezier(0.7, 0, 0.2, 1),
  });
  if (wipe >= 100) return null;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1400px 900px at 20% 10%, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0) 60%), ${look.fill}`,
        clipPath: `inset(0 ${wipe}% 0 0)`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: SPOT.left,
          top: SPOT.tile,
          scale: pop,
          transformOrigin: '0 50%',
        }}
      >
        <Tile
          id={copy.id}
          size={SPOT.tileSize}
          style={{ background: theme.surface, filter: 'none' }}
        />
      </div>
      <Rise
        text={copy.title}
        at={3}
        look={{ ...type.title, color: theme.surface }}
        style={{ position: 'absolute', left: SPOT.left - 6, top: SPOT.title }}
      />
      <Rise
        text={copy.sub}
        at={12}
        stagger={1}
        duration={12}
        look={{ ...type.sub, color: 'rgba(255, 255, 255, 0.86)' }}
        style={{ position: 'absolute', left: SPOT.left, top: SPOT.sub }}
      />
    </AbsoluteFill>
  );
}

/**
 * The chapter's words in ink at the slab's spot. Under a slab they wait fully
 * drawn; from `settleAt` they shrink into a caption at the top left so the
 * screen can take the stage, and `exitAt` lifts them away.
 */
export function ChapterCaption({
  copy,
  settleAt,
  exitAt,
  scale = 0.5,
}: {
  readonly copy: ChapterCopy;
  readonly settleAt: number;
  readonly exitAt?: number;
  /** How small the words settle. */
  readonly scale?: number;
}) {
  const frame = useCurrentFrame();
  const type = useChapterType(copy);
  const settle = interpolate(frame, [settleAt, settleAt + 16], [1, scale], {
    ...CLAMP,
    easing: Easing.bezier(0.65, 0, 0.35, 1),
  });
  const gone =
    exitAt === undefined
      ? 0
      : interpolate(frame, [exitAt, exitAt + 10], [0, 1], CLAMP);
  return (
    <div
      style={{
        position: 'absolute',
        left: SPOT.left,
        top: SPOT.tile - 120 * ((1 - settle) / (1 - scale)),
        scale: settle,
        transformOrigin: '0 0',
        opacity: 1 - gone,
        translate: `0px ${-gone * 30}px`,
      }}
    >
      <Tile id={copy.id} size={SPOT.tileSize} />
      <Rise
        text={copy.title}
        at={-100}
        look={type.title}
        style={{ position: 'absolute', left: -6, top: SPOT.title - SPOT.tile }}
      />
      <Rise
        text={copy.sub}
        at={-100}
        look={type.sub}
        style={{ position: 'absolute', left: 0, top: SPOT.sub - SPOT.tile }}
      />
    </div>
  );
}

/**
 * The hand-off to a chapter: its tile drops in small, then dives at the camera
 * until its colour is the whole frame; the next scene opens on that colour.
 */
export function TileDive({
  id,
  at,
  frames = 24,
  from = { x: 1640, y: 820 },
}: {
  readonly id: InterestId;
  readonly at: number;
  readonly frames?: number;
  readonly from?: { readonly x: number; readonly y: number };
}) {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const appear = interpolate(frame, [at, at + 8], [0, 1], {
    ...CLAMP,
    easing: Easing.out(Easing.back(2)),
  });
  const dive = interpolate(frame, [at + 8, at + frames], [0, 1], {
    ...CLAMP,
    easing: Easing.bezier(0.7, 0, 0.84, 0),
  });
  const size = 120;
  return (
    <div
      style={{
        position: 'absolute',
        left: from.x + (960 - from.x) * dive - size / 2,
        top: from.y + (540 - from.y) * dive - size / 2,
        scale: appear * (1 + dive * 26),
        rotate: `${(1 - appear) * -30 + dive * 8}deg`,
      }}
    >
      <Tile id={id} size={size} style={{ opacity: 1 }} />
    </div>
  );
}

/** A chapter's words: its tile's label over the beat headline it demonstrates. */
export function useChapterCopy(
  id: InterestId,
  sub: readonly string[],
): ChapterCopy {
  const { story, lang } = usePromo();
  const tile = story.PROMO_UI.tiles.find((candidate) => candidate.id === id);
  return {
    id,
    title: tile?.label ?? '',
    sub: sub.join(lang === 'en' ? ' ' : ''),
  };
}

/** Frames into a chapter when its slab wipes away. */
const WIPE_AT = 24;

/**
 * A demo chapter: the slab in its colour, then the words settled top left
 * and the workflow running in a browser on the rig, its thread in the
 * browser's 3D overlay so items can lift off the page. `children` sit above
 * the browser, under the slab.
 */
export function ChapterScene({
  copy,
  askAt,
  notes,
  keys,
  thread,
  lift,
  captionExit,
  children,
}: {
  readonly copy: ChapterCopy;
  /** Frame the request is made: the browser has arrived. */
  readonly askAt: number;
  readonly notes: readonly DisclaimerId[];
  readonly keys: readonly RigKey[];
  readonly thread: readonly ReactNode[];
  readonly lift?: readonly number[];
  readonly captionExit?: number;
  readonly children?: ReactNode;
}) {
  const { story, fontFamily } = usePromo();
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily }}>
      <ChapterCaption
        copy={copy}
        settleAt={WIPE_AT + 6}
        exitAt={captionExit}
        scale={0.4}
      />
      <DeviceShot keys={keys}>
        {(pose) => (
          <Browser
            address={story.DEMOS.chat.address}
            fontFamily={fontFamily}
            light={pose.ry}
            style={rigStyle(pose, BROWSER_PAGE)}
            overlay={<Thread items={thread} lift={lift} />}
          >
            <Console view="chat" active={copy.id} />
          </Browser>
        )}
      </DeviceShot>
      {children}
      <ChapterSlab copy={copy} wipeAt={WIPE_AT} />
      {frame >= askAt ? <Disclaimers notes={notes} from={askAt} /> : null}
      <Sfx kind="swish" at={WIPE_AT} />
      <Sfx kind="whoosh" at={askAt - 10} />
      <Sfx kind="type" at={askAt + 4} />
    </AbsoluteFill>
  );
}
