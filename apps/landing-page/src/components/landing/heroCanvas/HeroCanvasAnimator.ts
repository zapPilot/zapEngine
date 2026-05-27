import * as THREE from 'three';
import {
  type CoinRuntime,
  type FlowMaterialEntry,
  type PhysicalMaterialEntry,
  type HeroRegime,
} from './HeroCanvasScene';
import { getFlowIntensity } from './HeroCanvasMesh';

// ---------------------------------------------------------------------------
// HeroCanvasAnimator input / cleanup types
// ---------------------------------------------------------------------------

export type HeroAnimatorParams = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  canvasElement: HTMLCanvasElement;
  heroElement: HTMLElement;
  coins: CoinRuntime[];
  flowMaterials: FlowMaterialEntry[];
  pipeMaterials: PhysicalMaterialEntry[];
  flowCore: THREE.Group;
  flowTexture: THREE.CanvasTexture;
  spy: THREE.Group;
  btc: THREE.Group;
  usd: THREE.Group;
  labels: {
    spy: HTMLDivElement | null;
    btc: HTMLDivElement | null;
    usd: HTMLDivElement | null;
  };
  regime: HeroRegime;
};

export type HeroAnimatorCleanup = () => void;

// ---------------------------------------------------------------------------
// HeroCanvasAnimator — animation loop, physics, RAF management,
//                       resize observer, mouse event handler
// ---------------------------------------------------------------------------

/**
 * HeroCanvasAnimator — starts the RAF loop, wires up the ResizeObserver and
 * mousemove handler, and returns a cleanup function that tears everything down.
 */
export function HeroCanvasAnimator(
  params: HeroAnimatorParams,
): HeroAnimatorCleanup {
  const {
    scene,
    camera,
    renderer,
    canvasElement,
    heroElement,
    coins,
    flowMaterials,
    pipeMaterials,
    flowCore,
    flowTexture,
    spy,
    btc,
    usd,
    labels,
    regime,
  } = params;

  let tx = 0;
  let ty = 0;
  let cx = 0;
  let cy = 0;
  let animationFrameId = 0;
  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  const startedAt = performance.now();
  const projected = new THREE.Vector3();

  function projectLabel(
    obj: THREE.Object3D,
    label: HTMLDivElement | null,
    yOffset = 0.1,
  ) {
    if (!label) {
      return;
    }
    projected.setFromMatrixPosition(obj.matrixWorld);
    projected.project(camera);
    const r = canvasElement.getBoundingClientRect();
    label.style.left = `${(projected.x * 0.5 + 0.5) * r.width}px`;
    label.style.top = `${
      (projected.y * -0.5 + 0.5) * r.height + r.height * yOffset
    }px`;
  }

  function renderFrame(now: number) {
    const t = (now - startedAt) / 1000;

    cx += (tx - cx) * 0.06;
    cy += (ty - cy) * 0.06;

    scene.rotation.y = cx * 0.2;
    scene.rotation.x = -cy * 0.15;

    for (const coin of coins) {
      const bob = Math.sin(t * coin.bob.freq + coin.bob.phase) * coin.bob.amp;
      const swayY =
        Math.sin(t * coin.sway.freq + coin.sway.phase) * coin.sway.amp;
      const swayX =
        Math.cos(t * coin.sway.freq * 0.8 + coin.sway.phase) *
        coin.sway.amp *
        0.4;

      if (reduceMotion) {
        coin.mesh.position.copy(coin.basePos);
        coin.mesh.rotation.copy(coin.baseRot);
      } else {
        coin.mesh.position.x = coin.basePos.x + cx * 0.25 * coin.depth;
        coin.mesh.position.y = coin.basePos.y + bob - cy * 0.18 * coin.depth;
        coin.mesh.position.z =
          coin.basePos.z +
          Math.cos(t * coin.bob.freq * 0.72 + coin.bob.phase) * 0.045;
        coin.mesh.rotation.x = coin.baseRot.x + swayX * 0.35;
        coin.mesh.rotation.y = coin.baseRot.y + swayY * 0.55;
        coin.mesh.rotation.z = coin.baseRot.z;
      }
    }

    for (const { material, leg } of flowMaterials) {
      const timeUniform = material.uniforms['uTime'] as
        | THREE.IUniform<number>
        | undefined;
      if (timeUniform) {
        timeUniform.value = t;
      }
      const activeUniform = material.uniforms['uActive'] as
        | THREE.IUniform<number>
        | undefined;
      if (activeUniform) {
        activeUniform.value = getFlowIntensity(leg, regime);
      }
    }
    for (const entry of pipeMaterials) {
      const intensity = getFlowIntensity(entry.leg, regime);
      entry.material.opacity =
        entry.baseOpacity +
        (entry.activeOpacity - entry.baseOpacity) * intensity;
      entry.material.envMapIntensity = 1.08 + intensity * 0.74;
    }
    flowTexture.offset.x = (t * 0.075) % 1;
    flowCore.rotation.z = t * 0.22;
    flowCore.rotation.y = Math.sin(t * 0.45) * 0.12;

    scene.updateMatrixWorld();
    projectLabel(spy, labels.spy, 0.092);
    projectLabel(btc, labels.btc, 0.105);
    projectLabel(usd, labels.usd, 0.092);

    renderer.render(scene, camera);
  }

  function resize() {
    const r = canvasElement.getBoundingClientRect();
    const w = r.width || 1;
    const h = r.height || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderFrame(performance.now());
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvasElement);
  resize();

  function handleMouseMove(event: MouseEvent) {
    if (reduceMotion) {
      return;
    }
    const r = heroElement.getBoundingClientRect();
    tx = (event.clientX - r.left) / r.width - 0.5;
    ty = (event.clientY - r.top) / r.height - 0.5;
  }

  window.addEventListener('mousemove', handleMouseMove, { passive: true });

  function tick(now: number) {
    renderFrame(now);
    animationFrameId = window.requestAnimationFrame(tick);
  }
  animationFrameId = window.requestAnimationFrame(tick);

  return () => {
    window.cancelAnimationFrame(animationFrameId);
    window.removeEventListener('mousemove', handleMouseMove);
    ro.disconnect();
  };
}
