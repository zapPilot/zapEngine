// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initDeckNav, slideTarget } from './nav';

describe('slideTarget', () => {
  it.each([
    ['ArrowDown', false, 2, 3],
    ['ArrowRight', false, 2, 3],
    ['PageDown', false, 2, 3],
    [' ', false, 2, 3],
    [' ', true, 2, 1],
    ['ArrowUp', false, 2, 1],
    ['ArrowLeft', false, 2, 1],
    ['PageUp', false, 2, 1],
    ['Home', false, 2, 0],
    ['End', false, 2, 4],
  ])('%s (shift %s) from %i goes to %i', (key, shift, from, to) => {
    expect(slideTarget(key, shift, from, 5)).toBe(to);
  });

  it('stays inside the deck and ignores other keys', () => {
    expect(slideTarget('ArrowDown', false, 4, 5)).toBe(4);
    expect(slideTarget('ArrowUp', false, 0, 5)).toBe(0);
    expect(slideTarget('a', false, 2, 5)).toBeNull();
  });
});

describe('initDeckNav', () => {
  let scrolled: string[];
  let dispose: () => void;

  beforeEach(() => {
    document.body.innerHTML = `
      <main class="deck">
        <section class="slide" id="one"></section>
        <section class="slide" id="two"><input id="field" /></section>
        <section class="slide" id="three"></section>
      </main>`;
    scrolled = [];
    for (const slide of Array.from(document.querySelectorAll('.slide'))) {
      (slide as HTMLElement).scrollIntoView = function () {
        scrolled.push(this.id);
      };
    }
    window.history.replaceState(null, '', '/pitch/#two');
    dispose = initDeckNav();
  });

  afterEach(() => {
    dispose();
    vi.restoreAllMocks();
  });

  const press = (
    key: string,
    init: KeyboardEventInit = {},
    target: EventTarget = document.body,
  ) => {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    target.dispatchEvent(event);
    return event;
  };

  it('pages from the slide in the URL hash', () => {
    expect(press('ArrowDown').defaultPrevented).toBe(true);
    press('ArrowDown');
    press('Home');
    expect(scrolled).toEqual(['three', 'three', 'one']);
  });

  it('leaves typing, modified keys and other keys alone', () => {
    const field = document.querySelector('#field') as HTMLElement;
    expect(press('ArrowDown', {}, field).defaultPrevented).toBe(false);
    expect(press('ArrowDown', { metaKey: true }).defaultPrevented).toBe(false);
    expect(press('ArrowDown', { altKey: true }).defaultPrevented).toBe(false);
    expect(press('x').defaultPrevented).toBe(false);
    expect(scrolled).toEqual([]);
  });

  it('stops listening once disposed', () => {
    dispose();
    press('ArrowDown');
    expect(scrolled).toEqual([]);
  });
});

describe('initDeckNav without slides', () => {
  it('is a no-op', () => {
    document.body.innerHTML = '<main></main>';
    expect(() => initDeckNav()()).not.toThrow();
  });
});
