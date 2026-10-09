// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { engineFrame } from '../model/index.js';
import { EngineWorld } from './EngineWorld.js';
afterEach(cleanup);
const pinTexts = (container: HTMLElement) =>
  [...container.querySelectorAll('.zp-blb-box')].map((box) => [
    box.firstElementChild?.textContent,
    box.querySelector('.zp-blb-s')?.textContent,
  ]);
it('keeps the story camera unless a host stage supplies its own origins', () => {
  const story = render(<EngineWorld time={0.09} />).container;
  const world = story.querySelector<HTMLElement>('.zp-world')!;
  expect([world.style.left, world.style.top]).toEqual(['62%', '57%']);
  cleanup();
  const host = render(
    <EngineWorld
      time={0.09}
      origin={[0.465, 0.51]}
      perspectiveOrigin={[0.465, 0.42]}
    />,
  ).container;
  const hosted = host.querySelector<HTMLElement>('.zp-world')!;
  expect([hosted.style.left, hosted.style.top]).toEqual(['46.5%', '51%']);
  expect(
    host.querySelector<HTMLElement>('.zp-persp')!.style.perspectiveOrigin,
  ).toBe('46.5% 42%');
});
it('relabels text pins by id without a precomputed frame and drops their English subtitle', () => {
  const plain = render(<EngineWorld time={0.09} />).container;
  expect(pinTexts(plain)).toEqual([
    ['YOUR STRATEGY', 'readable rules'],
    ['YOUR MACHINE', 'planned · hosted today'],
    ['YOUR WALLET', 'you sign'],
  ]);
  cleanup();
  const labelled = render(
    <EngineWorld
      time={0.09}
      pinLabels={{ 'your-strategy': '你的策略', 'your-wallet': '你的錢包' }}
    />,
  ).container;
  expect(pinTexts(labelled)).toEqual([
    ['你的策略', ''],
    ['YOUR MACHINE', 'planned · hosted today'],
    ['你的錢包', ''],
  ]);
});
it('keeps asset pins on their glyph and value, and reads ids from a supplied frame', () => {
  const frame = engineFrame(0.51);
  const { container } = render(
    <EngineWorld
      time={0}
      frame={frame}
      pinLabels={{ spy: 'S&P 500', target: 'GOAL' }}
    />,
  );
  const boxes = [...container.querySelectorAll('.zp-blb-box')];
  const spy = boxes.find(
    (box) => box.querySelector('.zp-asset-glyph title')?.textContent === 'SPY',
  )!;
  expect(spy.textContent).not.toContain('S&P 500');
  expect(spy.querySelector('.zp-blb-s')?.textContent).toMatch(/%$/);
  expect(boxes.map((box) => box.firstElementChild?.textContent)).toContain(
    'GOAL',
  );
});
it('draws only the requested layers and can omit the landing veil', () => {
  const { container } = render(
    <EngineWorld time={1} veil={false} layers={['faces', 'dial', 'dots']} />,
  );
  expect(container.querySelectorAll('.zp-fc').length).toBeGreaterThan(0);
  expect(container.querySelector('.zp-dial3d')).not.toBeNull();
  expect(container.querySelectorAll('.zp-dot3d').length).toBeGreaterThan(0);
  for (const hidden of ['.zp-blb', '.zp-tag3d', '.zp-veil']) {
    expect(container.querySelector(hidden)).toBeNull();
  }
  cleanup();
  const labels = render(
    <EngineWorld time={0.3} layers={['tags', 'pins']} />,
  ).container;
  for (const hidden of ['.zp-fc', '.zp-dial3d', '.zp-dot3d']) {
    expect(labels.querySelector(hidden)).toBeNull();
  }
  expect(labels.querySelectorAll('.zp-tag3d').length).toBeGreaterThan(0);
  expect(labels.querySelector('.zp-veil')).not.toBeNull();
});
