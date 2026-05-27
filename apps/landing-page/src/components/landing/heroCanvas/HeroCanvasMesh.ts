import * as THREE from 'three';
import {
  type CoinFaceMode,
  type CoinPalette,
  type CoinDefinition,
  type CoinRuntime,
  type FlowLeg,
  type FlowMaterialEntry,
  type PhysicalMaterialEntry,
  type HeroRegime,
  TOKEN_COLORS,
  get2dContext,
} from './HeroCanvasScene';

// ---------------------------------------------------------------------------
// Texture helpers
// ---------------------------------------------------------------------------

function makeBrushedRoughnessTexture(
  size = 1024,
  base = 0.35,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = get2dContext(c);
  const baseValue = Math.round(base * 255);
  g.fillStyle = `rgb(${baseValue},${baseValue},${baseValue})`;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 180; i += 1) {
    const v = 105 + ((i * 29) % 46);
    g.strokeStyle = `rgba(${v},${v},${v},0.26)`;
    g.lineWidth = 1;
    const y = (i * 19) % size;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(size, y + Math.sin(i) * 10);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function makeReededEdgeTexture(
  width = 1024,
  height = 32,
  soft = false,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = get2dContext(c);
  g.fillStyle = soft ? '#777' : '#888';
  g.fillRect(0, 0, width, height);
  for (let x = 0; x < width; x += 6) {
    const light = soft ? '#8d8d8d' : '#c8c8c8';
    const dark = soft ? '#696969' : '#4a4a4a';
    g.fillStyle = light;
    g.fillRect(x, 0, 2, height);
    g.fillStyle = dark;
    g.fillRect(x + 3, 0, 2, height);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.2, 1);
  tex.anisotropy = 8;
  return tex;
}

// ---------------------------------------------------------------------------
// Coin face drawing helpers
// ---------------------------------------------------------------------------

function drawMetalBase(
  g: CanvasRenderingContext2D,
  s: number,
  palette: CoinPalette,
) {
  const center = s / 2;
  const radial = g.createRadialGradient(
    center * 0.72,
    center * 0.62,
    s * 0.04,
    center,
    center,
    s * 0.55,
  );
  radial.addColorStop(0, palette.high);
  radial.addColorStop(0.28, palette.base);
  radial.addColorStop(0.78, palette.low);
  radial.addColorStop(1, palette.low);
  g.fillStyle = radial;
  g.beginPath();
  g.arc(center, center, s * 0.5, 0, Math.PI * 2);
  g.fill();

  const sweep = g.createLinearGradient(0, 0, s, s);
  sweep.addColorStop(0, 'rgba(255,255,255,0.00)');
  sweep.addColorStop(0.44, 'rgba(255,255,255,0.26)');
  sweep.addColorStop(0.51, 'rgba(255,255,255,0.04)');
  sweep.addColorStop(1, 'rgba(0,0,0,0.06)');
  g.fillStyle = sweep;
  g.beginPath();
  g.arc(center, center, s * 0.48, 0, Math.PI * 2);
  g.fill();

  g.save();
  g.translate(center, center);
  for (let i = 0; i < 34; i += 1) {
    const r = s * (0.11 + i * 0.012);
    g.strokeStyle =
      i % 2 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.055)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();

  g.save();
  g.globalAlpha = 0.22;
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  g.lineWidth = 1;
  for (let i = 0; i < 90; i += 1) {
    const y = (i * 37) % s;
    const x = (i * 83) % s;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + s * 0.18, y - s * 0.035);
    g.stroke();
  }
  g.restore();
}

function drawHeightBase(g: CanvasRenderingContext2D, s: number) {
  const center = s / 2;
  g.strokeStyle = '#8c8c8c';
  g.lineWidth = 1;
  for (let i = 0; i < 44; i += 1) {
    const r = s * (0.08 + i * 0.01);
    g.beginPath();
    g.arc(center, center, r, 0, Math.PI * 2);
    g.stroke();
  }
}

