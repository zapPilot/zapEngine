import {
  CHAIN_BRAND,
  PROTOCOL_BRAND,
  TOKEN_BRAND,
  protocolBrandKeyFor,
  tokenBrandSymbolFor,
  chainBrandKeyForChainId,
  type ChainBrandKey,
} from '@zapengine/brand-assets';
import Image, { type StaticImageData } from 'next/image';
import type { CSSProperties } from 'react';

import {
  CHAIN_ICON_SRC,
  PROTOCOL_ICON_SRC,
  TOKEN_ICON_SRC,
} from '@/data/assetIcons';

function MarkImage({
  alt,
  radius,
  size,
  source,
  style,
}: {
  alt: string;
  radius: number | string;
  size: number;
  source: StaticImageData;
  style?: CSSProperties;
}) {
  return (
    <Image
      alt={alt}
      height={size}
      src={source}
      width={size}
      style={{
        borderRadius: radius,
        flexShrink: 0,
        height: size,
        objectFit: 'contain',
        verticalAlign: 'text-bottom',
        width: size,
        ...style,
      }}
    />
  );
}

function GlyphDisc({
  color,
  glyph,
  size,
}: {
  color: string;
  glyph: string;
  size: number;
}) {
  return (
    <span
      aria-hidden="true"
      className="token-icon token-icon-glyph"
      style={{
        alignItems: 'center',
        backgroundColor: color,
        borderRadius: '999px',
        color: '#fff',
        display: 'inline-flex',
        flexShrink: 0,
        fontFamily: 'var(--font-sans), Arial, sans-serif',
        fontSize: size * 0.55,
        fontWeight: 700,
        height: size,
        justifyContent: 'center',
        lineHeight: 1,
        verticalAlign: 'text-bottom',
        width: size,
      }}
    >
      {glyph}
    </span>
  );
}

export function TokenIcon({
  symbol,
  size = 18,
}: {
  symbol: string;
  size?: number;
}) {
  const brandSymbol = tokenBrandSymbolFor(symbol);
  const brand = brandSymbol ? TOKEN_BRAND[brandSymbol] : undefined;
  const source = brandSymbol ? TOKEN_ICON_SRC[brandSymbol] : undefined;

  if (source) {
    return (
      <span
        className="token-icon"
        style={{ display: 'inline-flex', height: size, width: size }}
      >
        <MarkImage alt="" radius="999px" size={size} source={source} />
      </span>
    );
  }

  return (
    <GlyphDisc
      color={brand?.color ?? 'rgba(255, 255, 255, 0.1)'}
      glyph={brand?.glyph ?? symbol.trim().slice(0, 1).toUpperCase()}
      size={size}
    />
  );
}

export function ChainMark({
  chainKey,
  labelled = false,
  size = 16,
}: {
  chainKey: ChainBrandKey;
  labelled?: boolean;
  size?: number;
}) {
  return (
    <MarkImage
      alt={labelled ? CHAIN_BRAND[chainKey].label : ''}
      radius="999px"
      size={size}
      source={CHAIN_ICON_SRC[chainKey]}
    />
  );
}

export function ChainIdentity({
  chainId,
  size = 16,
  unknownPrefix = '',
}: {
  chainId: number;
  size?: number;
  unknownPrefix?: string;
}) {
  const chainKey = chainBrandKeyForChainId(chainId);
  if (!chainKey)
    return (
      <>
        {unknownPrefix}
        {chainId}
      </>
    );

  return (
    <span style={{ alignItems: 'center', display: 'inline-flex', gap: 7 }}>
      <ChainMark chainKey={chainKey} size={size} />
      {CHAIN_BRAND[chainKey].label}
    </span>
  );
}

export function ProtocolIcon({
  labelled = false,
  protocol,
  size = 20,
}: {
  labelled?: boolean;
  protocol: string;
  size?: number;
}) {
  const brandKey = protocolBrandKeyFor(protocol);
  const label = brandKey ? PROTOCOL_BRAND[brandKey].label : protocol;

  if (!brandKey) {
    return (
      <GlyphDisc
        color="rgba(255, 255, 255, 0.1)"
        glyph={protocol.trim().slice(0, 1).toUpperCase()}
        size={size}
      />
    );
  }

  const markSize = size * 0.72;
  return (
    <span
      aria-label={labelled ? label : undefined}
      aria-hidden={labelled ? undefined : true}
      style={{
        alignItems: 'center',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: size * 0.28,
        display: 'inline-flex',
        flexShrink: 0,
        height: size,
        justifyContent: 'center',
        verticalAlign: 'text-bottom',
        width: size,
      }}
    >
      <MarkImage
        alt=""
        radius={markSize * 0.2}
        size={markSize}
        source={PROTOCOL_ICON_SRC[brandKey]}
      />
    </span>
  );
}

export function TokenIconPair({
  size = 14,
  symbols,
}: {
  size?: number;
  symbols: readonly [string, string];
}) {
  return (
    <span style={{ alignItems: 'center', display: 'inline-flex' }}>
      {symbols.map((symbol, index) => (
        <span
          key={`${symbol}-${index}`}
          style={{
            borderRadius: '999px',
            boxShadow: '0 0 0 1.5px #0a0a0a',
            display: 'inline-flex',
            height: size,
            marginLeft: index === 0 ? 0 : -size * 0.35,
            width: size,
          }}
        >
          <TokenIcon symbol={symbol} size={size} />
        </span>
      ))}
    </span>
  );
}
