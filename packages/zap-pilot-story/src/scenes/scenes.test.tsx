// @vitest-environment jsdom
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LandingStory, StatusBadge } from './index.js';
import { Captions } from './Captions.js';
import { EngineWorld } from './EngineWorld.js';
import { ReplayBoard } from './ReplayBoard.js';
import { SLOGAN, SLOGAN_PARTS, PUNCHLINE } from '../brand/index.js';
import { STAGES, stageKick } from '../copy/beats.js';
import { capabilityIds } from '../facts/capabilities.js';
import { PartRows } from './PartRows.js';
import {
  CAPABILITIES,
  STATUS_LABEL,
  type CapabilityId,
} from '../facts/index.js';
let tick: FrameRequestCallback;
let reduced = false;
beforeEach(() => {
  reduced = false;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb: FrameRequestCallback) => {
      tick = cb;
      return 1;
    }),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: reduced,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  Object.defineProperty(window, 'innerHeight', {
    value: 900,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, 'innerWidth', {
    value: 1280,
    writable: true,
    configurable: true,
  });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const story = (playback?: 'loop' | 'scroll') => (
  <LandingStory
    playback={playback}
    heroActions={<a href="#join">Join waitlist</a>}
    heroNote={<p>App Store</p>}
    joinForm={<form method="post" />}
  />
);
function startDriver(container: HTMLElement, mode: string) {
  act(() => tick(100));
  expect(
    container.querySelector('[data-mode]')?.getAttribute('data-mode'),
  ).toBe(mode);
}
function selectStages(container: HTMLElement) {
  for (const button of container.querySelectorAll('button')) {
    fireEvent.click(button);
  }
}
describe('Motion scenes', () => {
  it('server-renders a compact, readable poster with every stage and final replay', () => {
    const html = renderToStaticMarkup(story());
    expect(html).toContain('data-mode="poster"');
    expect(html).toContain(PUNCHLINE);
    const { container } = render(story());
    expect(container.querySelector('h1 .sk-sr')?.textContent).toBe(SLOGAN);
    expect(container.querySelector('h1 [data-style="o"]')?.textContent).toBe(
      'machine.',
    );
    expect(
      renderToStaticMarkup(<PartRows />).match(/data-capability=/g),
    ).toHaveLength(3);
    const partsStage = container.querySelectorAll('.zp-stage-list > li')[
      STAGES.findIndex((beat) => beat.name === 'Parts')
    ];
    expect(
      Array.from(partsStage!.querySelectorAll('[data-capability]'), (badge) => [
        badge.getAttribute('data-capability'),
        badge.getAttribute('data-status'),
      ]),
    ).toEqual(
      SLOGAN_PARTS.map((part) => [
        part.capability,
        CAPABILITIES[part.capability].status,
      ]),
    );
    expect(html).toContain('2026-10-05');
    expect(html).toContain('SIGNS THE BATCH');
    expect(html).toContain('82.38%');
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it('renders every caption with its factual status and the sign underline', () => {
    for (const beat of STAGES) {
      const { container } = render(
        <Captions time={(beat.start + beat.end) / 2} />,
      );
      expect(container.textContent).toContain(stageKick(beat));
      if (beat.badge) {
        expect(container.querySelector('[data-capability]')?.textContent).toBe(
          STATUS_LABEL[CAPABILITIES[capabilityIds(beat.badge)[0]!].status],
        );
      }
      cleanup();
    }
    expect(renderToStaticMarkup(<Captions time={2} />)).toContain('Wireframe');
    expect(renderToStaticMarkup(<Captions time={0.82} />)).toContain(
      'data-underline="signature"',
    );
    expect(renderToStaticMarkup(<EngineWorld time={0.2} />)).toContain('SPY');
    expect(
      renderToStaticMarkup(<EngineWorld time={0.35} ambient={2} narrow />),
    ).toContain('RULE 1');
  });
  it('derives every badge status from the capability table and renders replay at the planned sleeve and final result', () => {
    for (const id of Object.keys(CAPABILITIES) as CapabilityId[]) {
      const { container } = render(<StatusBadge capability={id} />);
      expect(container.firstElementChild?.getAttribute('data-status')).toBe(
        CAPABILITIES[id].status,
      );
      expect(container.textContent).toBe(STATUS_LABEL[CAPABILITIES[id].status]);
      cleanup();
    }
    const frames = Array.from({ length: 101 }, (_, i) => i / 100);
    let planned = false;
    for (const progress of frames) {
      const html = renderToStaticMarkup(<ReplayBoard progress={progress} />);
      planned ||= html.includes('data-capability="tokenized-equities"');
      expect(html).not.toMatch(/NaN/);
    }
    expect(planned).toBe(true);
    expect(renderToStaticMarkup(<ReplayBoard />)).toContain('Max drawdown');
  });
  it('runs one throttled scroll driver, jumps to each stage and cancels on unmount', () => {
    const { container, unmount } = render(story('scroll'));
    startDriver(container, 'scroll');
    act(() => tick(110));
    selectStages(container);
    expect(window.scrollTo).toHaveBeenCalledTimes(8);
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
  it('autoplays on ordinary windows without scrolling and rewinds when a stage is selected', () => {
    const { container } = render(story());
    startDriver(container, 'loop');
    const firstFrame = container
      .querySelector('.zp-hero')
      ?.getAttribute('style');
    act(() => tick(8000));
    expect(container.querySelector('.zp-hero')?.getAttribute('style')).not.toBe(
      firstFrame,
    );
    selectStages(container);
    act(() => tick(200));
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
  it('uses a stable still on reduced motion, responds to narrow width, and preserves readable stages', () => {
    reduced = true;
    window.innerWidth = 390;
    const { container } = render(story());
    startDriver(container, 'still');
    act(() => tick(200));
    window.innerWidth = 1000;
    act(() => tick(300));
    expect(container.querySelector('.zp-stage-list')?.children).toHaveLength(8);
  });
});

it('handles unavailable and empty stage navigation without crashing', async () => {
  const { jumpEngine } = await import('./scroll.js');
  jumpEngine(null, 0.2);
  expect(window.scrollTo).not.toHaveBeenCalled();
  const section = document.createElement('section');
  jumpEngine(section, 0.2);
  expect(window.scrollTo).toHaveBeenCalledWith({
    top: -68 - (0.065 + 0.935 * 0.2) * 820,
    behavior: 'smooth',
  });
  section.append(document.createElement('div'));
  jumpEngine(section, 0);
  expect(window.scrollTo).toHaveBeenLastCalledWith({
    top: -68,
    behavior: 'smooth',
  });
});