function drawRaisedStroke(
  g: CanvasRenderingContext2D,
  draw: () => void,
  mode: CoinFaceMode,
  light = 'rgba(255,255,255,0.52)',
  dark = 'rgba(0,0,0,0.24)',
) {
  if (mode === 'height') {
    g.save();
    g.strokeStyle = '#f0f0f0';
    draw();
    g.restore();
    return;
  }
  g.save();
  g.translate(2, 2);
  g.strokeStyle = dark;
  draw();
  g.restore();
  g.save();
  g.translate(-2, -2);
  g.strokeStyle = light;
  draw();
  g.restore();
}

function drawRaisedFill(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  mode: CoinFaceMode,
) {
  g.save();
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  if (mode === 'height') {
    g.fillStyle = '#eeeeee';
    g.fillText(text, x, y);
    g.restore();
    return;
  }

  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.fillText(text, x + 3, y + 3);
  g.fillStyle = 'rgba(255,255,255,0.58)';
  g.fillText(text, x - 1, y - 1);
  g.fillStyle = 'rgba(255,255,255,0.23)';
  g.fillText(text, x, y);
  g.restore();
}

function drawCoinRing(
  g: CanvasRenderingContext2D,
  s: number,
  mode: CoinFaceMode,
) {
  const c = s / 2;
  g.lineCap = 'round';

  g.lineWidth = s * 0.03;
  drawRaisedStroke(
    g,
    () => {
      g.beginPath();
      g.arc(c, c, s * 0.415, 0, Math.PI * 2);
      g.stroke();
    },
    mode,
  );

  g.lineWidth = s * 0.01;
  drawRaisedStroke(
    g,
    () => {
      g.beginPath();
      g.arc(c, c, s * 0.33, 0, Math.PI * 2);
      g.stroke();
    },
    mode,
    'rgba(255,255,255,0.28)',
    'rgba(0,0,0,0.18)',
  );
}

function drawSPYFace(
  g: CanvasRenderingContext2D,
  s: number,
  _palette: CoinPalette,
  mode: CoinFaceMode,
) {
  const c = s / 2;
  drawCoinRing(g, s, mode);

  drawRaisedFill(
    g,
    'S & P',
    c,
    s * 0.285,
    `700 ${s * 0.092}px Inter, system-ui, sans-serif`,
    mode,
  );
  drawRaisedFill(
    g,
    '500',
    c,
    c + s * 0.025,
    `800 ${s * 0.205}px Inter, system-ui, sans-serif`,
    mode,
  );

  const bw = s * 0.05;
  const gap = s * 0.028;
  const baseY = s * 0.735;
  const heights = [s * 0.062, s * 0.102, s * 0.146];
  const startX = c - (bw * 3 + gap * 2) / 2;

  g.save();
  for (const [i, h] of heights.entries()) {
    if (mode === 'height') {
      g.fillStyle = '#e8e8e8';
      g.fillRect(startX + i * (bw + gap), baseY - h, bw, h);
    } else {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(startX + i * (bw + gap) + 3, baseY - h + 3, bw, h);
      g.fillStyle = 'rgba(255,255,255,0.50)';
      g.fillRect(startX + i * (bw + gap), baseY - h, bw, h);
    }
  }
  g.restore();

  g.lineWidth = s * 0.006;
  for (let i = 0; i < 60; i += 1) {
    const a = (i / 60) * Math.PI * 2;
    const r1 = s * 0.392;
    const r2 = i % 5 === 0 ? s * 0.36 : s * 0.374;
    drawRaisedStroke(
      g,
      () => {
        g.beginPath();
        g.moveTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
        g.lineTo(c + Math.cos(a) * r2, c + Math.sin(a) * r2);
        g.stroke();
      },
      mode,
      'rgba(255,255,255,0.26)',
      'rgba(0,0,0,0.16)',
    );
  }
}

