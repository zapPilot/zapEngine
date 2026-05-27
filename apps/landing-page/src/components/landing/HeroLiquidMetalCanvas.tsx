'use client';

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import {
  HeroCanvasScene,
  disposeObjectTree,
} from './heroCanvas/HeroCanvasScene';
import { HeroCanvasMesh } from './heroCanvas/HeroCanvasMesh';
import { HeroCanvasAnimator } from './heroCanvas/HeroCanvasAnimator';

type HeroLiquidMetalCanvasProps = {
  heroRef: RefObject<HTMLElement | null>;
  regime?: 'greed' | 'fear' | 'neutral';
};

export default function HeroLiquidMetalCanvas({
  heroRef,
  regime = 'greed',
}: HeroLiquidMetalCanvasProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spyLabelRef = useRef<HTMLDivElement | null>(null);
  const btcLabelRef = useRef<HTMLDivElement | null>(null);
  const usdLabelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const hero = heroRef.current;
    if (!stage || !canvas || !hero) {
      return;
    }

    const labels = {
      spy: spyLabelRef.current,
      btc: btcLabelRef.current,
      usd: usdLabelRef.current,
    };
    delete stage.dataset['webglUnavailable'];
    for (const label of Object.values(labels)) {
      label?.removeAttribute('style');
    }

    // 1. Scene, camera, renderer, lights, environment
    const sceneResult = HeroCanvasScene(canvas);
    if (!sceneResult) {
      stage.dataset['webglUnavailable'] = 'true';
      for (const label of Object.values(labels)) {
        label?.removeAttribute('style');
      }
      return;
    }
    const { scene, camera, renderer } = sceneResult;

    // 2. Token coins + flow meshes
    const meshResult = HeroCanvasMesh(scene, labels, regime);

    // 3. Animation loop, physics, resize, mouse
    const stopAnimator = HeroCanvasAnimator({
      scene,
      camera,
      renderer,
      canvasElement: canvas,
      heroElement: hero,
      ...meshResult,
      labels,
      regime,
    });

    return () => {
      stopAnimator();
      if (scene.environment) {
        scene.environment.dispose();
        scene.environment = null;
      }
      disposeObjectTree(scene);
      renderer.dispose();
    };
  }, [heroRef, regime]);

  return (
    <div className="scene">
      <div className="scene-loading" />

      <div className="scene-stage" ref={stageRef}>
        <div className="orbits">
          <svg
            className="orbit-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden
          >
            <ellipse className="ring solid" cx="50" cy="50" rx="44" ry="44" />
            <ellipse
              className="ring"
              cx="50"
              cy="50"
              rx="34"
              ry="40"
              transform="rotate(-15 50 50)"
            />
            <ellipse
              className="ring"
              cx="50"
              cy="50"
              rx="42"
              ry="22"
              transform="rotate(20 50 50)"
            />
            <ellipse className="ring" cx="50" cy="50" rx="22" ry="22" />
          </svg>
        </div>

        <canvas
          ref={canvasRef}
          className="tokens-canvas"
          aria-label="Animated liquid metal three-pillar allocation"
        />

        <div
          className="token-label token-label-spy"
          ref={spyLabelRef}
          aria-hidden
        >
          SPY <span className="pct">42%</span>
        </div>
        <div
          className="token-label token-label-btc"
          ref={btcLabelRef}
          aria-hidden
        >
          BTC·ETH <span className="pct">38%</span>
        </div>
        <div
          className="token-label token-label-usd"
          ref={usdLabelRef}
          aria-hidden
        >
          USDC <span className="pct">20%</span>
        </div>

        <div className="core" aria-hidden />

        <div className="scene-readout" aria-hidden>
          <div className="ln-1">REGIME · GREED</div>
          <div>FGI 72 · 200MA +14.2%</div>
          <div>NEXT REBAL · 02:14:00</div>
        </div>
      </div>
    </div>
  );
}
