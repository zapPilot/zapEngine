import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import tokens from '@zapengine/design-tokens/tokens.json';
import {
  BRAND_NAME,
  SLOGAN_PARTS,
  oneLiner,
  isLive,
} from '@zapengine/zap-pilot-story/brand';
import {
  CAPABILITIES,
  STATUS_LABEL,
  type CapabilityId,
} from '@zapengine/zap-pilot-story/facts';
import { HERO } from '@zapengine/zap-pilot-story/copy';
export const ogContentType = 'image/png';
export const ogSize = { width: 1200, height: 630 };
export const ogFonts = [
  {
    name: tokens.font.native.display.family,
    data: readFileSync(
      join(
        process.cwd(),
        'node_modules/@zapengine/design-tokens/fonts/static',
        tokens.font.native.display.file,
      ),
    ),
    weight: 400 as const,
    style: 'normal' as const,
  },
];
const mode = tokens.mode.paper;
const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${tokens.mark.viewBox.join(' ')}">${tokens.mark.layers.map((layer) => (layer.kind === 'path' ? `<path d="${layer.d}" fill="none" stroke="${mode[layer.role as keyof typeof mode]}" stroke-width="${layer.strokeWidth}" stroke-linecap="round"/>` : `<circle cx="${layer.cx}" cy="${layer.cy}" r="${layer.r}" fill="${mode[layer.role as keyof typeof mode]}"/>`)).join('')}</svg>`;
function OgStatus({ capability }: { capability: CapabilityId }) {
  const status = CAPABILITIES[capability].status;
  const glyph = tokens.status[status].glyph;
  return (
    <span
      data-capability={capability}
      data-status={status}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 16,
        color: mode['ink-2'],
      }}
    >
      <span
        style={{
          display: 'flex',
          width: 14,
          height: 14,
          borderRadius: 7,
          border: `1.5px ${tokens.status[status].line} ${mode.ink}`,
          backgroundColor: glyph === 'filled' ? mode.ink : mode.ground,
          ...(glyph === 'half'
            ? {
                backgroundImage: `linear-gradient(90deg, ${mode.ink} 50%, ${mode.ground} 50%)`,
              }
            : {}),
        }}
      >
        {glyph === 'center-dot' ? (
          <span
            style={{
              display: 'flex',
              width: 4,
              height: 4,
              borderRadius: 2,
              margin: 'auto',
              backgroundColor: mode.ink,
            }}
          />
        ) : null}
      </span>
      {STATUS_LABEL[status]}
    </span>
  );
}
function OgSlogan() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        fontSize: 58,
        lineHeight: 1.05,
      }}
    >
      {SLOGAN_PARTS.map((part) => (
        <div key={part.capability} style={{ display: 'flex', gap: 14 }}>
          <span>Your</span>
          <span
            style={{
              color: !isLive(part.capability)
                ? mode.ground
                : 'sign' in part
                  ? mode['sign-ink']
                  : mode.ink,
              ...(!isLive(part.capability)
                ? { WebkitTextStroke: `1.5px ${mode.ink}` }
                : {}),
            }}
          >
            {part.word}
          </span>
        </div>
      ))}
    </div>
  );
}
export function OgCard({
  label,
  url,
  footer,
}: {
  label: string;
  url: string;
  footer: string;
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '42px 64px',
        backgroundColor: mode.ground,
        color: mode.ink,
        fontFamily: tokens.font.native.display.family,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse is rendered by Satori, which cannot use next/image. */}
        <img
          width={40}
          height={40}
          alt=""
          src={`data:image/svg+xml,${encodeURIComponent(mark)}`}
        />
        <span style={{ fontSize: 22 }}>
          {BRAND_NAME} · {label}
        </span>
      </div>
      <OgSlogan />
      <div style={{ display: 'flex', fontSize: 22 }}>{oneLiner()}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {HERO.chips.map((chip) => (
          <div
            key={chip.text}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              fontSize: 16,
            }}
          >
            <span>{chip.text}</span>
            <OgStatus capability={chip.capability} />
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 16,
        }}
      >
        <span>{url}</span>
        <span>{footer}</span>
      </div>
    </div>
  );
}