function drawBTCETHFace(
  g: CanvasRenderingContext2D,
  s: number,
  _palette: CoinPalette,
  mode: CoinFaceMode,
) {
  const c = s / 2;
  drawCoinRing(g, s, mode);
  drawRaisedFill(
    g,
    '₿',
    c - s * 0.018,
    c + s * 0.005,
    `800 ${s * 0.535}px Inter, system-ui, sans-serif`,
    mode,
  );

  const p0 = [c + s * 0.205, c + s * 0.16] as const;
  const p1 = [c + s * 0.28, c + s * 0.265] as const;
  const p2 = [c + s * 0.205, c + s * 0.345] as const;
  const p3 = [c + s * 0.13, c + s * 0.265] as const;
  g.save();
  if (mode === 'height') {
    g.fillStyle = '#e6e6e6';
    g.strokeStyle = '#eeeeee';
  } else {
    g.fillStyle = 'rgba(255,255,255,0.32)';
    g.strokeStyle = 'rgba(255,255,255,0.44)';
    g.shadowColor = 'rgba(0,0,0,0.35)';
    g.shadowBlur = 3;
    g.shadowOffsetX = 2;
    g.shadowOffsetY = 2;
  }
  g.beginPath();
  g.moveTo(p0[0], p0[1]);
  g.lineTo(p1[0], p1[1]);
  g.lineTo(p2[0], p2[1]);
  g.lineTo(p3[0], p3[1]);
  g.closePath();
  g.fill();
  g.lineWidth = s * 0.007;
  g.beginPath();
  g.moveTo(c + s * 0.13, c + s * 0.265);
  g.lineTo(c + s * 0.205, c + s * 0.285);
  g.lineTo(c + s * 0.28, c + s * 0.265);
  g.stroke();
  g.restore();

  g.lineWidth = s * 0.012;
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const r1 = s * 0.38;
    const r2 = s * 0.408;
    drawRaisedStroke(
      g,
      () => {
        g.beginPath();
        g.moveTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
        g.lineTo(c + Math.cos(a) * r2, c + Math.sin(a) * r2);
        g.stroke();
      },
      mode,
      'rgba(255,255,255,0.30)',
      'rgba(0,0,0,0.18)',
    );
  }
}

function drawUSDCFace(
  g: CanvasRenderingContext2D,
  s: number,
  _palette: CoinPalette,
  mode: CoinFaceMode,
) {
  const c = s / 2;
  drawCoinRing(g, s, mode);
  drawRaisedFill(
    g,
    '$',
    c,
    c + s * 0.01,
    `800 ${s * 0.5}px Inter, system-ui, sans-serif`,
    mode,
  );

  g.lineWidth = s * 0.012;
  for (let i = 0; i < 28; i += 1) {
    const a = (i / 28) * Math.PI * 2;
    const x = c + Math.cos(a) * s * 0.458;
    const y = c + Math.sin(a) * s * 0.458;
    g.beginPath();
    if (mode === 'height') {
      g.fillStyle = '#dedede';
    } else {
      g.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.18)';
    }
    g.arc(x, y, s * 0.0065, 0, Math.PI * 2);
    g.fill();
  }

  g.lineWidth = s * 0.01;
  for (const offset of [-0.18, 0.18]) {
    drawRaisedStroke(
      g,
      () => {
        g.beginPath();
        g.moveTo(c + offset * s, c - s * 0.23);
        g.lineTo(c + offset * s, c + s * 0.23);
        g.stroke();
      },
      mode,
      'rgba(255,255,255,0.24)',
      'rgba(0,0,0,0.14)',
    );
  }
}

// ---------------------------------------------------------------------------
// Texture factory
// ---------------------------------------------------------------------------

function makeFaceTexture(
  palette: CoinPalette,
  drawFace: CoinDefinition['drawFace'],
  mode: CoinFaceMode,
): THREE.CanvasTexture {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = get2dContext(c);

  if (mode === 'color') {
    drawMetalBase(g, size, palette);
  } else {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, size, size);
    drawHeightBase(g, size);
  }

  drawFace(g, size, palette, mode);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = mode === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Coin mesh builder
// ---------------------------------------------------------------------------

