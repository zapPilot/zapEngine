import { tokens } from '@zapengine/design-tokens/tokens';
import type { CSSProperties, ReactElement } from 'react';

import type { ResolvedSlideAsset } from './assets.js';
import {
  MEDIA_WINDOW,
  PORTRAIT_OUTPUT_HEIGHT,
  PORTRAIT_OUTPUT_WIDTH,
  RASTER_SCALE,
  type Slide,
  type SlideSource,
} from './manifest.js';

const canvasWidth = 3_840;
const canvasHeight = 2_160;
const portraitCanvasWidth = PORTRAIT_OUTPUT_WIDTH * RASTER_SCALE;
const portraitCanvasHeight = PORTRAIT_OUTPUT_HEIGHT * RASTER_SCALE;
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

const rootStyle: CSSProperties = {
  width: canvasWidth,
  height: canvasHeight,
  display: 'flex',
  position: 'relative',
  overflow: 'hidden',
  backgroundColor: colors.bg,
  color: colors.ink,
  fontFamily: sans,
};

function primarySource(slide: Slide): SlideSource {
  const source = slide.sources[0];
  if (!source)
    throw new Error(`Slide ${slide.id} is missing its primary source`);
  return source;
}

function Logo({ dataUri }: Readonly<{ dataUri: string }>): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        position: 'absolute',
        top: 112,
        left: 144,
        height: 76,
      }}
    >
      <img
        alt="Zap Pilot"
        src={dataUri}
        width={274}
        height={76}
        style={{ objectFit: 'contain' }}
      />
    </div>
  );
}

function EditorialRule(): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        position: 'absolute',
        left: 144,
        right: 144,
        top: 224,
        height: 2,
        backgroundColor: colors.line,
      }}
    />
  );
}

function SourceFooter({
  source,
}: Readonly<{ source: SlideSource }>): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        position: 'absolute',
        left: 144,
        right: 144,
        bottom: 54,
        height: 42,
        color: colors.inkDim,
        fontFamily: mono,
        fontSize: 26,
        letterSpacing: 1,
      }}
    >
      SOURCE&nbsp;·&nbsp;{source.label}&nbsp;·&nbsp;
      {source.license.toUpperCase()}
    </div>
  );
}

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

function AssetPanel({
  asset,
  width,
  height,
}: Readonly<{
  asset: ResolvedSlideAsset;
  width: number;
  height: number;
}>): ReactElement {
  if (asset.kind === 'fallback') {
    return (
      <div
        style={{
          width,
          height,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 80,
          border: `2px solid ${colors.line}`,
          backgroundColor: colors.surface,
        }}
      >
        <div
          style={{
            display: 'flex',
            color: colors.accent,
            fontFamily: mono,
            fontSize: 30,
            letterSpacing: 3,
          }}
        >
          VERIFIED SOURCE CARD
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 66,
            fontWeight: 700,
            lineHeight: 1.18,
          }}
        >
          {asset.source?.label ?? 'Zap Pilot Editorial'}
        </div>
        <div
          style={{
            display: 'flex',
            color: colors.inkDim,
            fontSize: 30,
            lineHeight: 1.45,
          }}
        >
          {asset.reason}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        border: `2px solid ${colors.line}`,
        backgroundColor: colors.elevated,
      }}
    >
      <img
        alt={asset.source.label}
        src={asset.dataUri}
        width={width}
        height={height}
        style={{
          width,
          height,
          objectFit: asset.layout === 'fullBleed' ? 'cover' : 'contain',
          objectPosition: asset.position,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: 30,
          bottom: 24,
          padding: '12px 20px',
          backgroundColor: 'rgba(10, 10, 10, 0.84)',
          color: colors.inkDim,
          fontFamily: mono,
          fontSize: 22,
        }}
      >
        {asset.source.attribution}
      </div>
    </div>
  );
}

function CoverTemplate({
  slide,
  logoDataUri,
}: Readonly<{
  slide: Extract<Slide, { template: 'cover' }>;
  logoDataUri: string;
}>): ReactElement {
  return (
    <div style={rootStyle}>
      <Logo dataUri={logoDataUri} />
      <EditorialRule />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 304,
          right: 144,
          color: colors.inkFaint,
          fontFamily: mono,
          fontSize: 28,
          letterSpacing: 3,
        }}
      >
        NEWS BRIEFING&nbsp;&nbsp;/&nbsp;&nbsp;ZH-HANT
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          left: 144,
          top: 462,
          width: 2_950,
        }}
      >
        <Eyebrow>{slide.kicker}</Eyebrow>
        <div
          style={{
            display: 'flex',
            marginTop: 74,
            fontSize: 196,
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: -7,
          }}
        >
          {slide.headline}
        </div>
        <div
          style={{
            display: 'flex',
            width: 2_500,
            marginTop: 64,
            color: colors.inkDim,
            fontSize: 60,
            lineHeight: 1.42,
          }}
        >
          {slide.subheadline}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: -260,
          bottom: -500,
          width: 1_300,
          height: 1_300,
          border: `150px solid ${colors.accentSoft}`,
          borderRadius: 650,
        }}
      />
      <SourceFooter source={primarySource(slide)} />
    </div>
  );
}

