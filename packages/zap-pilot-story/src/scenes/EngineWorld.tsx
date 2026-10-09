import { serializeEngineCss } from '../model/css.js';
import { engineFrame } from '../model/index.js';
import type { EngineFrame } from '../model/scene.js';
import { AssetGlyph } from './AssetGlyph.js';
import type { CSSProperties } from 'react';
export function EngineWorld({
  time,
  ambient = 0,
  narrow = false,
  veil = true,
  layers = ['faces', 'dial', 'dots', 'tags', 'pins'],
  frame,
  origin,
  perspectiveOrigin,
  pinLabels,
}: {
  time: number;
  ambient?: number;
  narrow?: boolean;
  veil?: boolean;
  layers?: readonly ('faces' | 'dial' | 'dots' | 'tags' | 'pins')[];
  frame?: EngineFrame;
  /** Camera origin as stage fractions, replacing the frame's own. */
  origin?: readonly [number, number];
  /** Perspective origin as stage fractions, replacing the frame's own. */
  perspectiveOrigin?: readonly [number, number];
  /** Host copy by pin id. A labelled text pin shows only that label. */
  pinLabels?: Readonly<Record<string, string>>;
}) {
  const source = frame ?? engineFrame(time, ambient, narrow);
  const world = serializeEngineCss({
    ...source,
    origin: origin ?? source.origin,
    perspectiveOrigin: perspectiveOrigin ?? source.perspectiveOrigin,
  });
  const camera = { left: world.ox, top: world.oy, transform: world.cam };
  const perspective = { perspective: world.persp, perspectiveOrigin: world.po };
  return (
    <>
      <div className="zp-persp" aria-hidden="true" style={perspective}>
        <div className="zp-world" style={camera}>
          {layers.includes('faces') &&
            world.faces.map((face, i) => (
              <div
                key={i}
                className="zp-fc"
                style={
                  {
                    width: face.w,
                    height: face.h,
                    transform: face.tf,
                    '--zp-face-fill': face.bg,
                    border: face.bd,
                    borderRadius: face.rad,
                    opacity: Number(face.op),
                    boxShadow: face.sh,
                    color: face.fg,
                    fontSize: face.fs,
                    fontWeight: face.fw,
                    padding: face.pad,
                    textAlign: face.ta as CSSProperties['textAlign'],
                    WebkitMaskImage: face.mask,
                    maskImage: face.mask,
                    clipPath: face.clip,
                  } as CSSProperties
                }
              >
                {face.glyph && <AssetGlyph asset={face.glyph} />}
                {face.text}
              </div>
            ))}
          {layers.includes('dial') ? (
            <div
              className="zp-dial3d"
              style={{
                width: world.dial.w,
                height: world.dial.h,
                transform: world.dial.tf,
              }}
            >
              <svg viewBox="0 0 100 90" width="100%" height="100%">
                <path
                  d="M21.7 78.3A40 40 0 1 1 78.3 78.3"
                  fill="none"
                  stroke="var(--rule-2)"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <path
                  d="M26.67 73.33L23.13 76.87M18.61 60.2L13.86 61.74M17.41 44.84L12.47 44.06M23.3 30.6L19.26 27.66M35.02 20.6L32.75 16.14M50 17L50 12M64.98 20.6L67.25 16.14M76.7 30.6L80.74 27.66M82.59 44.84L87.53 44.06M81.39 60.2L86.14 61.74M73.33 73.33L76.87 76.87"
                  fill="none"
                  stroke="var(--ink-3)"
                  strokeWidth="1.4"
                />
                <g transform={`rotate(${world.dial.ang} 50 50)`}>
                  <path d="M50 50L50 19" stroke="var(--ink)" strokeWidth="3" />
                </g>
                <circle cx="50" cy="50" r="4.5" fill="var(--ink)" />
                <text
                  x="50"
                  y="72"
                  textAnchor="middle"
                  fill="var(--ink)"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {world.dial.val}
                </text>
                <text
                  x="50"
                  y="84"
                  textAnchor="middle"
                  fill="var(--ink-3)"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 5.6 }}
                >
                  STABLES · TARGET
                </text>
              </svg>
            </div>
          ) : null}
          {layers.includes('dots') &&
            world.dots.map((dot, i) => (
              <span
                key={i}
                className="zp-dot3d"
                style={{
                  width: dot.sz,
                  height: dot.sz,
                  background: dot.bg,
                  opacity: Number(dot.op),
                  transform: dot.tf,
                }}
              />
            ))}
        </div>
      </div>
      {veil ? <div className="zp-veil" aria-hidden="true" /> : null}
      <div className="zp-persp" aria-hidden="true" style={perspective}>
        <div className="zp-world" style={camera}>
          {layers.includes('tags') &&
            world.tags.map((tag, i) => (
              <div
                key={i}
                className="zp-tag3d"
                style={{
                  opacity: Number(tag.op),
                  transform: tag.tf,
                  fontSize: tag.fs,
                }}
              >
                <span
                  className={tag.cls
                    .split(' ')
                    .map((c) => `zp-${c}`)
                    .join(' ')}
                >
                  <span className="zp-tag-n">{tag.n}</span>
                  {tag.t}
                  <span className="zp-tag-s">{tag.s}</span>
                </span>
                <span className="zp-tag-lead" />
              </div>
            ))}
          {layers.includes('pins') &&
            world.labels.map((pin, i) => {
              // The story subtitle is English copy, so a host label replaces it too.
              const label = pin.asset
                ? undefined
                : pinLabels?.[source.pins[i]!.id];
              return (
                <div
                  key={i}
                  className="zp-blb"
                  style={{
                    opacity: Number(pin.op),
                    transform: pin.tf,
                    fontSize: pin.fs,
                  }}
                >
                  <span
                    className={pin.cls
                      .split(' ')
                      .filter(Boolean)
                      .map((c) => `zp-${c}`)
                      .join(' ')}
                  >
                    <span>
                      {pin.asset ? (
                        <AssetGlyph asset={pin.asset} />
                      ) : (
                        (label ?? pin.t)
                      )}
                    </span>
                    <span className="zp-blb-s">
                      {label === undefined ? pin.s : ''}
                    </span>
                  </span>
                  <span className="zp-blb-stem" style={{ height: pin.stem }} />
                </div>
              );
            })}
        </div>
      </div>
    </>
  );
}
