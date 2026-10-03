import type React from 'react';
import type { CSSProperties } from 'react';
import { AbsoluteFill, Easing, Img, staticFile, useCurrentFrame } from 'remotion';

import { color, hairline } from '../brand/tokens';
import type { CapturedShot } from '../captures/manifest';
import {
  type Box,
  type Camera,
  cameraAt,
  containCamera,
  focusCamera,
  fullCamera,
  projectBox,
  type Size,
} from './camera';
import { frame as FRAME } from './layout';
import { glide, rise } from './motion';

export type CameraKey = {
  /** Scene frame at which the camera has arrived at this framing. */
  readonly at: number;
  /** A target named in the shot list; omit to frame the whole capture. */
  readonly target?: string;
  /** Share of the view the target fills. */
  readonly fill?: number;
  /** Where the target centre sits, as fractions of the view. */
  readonly anchor?: { readonly x: number; readonly y: number };
};

export type ShotHighlight = {
  readonly target: string;
  readonly from: number;
  readonly to?: number;
};

/** A synthetic pointer gliding to `target` and clicking at `at`. */
export type ShotClick = {
  readonly target: string;
  readonly from: number;
  readonly at: number;
};

const easeInOut = Easing.inOut(Easing.cubic);

function targetBox(shot: CapturedShot, name: string): Box {
  const box = shot.targets[name];
  if (box === undefined) {
    throw new Error(`Capture has no target "${name}"; re-run pnpm capture.`);
  }
  return box;
}

function keyCamera(shot: CapturedShot, key: CameraKey, view: Size, page: boolean): Camera {
  const image = { width: shot.width, height: shot.height };
  if (key.target === undefined) {
    return page
      ? fullCamera(image, view)
      : containCamera(image, { x: 0, y: 0, ...view });
  }
  return focusCamera(targetBox(shot, key.target), image, view, {
    fill: key.fill,
    anchor: key.anchor,
    maxScale: shot.deviceScaleFactor,
    cover: page,
  });
}

const HighlightBox: React.FC<{
  readonly box: Box;
  readonly from: number;
  readonly to?: number;
}> = ({ box, from, to }) => {
  const frame = useCurrentFrame();
  const draw = rise(frame, from, 16);
  const fade = to === undefined ? 1 : 1 - rise(frame, to, 10);
  if (draw === 0) return null;
  const pad = 12;
  const width = box.width + pad * 2;
  const height = box.height + pad * 2;
  return (
    <svg
      width={width}
      height={height}
      style={{
        position: 'absolute',
        left: box.x - pad,
        top: box.y - pad,
        overflow: 'visible',
        opacity: fade,
        filter: 'drop-shadow(0 0 18px rgba(212, 197, 163, 0.35))',
      }}
    >
      <rect
        x={1.5}
        y={1.5}
        width={width - 3}
        height={height - 3}
        rx={14}
        fill={color.accentSubtle}
        stroke={color.accent}
        strokeWidth={3}
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - draw}
      />
    </svg>
  );
};

const Pointer: React.FC<{
  readonly point: { readonly x: number; readonly y: number };
  readonly from: number;
  readonly at: number;
}> = ({ point, from, at }) => {
  const frame = useCurrentFrame();
  if (frame < from) return null;
  const travel = glide(frame, from, Math.max(1, at - from - 2));
  const ripple = rise(frame, at, 18);
  const visible = rise(frame, from, 8) * (1 - rise(frame, at + 24, 10));
  return (
    <>
      {frame >= at ? (
        <div
          style={{
            position: 'absolute',
            left: point.x - 14 - 56 * ripple,
            top: point.y - 14 - 56 * ripple,
            width: 28 + 112 * ripple,
            height: 28 + 112 * ripple,
            borderRadius: 999,
            border: `3px solid ${color.accent}`,
            opacity: 1 - ripple,
          }}
        />
      ) : null}
      <svg
        width={40}
        height={48}
        viewBox="0 0 20 24"
        style={{
          position: 'absolute',
          left: point.x - 3 + 240 * (1 - travel),
          top: point.y - 2 + 170 * (1 - travel),
          opacity: visible,
          scale: frame >= at - 2 && frame < at + 5 ? '0.86' : '1',
          transformOrigin: '3px 2px',
          filter: 'drop-shadow(0 6px 10px rgba(0, 0, 0, 0.55))',
        }}
      >
        <path
          d="M2 1.5 L2 19 L6.6 14.8 L9.6 21.6 L12.6 20.3 L9.7 13.6 L16 13.4 Z"
          fill={color.ink}
          stroke={color.bg}
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
      </svg>
    </>
  );
};

/**
 * A real product capture behind a virtual camera. Framings name targets from
 * the shot list (measured at capture time), so a UI change is fixed by
 * re-running `pnpm capture`, never by editing coordinates.
 *
 * `page` fills the frame. `window` shows the capture inside `region` as a
 * rounded viewport, for element captures beside other graphics.
 */
export const UiShot: React.FC<{
  readonly shot: CapturedShot;
  readonly mode?: 'page' | 'window';
  readonly region?: Box;
  readonly keys: readonly CameraKey[];
  /** Frames each camera move takes, ending on its key's `at`. */
  readonly move?: number;
  readonly highlights?: readonly ShotHighlight[];
  readonly click?: ShotClick;
  readonly style?: CSSProperties;
}> = ({ shot, mode = 'page', region, keys, move = 26, highlights = [], click, style }) => {
  const frame = useCurrentFrame();
  const page = mode === 'page';
  const view: Box = page || region === undefined ? { x: 0, y: 0, ...FRAME } : region;
  const size = { width: view.width, height: view.height };
  const stops = keys.map((key) => ({ at: key.at, camera: keyCamera(shot, key, size, page) }));
  const camera = cameraAt(stops, frame, move, size, easeInOut);
  const boxOf = (name: string) => projectBox(targetBox(shot, name), camera);
  const clickBox = click === undefined ? null : boxOf(click.target);
  return (
    <AbsoluteFill style={style}>
      <div
        style={{
          position: 'absolute',
          left: view.x,
          top: view.y,
          width: view.width,
          height: view.height,
          overflow: 'hidden',
          ...(page
            ? {}
            : {
                borderRadius: 28,
                border: hairline,
                background: color.bg,
                boxShadow: '0 40px 120px rgba(0, 0, 0, 0.55)',
              }),
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: shot.width,
            height: shot.height,
            transformOrigin: '0 0',
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
          }}
        >
          <Img src={staticFile(shot.file)} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
        {page ? (
          <AbsoluteFill
            style={{
              background: [
                'linear-gradient(to bottom, rgba(10, 10, 10, 0.85), transparent 12%, transparent 74%, rgba(10, 10, 10, 0.92))',
                'radial-gradient(ellipse 85% 75% at 50% 45%, transparent 60%, rgba(10, 10, 10, 0.55))',
              ].join(', '),
            }}
          />
        ) : null}
        {highlights.map((highlight) => (
          <HighlightBox
            key={`${highlight.target}-${highlight.from}`}
            box={boxOf(highlight.target)}
            from={highlight.from}
            to={highlight.to}
          />
        ))}
        {click !== undefined && clickBox !== null ? (
          <Pointer
            point={{ x: clickBox.x + clickBox.width / 2, y: clickBox.y + clickBox.height / 2 }}
            from={click.from}
            at={click.at}
          />
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