function PhotoFactTemplate({
  slide,
  asset,
  logoDataUri,
}: Readonly<{
  slide: Extract<Slide, { template: 'photoFact' }>;
  asset: ResolvedSlideAsset;
  logoDataUri: string;
}>): ReactElement {
  return (
    <div style={rootStyle}>
      <Logo dataUri={logoDataUri} />
      <EditorialRule />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          left: 144,
          top: 344,
          width: 1_570,
          height: 1_600,
        }}
      >
        <Eyebrow>{slide.eyebrow}</Eyebrow>
        <div
          style={{
            display: 'flex',
            marginTop: 52,
            fontSize: 124,
            fontWeight: 700,
            lineHeight: 1.12,
            letterSpacing: -3,
          }}
        >
          {slide.headline}
        </div>
        {slide.subheadline ? (
          <div
            style={{
              display: 'flex',
              marginTop: 36,
              color: colors.inkDim,
              fontSize: 42,
              lineHeight: 1.45,
            }}
          >
            {slide.subheadline}
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 70,
            borderTop: `2px solid ${colors.line}`,
          }}
        >
          {slide.facts.map((fact, index) => (
            <div
              key={fact}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '34px 0',
                borderBottom: `2px solid ${colors.line}`,
                color: colors.inkDim,
                fontSize: 38,
              }}
            >
              <span
                style={{
                  color: colors.accent,
                  fontFamily: mono,
                  fontSize: 28,
                  marginRight: 28,
                }}
              >
                0{index + 1}
              </span>
              {fact}
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 310,
          right: 144,
        }}
      >
        <AssetPanel asset={asset} width={1_780} height={1_600} />
      </div>
      <SourceFooter source={primarySource(slide)} />
    </div>
  );
}

function StatisticTemplate({
  slide,
  logoDataUri,
}: Readonly<{
  slide: Extract<Slide, { template: 'statistic' }>;
  logoDataUri: string;
}>): ReactElement {
  return (
    <div style={rootStyle}>
      <Logo dataUri={logoDataUri} />
      <EditorialRule />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          left: 144,
          right: 144,
          top: 338,
        }}
      >
        <Eyebrow>{slide.eyebrow}</Eyebrow>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            marginTop: 80,
          }}
        >
          <div
            style={{
              display: 'flex',
              color: colors.accent,
              fontFamily: mono,
              fontSize: 330,
              fontWeight: 700,
              lineHeight: 0.9,
              letterSpacing: -18,
            }}
          >
            {slide.value}
          </div>
          {slide.unit ? (
            <div
              style={{
                display: 'flex',
                marginBottom: 32,
                marginLeft: 42,
                color: colors.inkDim,
                fontFamily: mono,
                fontSize: 66,
              }}
            >
              {slide.unit}
            </div>
          ) : null}
        </div>
        <div
          style={{
            display: 'flex',
            width: 2_860,
            marginTop: 64,
            fontSize: 84,
            fontWeight: 700,
            lineHeight: 1.28,
          }}
        >
          {slide.label}
        </div>
        {slide.context ? (
          <div
            style={{
              display: 'flex',
              width: 2_700,
              marginTop: 34,
              color: colors.inkDim,
              fontSize: 42,
              lineHeight: 1.5,
            }}
          >
            {slide.context}
          </div>
        ) : null}
      </div>
      {slide.secondaryValue && slide.secondaryLabel ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            position: 'absolute',
            right: 144,
            bottom: 270,
            width: 1_180,
            padding: '54px 62px',
            borderLeft: `12px solid ${colors.accent}`,
            backgroundColor: colors.surface,
          }}
        >
          <div
            style={{
              display: 'flex',
              color: colors.accent,
              fontFamily: mono,
              fontSize: 84,
              fontWeight: 700,
            }}
          >
            {slide.secondaryValue}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 16,
              color: colors.inkDim,
              fontSize: 32,
              lineHeight: 1.4,
            }}
          >
            {slide.secondaryLabel}
          </div>
        </div>
      ) : null}
      <SourceFooter source={primarySource(slide)} />
    </div>
  );
}