function makeCoin({ radius, thickness, palette, drawFace }: CoinDefinition) {
  const group = new THREE.Group();

  const faceColor = makeFaceTexture(palette, drawFace, 'color');
  const faceHeight = makeFaceTexture(palette, drawFace, 'height');
  const faceRoughness = makeBrushedRoughnessTexture(1024, 0.35);
  const edgeBump = makeReededEdgeTexture(1024, 32);
  const edgeRoughness = makeReededEdgeTexture(1024, 32, true);

  const sideGeometry = new THREE.CylinderGeometry(
    radius,
    radius,
    thickness,
    160,
    1,
    true,
  );
  sideGeometry.rotateX(Math.PI / 2);

  const faceMaterial = new THREE.MeshPhysicalMaterial({
    map: faceColor,
    color: 0xffffff,
    metalness: 1.0,
    roughness: 0.2,
    roughnessMap: faceRoughness,
    bumpMap: faceHeight,
    bumpScale: 0.028,
    emissive: palette.base,
    emissiveIntensity: palette.emissiveIntensity,
    envMapIntensity: 1.85,
    clearcoat: 0.55,
    clearcoatRoughness: 0.16,
  });

  const edgeMaterial = new THREE.MeshPhysicalMaterial({
    color: palette.edge,
    metalness: 0.98,
    roughness: 0.26,
    roughnessMap: edgeRoughness,
    bumpMap: edgeBump,
    bumpScale: 0.024,
    envMapIntensity: 1.65,
    clearcoat: 0.35,
    clearcoatRoughness: 0.28,
  });

  const side = new THREE.Mesh(sideGeometry, edgeMaterial);
  side.castShadow = true;
  side.receiveShadow = true;
  group.add(side);

  const faceGeometry = new THREE.CircleGeometry(radius * 0.938, 160);
  const frontFace = new THREE.Mesh(faceGeometry, faceMaterial);
  frontFace.position.z = thickness / 2 + 0.003;
  frontFace.castShadow = true;
  frontFace.receiveShadow = true;
  group.add(frontFace);

  const backFace = new THREE.Mesh(faceGeometry.clone(), faceMaterial.clone());
  backFace.rotation.y = Math.PI;
  backFace.position.z = -thickness / 2 - 0.003;
  backFace.receiveShadow = true;
  group.add(backFace);

  const rimMaterial = new THREE.MeshPhysicalMaterial({
    color: palette.rim,
    metalness: 1,
    roughness: 0.18,
    envMapIntensity: 1.9,
    clearcoat: 0.55,
    clearcoatRoughness: 0.15,
  });

  const frontRim = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.965, thickness * 0.07, 14, 160),
    rimMaterial,
  );
  frontRim.position.z = thickness / 2 + 0.006;
  group.add(frontRim);

  const backRim = frontRim.clone();
  backRim.position.z = -thickness / 2 - 0.006;
  group.add(backRim);

  const innerRimMaterial = rimMaterial.clone();
  innerRimMaterial.color.set(palette.high);
  innerRimMaterial.envMapIntensity = 1.65;
  const innerRim = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.69, thickness * 0.022, 10, 128),
    innerRimMaterial,
  );
  innerRim.position.z = thickness / 2 + 0.012;
  group.add(innerRim);

  const glow = new THREE.Mesh(
    new THREE.RingGeometry(radius * 1.02, radius * 1.22, 96),
    new THREE.MeshBasicMaterial({
      color: palette.glow,
      transparent: true,
      opacity: 0.085,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.position.z = -thickness / 2 - 0.01;
  group.add(glow);

  return group;
}

// ---------------------------------------------------------------------------
// Flow texture
// ---------------------------------------------------------------------------

export function makeFlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 64;
  const g = get2dContext(c);
  g.clearRect(0, 0, c.width, c.height);

  const base = g.createLinearGradient(0, 0, c.width, 0);
  base.addColorStop(0.0, 'rgba(255,255,255,0.00)');
  base.addColorStop(0.12, 'rgba(255,255,255,0.14)');
  base.addColorStop(0.44, 'rgba(255,255,255,0.70)');
  base.addColorStop(0.52, 'rgba(255,255,255,0.24)');
  base.addColorStop(0.74, 'rgba(255,255,255,0.48)');
  base.addColorStop(1.0, 'rgba(255,255,255,0.00)');
  g.fillStyle = base;
  g.fillRect(0, 0, c.width, c.height);

  for (let i = 0; i < 58; i += 1) {
    const y = (i * 13) % c.height;
    const alpha = 0.1 + ((i * 17) % 10) / 100;
    g.strokeStyle = `rgba(255,255,255,${alpha})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(c.width, y + Math.sin(i) * 4);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.6, 1);
  tex.anisotropy = 8;
  return tex;
}

// ---------------------------------------------------------------------------
// Flow intensity helper
// ---------------------------------------------------------------------------

export function getFlowIntensity(leg: FlowLeg, activeRegime: HeroRegime) {
  if (activeRegime === 'neutral') {
    return 0.56;
  }
  if (activeRegime === 'greed') {
    return leg === 'risk' ? 1 : leg === 'rotation' ? 0.72 : 0.28;
  }
  return leg === 'stable' ? 1 : leg === 'rotation' ? 0.68 : 0.26;
}

// ---------------------------------------------------------------------------
// Flow mesh result type
// ---------------------------------------------------------------------------

export type HeroMeshResult = {
  coins: CoinRuntime[];
  flowMaterials: FlowMaterialEntry[];
  pipeMaterials: PhysicalMaterialEntry[];
  flowGroup: THREE.Group;
  flowCore: THREE.Group;
  flowTexture: THREE.CanvasTexture;
  spy: THREE.Group;
  btc: THREE.Group;
  usd: THREE.Group;
};

// ---------------------------------------------------------------------------
// HeroCanvasMesh — token coins + liquid flow meshes
// ---------------------------------------------------------------------------

/**
 * HeroCanvasMesh — builds all token coin meshes and liquid-flow tube meshes,
 * adds them to `scene`, and returns runtime state used by the animator.
 */
export function HeroCanvasMesh(
  scene: THREE.Scene,
  labels: {
    spy: HTMLDivElement | null;
    btc: HTMLDivElement | null;
    usd: HTMLDivElement | null;
  },
  regime: HeroRegime,
): HeroMeshResult {
  // --- Coins ---
  const spy = makeCoin({
    radius: 0.56,
    thickness: 0.14,
    palette: TOKEN_COLORS.spy,
    drawFace: drawSPYFace,
  });
  spy.position.set(-1.58, 0.88, 0.32);
  spy.rotation.set(0.015, 0.16, 0.0);
  scene.add(spy);

  const btc = makeCoin({
    radius: 0.76,
    thickness: 0.18,
    palette: TOKEN_COLORS.btc,
    drawFace: drawBTCETHFace,
  });
  btc.position.set(1.35, 0.02, 0.0);
  btc.rotation.set(0.005, -0.1, 0.0);
  scene.add(btc);

  const usd = makeCoin({
    radius: 0.49,
    thickness: 0.12,
    palette: TOKEN_COLORS.usd,
    drawFace: drawUSDCFace,
  });
  usd.position.set(-0.78, -1.1, 0.22);
  usd.rotation.set(0.02, 0.14, 0.0);
  scene.add(usd);

  const coins: CoinRuntime[] = [
    {
      mesh: spy,
      basePos: spy.position.clone(),
      baseRot: spy.rotation.clone(),
      depth: 0.6,
      sway: { amp: 0.085, freq: 0.45, phase: 0.0 },
      bob: { amp: 0.055, freq: 0.7, phase: 0.0 },
      label: labels.spy,
      color: new THREE.Color(TOKEN_COLORS.spy.base),
    },
    {
      mesh: btc,
      basePos: btc.position.clone(),
      baseRot: btc.rotation.clone(),
      depth: 1.0,
      sway: { amp: 0.095, freq: 0.38, phase: 1.1 },
      bob: { amp: 0.08, freq: 0.54, phase: 1.1 },
      label: labels.btc,
      color: new THREE.Color(TOKEN_COLORS.btc.base),
    },
    {
      mesh: usd,
      basePos: usd.position.clone(),
      baseRot: usd.rotation.clone(),
      depth: 0.4,
      sway: { amp: 0.075, freq: 0.52, phase: 2.3 },
      bob: { amp: 0.048, freq: 0.84, phase: 2.3 },
      label: labels.usd,
      color: new THREE.Color(TOKEN_COLORS.usd.base),
    },
  ];

  // --- Flow meshes ---
  const flowMaterials: FlowMaterialEntry[] = [];
  const pipeMaterials: PhysicalMaterialEntry[] = [];
  const flowGroup = new THREE.Group();
  flowGroup.renderOrder = 1;
  scene.add(flowGroup);

  const flowTexture = makeFlowTexture();
  const pipeRoughness = makeBrushedRoughnessTexture(1024, 0.46);

  function makePipeMaterial(
    leg: FlowLeg,
    color: THREE.ColorRepresentation,
    baseOpacity: number,
    activeOpacity: number,
  ) {
    const material = new THREE.MeshPhysicalMaterial({
      color,
      transparent: true,
      opacity: baseOpacity,
      metalness: 0.95,
      roughness: 0.36,
      roughnessMap: pipeRoughness,
      envMapIntensity: 1.4,
      clearcoat: 0.58,
      clearcoatRoughness: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    pipeMaterials.push({ material, leg, baseOpacity, activeOpacity });
    return material;
  }

  function makeLiquidMaterial(
    colorA: THREE.ColorRepresentation,
    colorB: THREE.ColorRepresentation,
    alpha: number,
    speed: number,
    offset: number,
    leg: FlowLeg,
    tubeLift = 0,
  ) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color(colorA) },
        uColorB: { value: new THREE.Color(colorB) },
        uAlpha: { value: alpha },
        uSpeed: { value: speed },
        uOffset: { value: offset },
        uActive: { value: getFlowIntensity(leg, regime) },
        uTex: { value: flowTexture },
        uLift: { value: tubeLift },
      },
      vertexShader: `
    varying vec2 vUv;
    varying float vDepth;
    uniform float uTime;
    uniform float uLift;
    void main() {
      vUv = uv;
      vec3 p = position;
      // Tiny breathing motion, so the stream feels like liquid metal.
      p += normal * (sin((uv.x * 9.0 - uTime * 1.8 + uLift) * 6.2831853) * 0.006);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `,
      fragmentShader: `
    uniform float uTime;
    uniform float uAlpha;
    uniform float uSpeed;
    uniform float uOffset;
    uniform float uActive;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform sampler2D uTex;
    varying vec2 vUv;
    varying float vDepth;

    void main() {
      float x = fract(vUv.x * 1.35 - uTime * uSpeed + uOffset);
      vec4 tex = texture2D(uTex, vec2(x, vUv.y));
      float endpointFade = smoothstep(0.00, 0.10, vUv.x) * smoothstep(1.00, 0.90, vUv.x);
      float radial = 0.66 + 0.34 * sin(vUv.y * 6.2831853);
      float traveling = pow(max(0.0, sin((vUv.x * 2.4 - uTime * uSpeed + uOffset) * 6.2831853)), 2.2);
      float pulseHead = fract(uTime / 6.0 + uOffset);
      float pulseDist = abs(vUv.x - pulseHead);
      pulseDist = min(pulseDist, 1.0 - pulseDist);
      float eventPulse = exp(-(pulseDist * pulseDist) / 0.0018) * uActive;
      float shimmer = 0.74 + 0.26 * sin((vUv.x * 28.0 + vUv.y * 8.0 - uTime * 5.2) + uOffset * 6.2831853);
      vec3 base = mix(uColorA, uColorB, smoothstep(0.08, 0.92, vUv.x));
      vec3 highlight = vec3(1.0, 0.93, 0.78) * (0.34 + traveling * 0.72);
      vec3 color = base * (0.46 + 0.50 * tex.r) + highlight * tex.a * shimmer;
      color += vec3(1.0, 0.86, 0.52) * eventPulse * 0.9;
      float activeMask = mix(0.36, 1.18, uActive);
      float alpha = uAlpha * activeMask * endpointFade * radial * (0.34 + tex.a * 0.74 + traveling * 0.38 + eventPulse * 0.78);
      gl_FragColor = vec4(color, alpha);
      if (gl_FragColor.a < 0.015) discard;
    }
  `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    flowMaterials.push({ material, leg });
    return material;
  }

  function makeFlowCurve(fromIdx: number, toIdx: number, lift = 0.48) {
    const fromCoin = coins[fromIdx];
    const toCoin = coins[toIdx];
    if (!fromCoin || !toCoin) {
      throw new Error('Invalid v2 liquid flow coin index');
    }

    const a = fromCoin.basePos.clone();
    const b = toCoin.basePos.clone();
    const inward = 0.76;

    const start = a.clone().multiplyScalar(inward);
    start.z += 0.08;
    const end = b.clone().multiplyScalar(inward);
    end.z += 0.08;

    const controlA = a.clone().multiplyScalar(0.36);
    controlA.z = lift;
    const controlB = b.clone().multiplyScalar(0.36);
    controlB.z = lift;
    const core = new THREE.Vector3(0, 0, lift + 0.1);

    return new THREE.CatmullRomCurve3(
      [start, controlA, core, controlB, end],
      false,
      'catmullrom',
      0.46,
    );
  }

  function addLiquidFlow(
    fromIdx: number,
    toIdx: number,
    colorA: THREE.ColorRepresentation,
    colorB: THREE.ColorRepresentation,
    radius: number,
    speed: number,
    offset: number,
    lift: number,
    leg: FlowLeg,
  ) {
    const curve = makeFlowCurve(fromIdx, toIdx, lift);
    const shellRadius = radius * 2.9;

    const shell = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 220, shellRadius, 22, false),
      makePipeMaterial(leg, '#c8c3b4', 0.08, 0.23),
    );
    shell.renderOrder = 0;
    flowGroup.add(shell);

    const body = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 220, radius, 14, false),
      makeLiquidMaterial(colorA, colorB, 0.34, speed, offset, leg, lift),
    );
    body.renderOrder = 1;
    flowGroup.add(body);

    const core = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 220, radius * 0.38, 10, false),
      makeLiquidMaterial(
        '#ffffff',
        colorB,
        0.48,
        speed * 1.18,
        offset + 0.27,
        leg,
        lift + 0.3,
      ),
    );
    core.renderOrder = 2;
    flowGroup.add(core);

    for (const t of [0.08, 0.92]) {
      const collar = new THREE.Mesh(
        new THREE.TorusGeometry(shellRadius * 1.08, radius * 0.32, 12, 84),
        makePipeMaterial(leg, '#d4c5a3', 0.14, 0.36),
      );
      collar.position.copy(curve.getPoint(t));
      collar.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        curve.getTangent(t).normalize(),
      );
      collar.renderOrder = 3;
      flowGroup.add(collar);
    }
  }

  addLiquidFlow(
    0,
    1,
    TOKEN_COLORS.spy.base,
    TOKEN_COLORS.btc.base,
    0.02,
    0.105,
    0.03,
    0.44,
    'risk',
  );
  addLiquidFlow(
    1,
    2,
    TOKEN_COLORS.btc.base,
    TOKEN_COLORS.usd.base,
    0.023,
    0.088,
    0.39,
    0.52,
    'stable',
  );
  addLiquidFlow(
    2,
    0,
    TOKEN_COLORS.usd.base,
    TOKEN_COLORS.spy.base,
    0.018,
    0.118,
    0.68,
    0.48,
    'rotation',
  );

  // --- Flow core rings ---
  const flowCore = new THREE.Group();
  const coreRingMat = new THREE.MeshBasicMaterial({
    color: 0xd4c5a3,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 3; i += 1) {
    const material = coreRingMat.clone();
    material.opacity = 0.18 - i * 0.035;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.16 + i * 0.045, 0.0045, 10, 96),
      material,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.z = 0.48 + i * 0.012;
    flowCore.add(ring);
  }
  scene.add(flowCore);

  return {
    coins,
    flowMaterials,
    pipeMaterials,
    flowGroup,
    flowCore,
    flowTexture,
    spy,
    btc,
    usd,
  };
}
