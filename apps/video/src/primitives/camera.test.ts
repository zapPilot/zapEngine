import { describe, expect, it } from 'vitest';

import {
  cameraAt,
  containCamera,
  focusCamera,
  fullCamera,
  mixCamera,
  projectBox,
} from './camera';

const frame = { width: 1920, height: 1080 };
const page = { width: 1440, height: 810 };
const linear = (t: number) => t;

describe('focusCamera', () => {
  const box = { x: 100, y: 100, width: 200, height: 100 };

  it('fills the tighter axis and centres the box at the anchor', () => {
    const camera = focusCamera(box, page, frame, { fill: 0.5, cover: false });
    expect(camera.scale).toBeCloseTo(4.8);
    expect(camera.x + (box.x + box.width / 2) * camera.scale).toBeCloseTo(960);
    expect(camera.y + (box.y + box.height / 2) * camera.scale).toBeCloseTo(540);
  });

  it('caps the zoom at maxScale (one capture pixel per frame pixel)', () => {
    expect(
      focusCamera(box, page, frame, { fill: 0.9, maxScale: 3, cover: false })
        .scale,
    ).toBe(3);
  });

  it('keeps a page capture covering the frame when asked', () => {
    const camera = focusCamera(
      { x: 0, y: 0, width: 50, height: 50 },
      page,
      frame,
      { fill: 0.2 },
    );
    expect(camera.scale).toBeCloseTo((1080 * 0.2) / 50);
    expect(camera.x).toBe(0);
    expect(camera.y).toBe(0);
    const wide = focusCamera(
      { x: 0, y: 0, width: 1440, height: 810 },
      page,
      frame,
      { fill: 0.1 },
    );
    expect(wide.scale).toBeCloseTo(1920 / 1440);
  });

  it('defaults to a centred, 70% framing', () => {
    const camera = focusCamera(box, page, frame);
    expect(camera.scale).toBeCloseTo(
      Math.min((1920 * 0.7) / 200, (1080 * 0.7) / 100),
    );
    expect(camera.y + (box.y + box.height / 2) * camera.scale).toBeCloseTo(540);
  });
});

describe('fullCamera and containCamera', () => {
  it('fits a page capture edge to edge', () => {
    const camera = fullCamera(page, frame);
    expect(camera.scale).toBeCloseTo(1920 / 1440);
    expect(camera.x).toBeCloseTo(0);
    expect(camera.y).toBeCloseTo(0);
  });

  it('centres an element capture inside a region', () => {
    expect(
      containCamera(
        { width: 400, height: 800 },
        { x: 100, y: 50, width: 600, height: 400 },
      ),
    ).toEqual({
      scale: 0.5,
      x: 300,
      y: 50,
    });
  });
});

describe('mixCamera', () => {
  const from = { scale: 1, x: 0, y: 0 };
  const to = { scale: 4, x: -1000, y: -500 };

  it('returns the end points at 0 and 1 and clamps outside', () => {
    expect(mixCamera(from, to, 0, frame)).toEqual(from);
    expect(mixCamera(from, to, 1, frame).scale).toBeCloseTo(4);
    expect(mixCamera(from, to, 1, frame).x).toBeCloseTo(-1000);
    expect(mixCamera(from, to, 2, frame).scale).toBeCloseTo(4);
    expect(mixCamera(from, to, -1, frame)).toEqual(from);
  });

  it('zooms geometrically', () => {
    expect(mixCamera(from, to, 0.5, frame).scale).toBeCloseTo(2);
  });
});

describe('cameraAt', () => {
  const a = { at: 0, camera: { scale: 1, x: 0, y: 0 } };
  const b = { at: 40, camera: { scale: 2, x: -100, y: -100 } };

  it('holds, travels during the move window, then holds the next stop', () => {
    expect(cameraAt([a, b], 10, 20, frame, linear)).toEqual(a.camera);
    expect(cameraAt([a, b], 30, 20, frame, linear).scale).toBeCloseTo(
      Math.SQRT2,
    );
    expect(cameraAt([a, b], 60, 20, frame, linear).scale).toBeCloseTo(2);
  });

  it('cuts when the move takes no frames', () => {
    expect(cameraAt([a, b], 41, 0, frame, linear).scale).toBeCloseTo(2);
  });

  it('needs at least one stop', () => {
    expect(() => cameraAt([], 0, 10, frame, linear)).toThrow(
      'at least one stop',
    );
  });
});

describe('projectBox', () => {
  it('maps capture pixels into the frame', () => {
    expect(
      projectBox(
        { x: 10, y: 20, width: 30, height: 40 },
        { scale: 2, x: 5, y: -5 },
      ),
    ).toEqual({
      x: 25,
      y: 35,
      width: 60,
      height: 80,
    });
  });
});