function DocumentTemplate({
  slide,
  logoDataUri,
}: Readonly<{
  slide: Extract<Slide, { template: 'document' }>;
  logoDataUri: string;
}>): ReactElement {
  return (
    <div style={rootStyle}>
      <Logo dataUri={logoDataUri} />
      <EditorialRule />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          left: 144,
          top: 346,
          width: 1_180,
        }}
      >
        <Eyebrow>PRIMARY DOCUMENT</Eyebrow>
        <div
          style={{
            display: 'flex',
            marginTop: 68,
            fontSize: 112,
            fontWeight: 700,
            lineHeight: 1.16,
          }}
        >
          {slide.issuer}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 92,
            color: colors.inkDim,
            fontFamily: mono,
            fontSize: 32,
            lineHeight: 1.7,
          }}
        >
          <span>ORDER&nbsp;&nbsp;{slide.documentNumber}</span>
          <span>DATE&nbsp;&nbsp;&nbsp;{slide.date}</span>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          top: 310,
          right: 144,
          width: 2_140,
          height: 1_610,
          padding: '108px 120px',
          backgroundColor: '#ece9e0',
          color: '#171717',
          boxShadow: '0 30px 100px rgba(0, 0, 0, 0.45)',
        }}
      >
        <div
          style={{
            display: 'flex',
            color: '#625d52',
            fontFamily: mono,
            fontSize: 28,
            letterSpacing: 3,
          }}
        >
          UNITED STATES DEPARTMENT OF ENERGY
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 82,
            fontSize: 82,
            fontWeight: 700,
            lineHeight: 1.23,
          }}
        >
          {slide.headline}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 72,
            paddingTop: 58,
            borderTop: '3px solid #918a7c',
            color: '#4b463e',
            fontSize: 44,
            lineHeight: 1.58,
          }}
        >
          {slide.excerpt}
        </div>
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            left: 120,
            bottom: 92,
            color: '#777064',
            fontFamily: mono,
            fontSize: 25,
          }}
        >
          OFFICIAL SOURCE&nbsp;&nbsp;·&nbsp;&nbsp;ENERGY.GOV
        </div>
      </div>
      <SourceFooter source={primarySource(slide)} />
    </div>
  );
}

function SourceQuoteTemplate({
  slide,
  asset,
  logoDataUri,
}: Readonly<{
  slide: Extract<Slide, { template: 'sourceQuote' }>;
  asset: ResolvedSlideAsset;
  logoDataUri: string;
}>): ReactElement {
  return (
    <div style={rootStyle}>
      <Logo dataUri={logoDataUri} />
      <EditorialRule />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 144,
          top: 332,
        }}
      >
        <AssetPanel asset={asset} width={1_510} height={1_530} />
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          right: 144,
          top: 344,
          width: 1_790,
          height: 1_520,
        }}
      >
        <Eyebrow>{slide.eyebrow}</Eyebrow>
        <div
          style={{
            display: 'flex',
            marginTop: 70,
            color: colors.accent,
            fontSize: 154,
            fontWeight: 700,
            lineHeight: 0.5,
          }}
        >
          “
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 38,
            fontSize: 78,
            fontWeight: 700,
            lineHeight: 1.38,
          }}
        >
          {slide.quote}
        </div>
        {slide.context ? (
          <div
            style={{
              display: 'flex',
              marginTop: 50,
              color: colors.inkDim,
              fontSize: 38,
              lineHeight: 1.5,
            }}
          >
            {slide.context}
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            left: 0,
            bottom: 42,
            paddingTop: 28,
            borderTop: `2px solid ${colors.line}`,
            color: colors.inkDim,
            fontFamily: mono,
            fontSize: 29,
          }}
        >
          {slide.citation}
        </div>
      </div>
      <SourceFooter source={primarySource(slide)} />
    </div>
  );
}

function ImageTemplate({
  slide,
  asset,
  logoDataUri,
}: Readonly<{
  slide: Extract<Slide, { template: 'image' }>;
  asset: ResolvedSlideAsset;
  logoDataUri: string;
}>): ReactElement {
  if (asset.kind !== 'image' || !asset.dataUri) {
    throw new Error(`Scene ${slide.id} requires a resolved remote image`);
  }

  return (
    <div style={rootStyle}>
      <img
        alt=""
        src={asset.dataUri}
        width={canvasWidth}
        height={canvasHeight}
        style={{
          width: canvasWidth,
          height: canvasHeight,
          objectFit: 'cover',
          objectPosition: asset.position,
        }}
      />
      <Logo dataUri={logoDataUri} />
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
  const topBandHeight = MEDIA_WINDOW.y * RASTER_SCALE;
  const bottomBandTop = (MEDIA_WINDOW.y + MEDIA_WINDOW.height) * RASTER_SCALE;

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
        MEDIA&nbsp;·&nbsp;PEXELS&nbsp;·&nbsp;PIXABAY
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

export function renderSlideElement(
  slide: Slide,
  asset: ResolvedSlideAsset,
  logoDataUri: string,
): ReactElement {
  switch (slide.template) {
    case 'image':
      return (
        <ImageTemplate slide={slide} asset={asset} logoDataUri={logoDataUri} />
      );
    case 'cover':
      return <CoverTemplate slide={slide} logoDataUri={logoDataUri} />;
    case 'photoFact':
      return (
        <PhotoFactTemplate
          slide={slide}
          asset={asset}
          logoDataUri={logoDataUri}
        />
      );
    case 'statistic':
      return <StatisticTemplate slide={slide} logoDataUri={logoDataUri} />;
    case 'document':
      return <DocumentTemplate slide={slide} logoDataUri={logoDataUri} />;
    case 'sourceQuote':
      return (
        <SourceQuoteTemplate
          slide={slide}
          asset={asset}
          logoDataUri={logoDataUri}
        />
      );
  }
}
