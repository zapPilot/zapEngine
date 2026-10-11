import { expect, test } from 'vitest';

import { hold, key, REST, rigAt, rigStyle, whipBlur } from './rig';

const linear = (t: number) => t;

test('a key defaults to an upright object centred in the frame', () => {
  expect(key(5)).toEqual({ at: 5, ...REST });
  expect(key(0, { ry: -20 }).ry).toBe(-20);
});

test('the rig holds its ends and eases between neighbouring keys', () => {
  const keys = [
    key(10, { ry: -20, scale: 1 }),
    key(20, { ry: 0, scale: 4 }),
    key(40, { x: 100 }),
  ];
  expect(rigAt(keys, 0, linear).ry).toBe(-20);
  expect(rigAt(keys, 15, linear).ry).toBe(-10);
  expect(rigAt(keys, 15, linear).scale).toBe(2);
  expect(rigAt(keys, 20, linear)).toMatchObject({ ry: 0, scale: 4 });
  expect(rigAt(keys, 30, linear).x).toBe(530);
  expect(rigAt(keys, 99, linear).x).toBe(100);
  expect(rigAt(keys, 15, (t) => t * t).ry).toBe(-15);
  const snappy = [
    key(0, { ry: 0 }),
    key(10, { ry: 10, ease: (t) => Math.sqrt(t) }),
  ];
  expect(rigAt(snappy, 2.5, linear).ry).toBe(5);
});

test('one key is a still camera and none is an error', () => {
  expect(rigAt([key(0, { rz: 3 })], 50, linear).rz).toBe(3);
  expect(() => rigAt([], 0, linear)).toThrow('at least one key');
});

test("the pose's focus point is the pivot and lands where the key says", () => {
  const pose = {
    ...REST,
    fx: 100,
    fy: 200,
    x: 500,
    y: 300,
    rx: 5,
    ry: -10,
    rz: 2,
    scale: 1.5,
    z: 20,
  };
  expect(rigStyle(pose, { x: 17, y: 17 })).toEqual({
    left: 500 - 117,
    top: 300 - 217,
    transformOrigin: '117px 217px',
    transform:
      'translateZ(20px) rotateX(5deg) rotateY(-10deg) rotateZ(2deg) scale(1.5)',
  });
  expect(rigStyle(pose).transformOrigin).toBe('100px 200px');
});

test('only fast whips blur, and never past 9px', () => {
  expect(whipBlur(REST, REST)).toBe(0);
  expect(whipBlur({ ...REST, x: 1000 }, REST)).toBeCloseTo(0.96, 9);
  expect(whipBlur({ ...REST, x: 3000 }, REST)).toBe(9);
  expect(whipBlur({ ...REST, ry: 10 }, REST)).toBeCloseTo(2.56, 9);
  expect(whipBlur({ ...REST, rz: -5 }, REST)).toBeCloseTo(0.16, 9);
});

test('a hold keeps one pose between two frames', () => {
  const [first, second] = hold(0, 30, { x: 2400 });
  expect(first).toEqual(key(0, { x: 2400 }));
  expect(second).toEqual(key(30, { x: 2400 }));
  expect(rigAt([first, second, key(40)], 30, linear).x).toBe(2400);
  expect(hold(5, 6)[0]).toEqual(key(5));
});
