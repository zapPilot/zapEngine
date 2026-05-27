import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type CoinFaceMode = 'color' | 'height';
export type HeroRegime = 'greed' | 'fear' | 'neutral';
export type FlowLeg = 'risk' | 'stable' | 'rotation';

export type CoinPalette = {
  base: string;
  high: string;
  low: string;
  rim: string;
  edge: string;
  glow: THREE.ColorRepresentation;
  emissiveIntensity: number;
};

export type CoinDefinition = {
  radius: number;
  thickness: number;
  palette: CoinPalette;
  drawFace: (
    g: CanvasRenderingContext2D,
    size: number,
    palette: CoinPalette,
    mode: CoinFaceMode,
  ) => void;
};

export type CoinRuntime = {
  mesh: THREE.Group;
  basePos: THREE.Vector3;
  baseRot: THREE.Euler;
  depth: number;
  sway: { amp: number; freq: number; phase: number };
  bob: { amp: number; freq: number; phase: number };
  label: HTMLDivElement | null;
  color: THREE.Color;
};

export type DisposableObject = THREE.Object3D & {
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | THREE.Material[];
};

export type FlowMaterialEntry = {
  material: THREE.ShaderMaterial;
  leg: FlowLeg;
};

export type PhysicalMaterialEntry = {
  material: THREE.MeshPhysicalMaterial;
  leg: FlowLeg;
  baseOpacity: number;
  activeOpacity: number;
};

// ---------------------------------------------------------------------------
// Token palettes
// ---------------------------------------------------------------------------

export const TOKEN_COLORS: Record<'spy' | 'btc' | 'usd', CoinPalette> = {
  spy: {
    base: '#d7dde7',
    high: '#ffffff',
    low: '#596473',
    rim: '#eef3fa',
    edge: '#a7b0bf',
    glow: 0xd7dde7,
    emissiveIntensity: 0.015,
  },
  btc: {
    base: '#f7931a',
    high: '#ffad3b',
    low: '#c76a08',
    rim: '#ff9f1c',
    edge: '#dd7b12',
    glow: 0xf7931a,
    emissiveIntensity: 0.055,
  },
  usd: {
    base: '#2775ca',
    high: '#55a0ef',
    low: '#2775ca',
    rim: '#2775ca',
    edge: '#216fbd',
    glow: 0x2775ca,
    emissiveIntensity: 0.18,
  },
};

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

export function get2dContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to initialize 2D canvas context for v2 hero');
  }
  return context;
}

export function disposeMaterial(material: THREE.Material) {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  }
  material.dispose();
}

export function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((object) => {
    const disposable = object as DisposableObject;
    disposable.geometry?.dispose();
    const materials = disposable.material;
    if (Array.isArray(materials)) {
      for (const material of materials) {
        disposeMaterial(material);
      }
      return;
    }
    if (materials) {
      disposeMaterial(materials);
    }
  });
}

// ---------------------------------------------------------------------------
// Scene setup result type
// ---------------------------------------------------------------------------

export type HeroSceneResult = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
};

// ---------------------------------------------------------------------------
// HeroCanvasScene — scene, camera, renderer, lights, environment
// ---------------------------------------------------------------------------

function buildStudioEnvironment(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = get2dContext(c);

  g.fillStyle = '#050505';
  g.fillRect(0, 0, 1024, 512);

  const top = g.createRadialGradient(512, 64, 0, 512, 64, 420);
  top.addColorStop(0, '#fff6df');
  top.addColorStop(0.35, '#54442c');
  top.addColorStop(1, '#050505');
  g.fillStyle = top;
  g.fillRect(0, 0, 1024, 512);

  const warm = g.createRadialGradient(880, 330, 0, 880, 330, 340);
  warm.addColorStop(0, '#f1c77a');
  warm.addColorStop(0.45, '#503014');
  warm.addColorStop(1, 'rgba(5,5,5,0)');
  g.fillStyle = warm;
  g.fillRect(0, 0, 1024, 512);

  const cool = g.createRadialGradient(130, 390, 0, 130, 390, 310);
  cool.addColorStop(0, '#a9c1e8');
  cool.addColorStop(0.42, '#18263a');
  cool.addColorStop(1, 'rgba(5,5,5,0)');
  g.fillStyle = cool;
  g.fillRect(0, 0, 1024, 512);

  function drawSoftRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    blur = 16,
  ) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  drawSoftRect(g, 390, 16, 260, 38, 'rgba(255,247,226,0.72)', 22);
  drawSoftRect(g, 768, 130, 36, 250, 'rgba(255,219,154,0.35)', 24);
  drawSoftRect(g, 118, 170, 28, 220, 'rgba(175,204,255,0.28)', 22);

  g.fillStyle = 'rgba(212,197,163,0.18)';
  g.fillRect(0, 256, 1024, 2);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * HeroCanvasScene — initializes the THREE.js scene, camera, renderer,
 * environment map, and studio lighting.
 *
 * @returns `{ scene, camera, renderer }` or `null` if WebGL is unavailable.
 *          Caller is responsible for disposing via `renderer.dispose()` and
 *          `disposeObjectTree(scene)`.
 */
export function HeroCanvasScene(
  canvas: HTMLCanvasElement,
): HeroSceneResult | null {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0, 8);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
  } catch {
    return null;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.environment = buildStudioEnvironment();

  scene.add(new THREE.AmbientLight(0xffffff, 0.12));

  const key = new THREE.PointLight(0xfff3d8, 8.5, 18, 2);
  key.position.set(0.6, 4.4, 4.2);
  scene.add(key);

  const warmRim = new THREE.DirectionalLight(0xe6c078, 1.8);
  warmRim.position.set(4.6, 2.8, 2.2);
  scene.add(warmRim);

  const coolFill = new THREE.DirectionalLight(0x9db8df, 0.72);
  coolFill.position.set(-4.0, -2.2, 3.2);
  scene.add(coolFill);

  const backKicker = new THREE.DirectionalLight(0xffffff, 0.55);
  backKicker.position.set(-1.2, 3.4, -4.2);
  scene.add(backKicker);

  return { scene, camera, renderer };
}
