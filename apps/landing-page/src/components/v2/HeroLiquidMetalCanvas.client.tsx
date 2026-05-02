'use client';

import dynamic from 'next/dynamic';
import type { RefObject } from 'react';

export type HeroLiquidMetalCanvasProps = {
  heroRef: RefObject<HTMLElement | null>;
};

const HeroLiquidMetalCanvasClient = dynamic<HeroLiquidMetalCanvasProps>(
  () => import('./HeroLiquidMetalCanvas'),
  {
    ssr: false,
    loading: () => <div className="scene-skeleton" aria-hidden />,
  },
);

export default HeroLiquidMetalCanvasClient;
