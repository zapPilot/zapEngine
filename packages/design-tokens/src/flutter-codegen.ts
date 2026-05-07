import { isCurrentScript, writeGeneratedFile } from './paths.js';
import { type DesignTokens, loadTokens } from './tokens.js';

function dartName(name: string): string {
  return name
    .split('-')
    .map((part, index) =>
      index === 0 ? part : `${part.charAt(0).toUpperCase()}${part.slice(1)}`,
    )
    .join('');
}

function colorToDart(value: string): string {
  const hex = value.match(/^#([0-9a-fA-F]{6})$/);
  if (hex) {
    return `Color(0xFF${hex[1]!.toUpperCase()})`;
  }

  const rgba = value.match(
    /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\s*\)$/,
  );
  if (rgba) {
    const [, r, g, b, alpha] = rgba;
    const alphaByte = Math.round(Number(alpha) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
    const rgb = [r, g, b]
      .map((part) => Number(part).toString(16).padStart(2, '0').toUpperCase())
      .join('');
    return `Color(0x${alphaByte}${rgb})`;
  }

  throw new Error(`Unsupported color value for Dart output: ${value}`);
}

export function renderDartTokens(tokens: DesignTokens): string {
  const colorEntries = Object.entries(tokens.color).filter(
    ([, value]) => typeof value === 'string',
  ) as Array<[string, string]>;

  const colorLines = colorEntries.map(
    ([name, value]) =>
      `  static const ${dartName(name)} = ${colorToDart(value)};`,
  );

  return `// Generated from packages/design-tokens/tokens.json. Do not edit by hand.
import 'package:flutter/material.dart';

abstract final class ZapTokens {
${colorLines.join('\n')}
  static const pillarSpy = ${colorToDart(tokens.color.pillar.spy)};
  static const pillarBtc = ${colorToDart(tokens.color.pillar.btc)};
  static const pillarUsd = ${colorToDart(tokens.color.pillar.usd)};

  static const fontSerif = '${tokens.font.serif}';
  static const fontMono = '${tokens.font.mono}';
  static const fontSans = '${tokens.font.sans}';

  static const radiusPill = ${tokens.radius.pill}.0;
  static const radiusSubtle = ${tokens.radius.subtle}.0;
  static const radiusControl = ${tokens.radius.control}.0;
  static const radiusCard = ${tokens.radius.card}.0;
}
`;
}

export function writeDartTokens(): void {
  const content = renderDartTokens(loadTokens());
  const outputPaths = [
    'lib/design_tokens.dart',
    'dist/flutter/design_tokens.dart',
  ];

  for (const outputPath of outputPaths) {
    writeGeneratedFile(outputPath, content);
  }
}

if (isCurrentScript(import.meta.url)) {
  writeDartTokens();
}
