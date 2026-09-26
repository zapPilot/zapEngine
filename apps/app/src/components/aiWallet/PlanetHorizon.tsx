import { tokens } from '@zapengine/design-tokens/tokens';
import { useId } from 'react';
import { View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
} from 'react-native-svg';

import {
  AI_WALLET_ACCENT,
  AI_WALLET_ACCENT_MUTED,
} from '@/components/aiWallet/aiWalletTheme';

const VIEW_WIDTH = 400;
const VIEW_HEIGHT = 300;
const PLANET = { cx: 150, cy: 480, r: 400 };
const LIMB_TOP = PLANET.cy - PLANET.r;

/**
 * Content that sits on the planet starts below the rim at every card width,
 * because percentage padding scales with width just like this drawing does.
 */
export const PLANET_CONTENT_OFFSET = '32%';

/** Stacked strokes fake a glow: a wide faint halo, a mid band, a crisp rim. */
const ARC_LAYERS = [
  { width: 16, opacity: 0.12 },
  { width: 6, opacity: 0.35 },
  { width: 1.6, opacity: 1 },
] as const;

/**
 * Decorative planet limb across the top of the wallet card. It keeps the
 * drawing's aspect ratio, so every glow has faded out before its bottom edge
 * whatever the card width.
 */
export function PlanetHorizon() {
  const id = `zp-planet-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <View
      className="absolute inset-x-0 top-0"
      style={{ aspectRatio: VIEW_WIDTH / VIEW_HEIGHT }}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="xMidYMin slice"
      >
        <Defs>
          <RadialGradient
            id={`${id}-haze`}
            cx={PLANET.cx}
            cy={LIMB_TOP}
            r={200}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={AI_WALLET_ACCENT} stopOpacity={0.22} />
            <Stop
              offset="0.45"
              stopColor={AI_WALLET_ACCENT_MUTED}
              stopOpacity={0.1}
            />
            <Stop
              offset="1"
              stopColor={AI_WALLET_ACCENT_MUTED}
              stopOpacity={0}
            />
          </RadialGradient>
          <RadialGradient
            id={`${id}-body`}
            cx={PLANET.cx}
            cy={LIMB_TOP}
            r={230}
            gradientUnits="userSpaceOnUse"
          >
            <Stop
              offset="0"
              stopColor={tokens.color['surface-elevated']}
              stopOpacity={0.9}
            />
            <Stop
              offset="0.4"
              stopColor={tokens.color['bg-2']}
              stopOpacity={0.72}
            />
            <Stop offset="1" stopColor={tokens.color.bg} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient
            id={`${id}-arc`}
            x1={0}
            y1={LIMB_TOP}
            x2={VIEW_WIDTH}
            y2={LIMB_TOP + 110}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={AI_WALLET_ACCENT} stopOpacity={0.78} />
            <Stop
              offset="0.5"
              stopColor={AI_WALLET_ACCENT_MUTED}
              stopOpacity={0.45}
            />
            <Stop
              offset="1"
              stopColor={AI_WALLET_ACCENT_MUTED}
              stopOpacity={0}
            />
          </LinearGradient>
        </Defs>
        <Circle
          cx={PLANET.cx}
          cy={LIMB_TOP}
          r={200}
          fill={`url(#${id}-haze)`}
        />
        <Circle
          cx={PLANET.cx}
          cy={PLANET.cy}
          r={PLANET.r}
          fill={`url(#${id}-body)`}
        />
        {ARC_LAYERS.map((layer) => (
          <Circle
            key={layer.width}
            cx={PLANET.cx}
            cy={PLANET.cy}
            r={PLANET.r}
            fill="none"
            stroke={`url(#${id}-arc)`}
            strokeWidth={layer.width}
            strokeOpacity={layer.opacity}
          />
        ))}
      </Svg>
    </View>
  );
}
