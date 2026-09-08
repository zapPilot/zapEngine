import { tokens } from '@zapengine/design-tokens/tokens';
import type { ReactElement } from 'react';

// Keep the portrait design space frozen at the original master size. The
// isolated Sharp stage scales this master down to the v4 (720p) output
// dimensions without changing the layout proportions.
export const PORTRAIT_TEMPLATE_WIDTH = 2_160;
export const PORTRAIT_TEMPLATE_HEIGHT = 3_840;
const portraitCanvasWidth = PORTRAIT_TEMPLATE_WIDTH;
const portraitCanvasHeight = PORTRAIT_TEMPLATE_HEIGHT;
const portraitMediaTop = 1_240;
const portraitMediaBottom = 3_160;
const sans = 'Noto Sans TC';
const mono = 'JetBrains Mono';

const colors = {
  bg: tokens.color.bg,
  surface: tokens.color.surface,
  elevated: tokens.color['surface-elevated'],
  ink: tokens.color.ink,
  inkDim: tokens.color['ink-dim'],
  inkFaint: tokens.color['ink-faint'],
  accent: tokens.color.accent,
  accentSoft: tokens.color['accent-soft'],
  line: tokens.color['line-hi'],
} as const;

function Eyebrow({ children }: Readonly<{ children: string }>): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        color: colors.accent,
        fontFamily: mono,
        fontSize: 32,
        fontWeight: 700,
        letterSpacing: 4,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  );
}

export interface BrandFrameContent {
  kicker: string;
  titleLines: readonly string[];
}

export interface OutroContent {
  title: string;
  callToAction: string;
}

function BrandFrameTemplate({
  frame,
  logoDataUri,
}: Readonly<{
  frame: BrandFrameContent;
  logoDataUri: string;
}>): ReactElement {
  const topBandHeight = portraitMediaTop;
  const bottomBandTop = portraitMediaBottom;

  return (
    <div
      style={{
        width: portraitCanvasWidth,
        height: portraitCanvasHeight,
        display: 'flex',
        position: 'relative',
        color: colors.ink,
        fontFamily: sans,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'absolute',
          top: 0,
          left: 0,
          width: portraitCanvasWidth,
          height: topBandHeight,
          backgroundImage: `linear-gradient(180deg, ${colors.surface} 0%, ${colors.bg} 100%)`,
          borderBottom: `6px solid ${colors.accent}`,
        }}
      >
        <img
          alt="Zap Pilot"
          src={logoDataUri}
          width={500}
          height={139}
          style={{ marginTop: 88, objectFit: 'contain' }}
        />
        <div
          style={{
            display: 'flex',
            marginTop: 56,
            padding: '14px 44px',
            backgroundColor: colors.accent,
            borderRadius: 999,
            color: colors.bg,
            fontSize: 52,
            fontWeight: 700,
            letterSpacing: 6,
          }}
        >
          {frame.kicker}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: 44,
            padding: '44px 64px',
            backgroundColor: '#ffffff',
            borderRadius: 28,
            color: '#101014',
          }}
        >
          {frame.titleLines.map((line, index) => (
            <div
              key={`${index}-${line}`}
              style={{
                display: 'flex',
                fontSize: 104,
                fontWeight: 700,
                lineHeight: 1.28,
                letterSpacing: 2,
              }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: bottomBandTop,
          left: 0,
          width: portraitCanvasWidth,
          height: portraitCanvasHeight - bottomBandTop,
          backgroundColor: colors.bg,
          borderTop: `4px solid ${colors.line}`,
        }}
      />
    </div>
  );
}

function OutroTemplate({
  outro,
  logoDataUri,
}: Readonly<{
  outro: OutroContent;
  logoDataUri: string;
}>): ReactElement {
  return (
    <div
      style={{
        width: portraitCanvasWidth,
        height: portraitCanvasHeight,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        backgroundColor: colors.bg,
        color: colors.ink,
        fontFamily: sans,
      }}
    >
      <img
        alt="Zap Pilot"
        src={logoDataUri}
        width={700}
        height={194}
        style={{ objectFit: 'contain' }}
      />
      <div
        style={{
          display: 'flex',
          marginTop: 104,
          maxWidth: 1_880,
          fontSize: 92,
          fontWeight: 700,
          lineHeight: 1.3,
          textAlign: 'center',
        }}
      >
        {outro.title}
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 64,
          color: colors.accent,
          fontSize: 60,
          fontWeight: 700,
          letterSpacing: 6,
        }}
      >
        {outro.callToAction}
      </div>
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 96,
          color: colors.inkFaint,
          fontFamily: mono,
          fontSize: 38,
          letterSpacing: 2,
        }}
      >
        MEDIA&nbsp;·&nbsp;ORIGINAL&nbsp;PUBLISHERS
      </div>
    </div>
  );
}

export const CONCEPT_CARD_WIDTH = 2_880;
export const CONCEPT_CARD_HEIGHT = 2_560;

export interface ConceptCardContent {
  kicker: string;
  headline: string;
  points: readonly string[];
}

export function renderConceptCardElement(
  card: ConceptCardContent,
): ReactElement {
  return (
    <div
      style={{
        width: CONCEPT_CARD_WIDTH,
        height: CONCEPT_CARD_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        padding: '210px 220px',
        backgroundColor: colors.bg,
        color: colors.ink,
        fontFamily: sans,
      }}
    >
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          width: 920,
          height: 920,
          right: -260,
          top: -260,
          border: `42px solid ${colors.accentSoft}`,
          borderRadius: 460,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 128,
          top: 210,
          width: 18,
          height: 1_920,
          backgroundColor: colors.accent,
        }}
      />
      <Eyebrow>{card.kicker}</Eyebrow>
      <div
        style={{
          display: 'flex',
          maxWidth: 2_180,
          marginTop: 74,
          fontSize: 176,
          fontWeight: 700,
          lineHeight: 1.02,
          letterSpacing: -5,
        }}
      >
        {card.headline}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 54,
          marginTop: 130,
        }}
      >
        {card.points.slice(0, 3).map((point, index) => (
          <div
            key={`${index}-${point}`}
            style={{ display: 'flex', alignItems: 'center', gap: 46 }}
          >
            <div
              style={{
                display: 'flex',
                width: 96,
                color: colors.accent,
                fontFamily: mono,
                fontSize: 48,
                fontWeight: 700,
              }}
            >
              {String(index + 1).padStart(2, '0')}
            </div>
            <div
              style={{
                display: 'flex',
                maxWidth: 1_880,
                fontSize: 72,
                fontWeight: 700,
                lineHeight: 1.14,
              }}
            >
              {point}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 220,
          bottom: 104,
          color: colors.inkFaint,
          fontFamily: mono,
          fontSize: 34,
          letterSpacing: 3,
        }}
      >
        ZAP PILOT · GENERATED CONCEPT CARD
      </div>
    </div>
  );
}

export function renderBrandFrameElement(
  frame: BrandFrameContent,
  logoDataUri: string,
): ReactElement {
  return <BrandFrameTemplate frame={frame} logoDataUri={logoDataUri} />;
}

export function renderOutroElement(
  outro: OutroContent,
  logoDataUri: string,
): ReactElement {
  return <OutroTemplate outro={outro} logoDataUri={logoDataUri} />;
}
