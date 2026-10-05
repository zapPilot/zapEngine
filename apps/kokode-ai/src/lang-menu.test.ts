// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { initLangMenu } from './lang-menu';

const menu = (id: string) =>
  `<details class="lang-switch" id="${id}"><summary>x</summary><ul><li><a href="/">a</a></li></ul></details>`;

describe('initLangMenu', () => {
  let stop: () => void;
  let first: HTMLDetailsElement;
  let second: HTMLDetailsElement;

  beforeEach(() => {
    document.body.innerHTML = `${menu('one')}${menu('two')}<p id="outside">text</p>`;
    first = document.getElementById('one') as HTMLDetailsElement;
    second = document.getElementById('two') as HTMLDetailsElement;
    stop = initLangMenu();
  });
  afterEach(() => stop());

  it('does nothing without a menu', () => {
    document.body.innerHTML = '';
    expect(() => initLangMenu()()).not.toThrow();
  });

  it('closes the other menus when one opens', () => {
    first.open = true;
    first.dispatchEvent(new Event('toggle'));
    second.open = true;
    second.dispatchEvent(new Event('toggle'));
    expect(first.open).toBe(false);
    expect(second.open).toBe(true);
  });

  it('closes on a click outside, not inside', () => {
    first.open = true;
    first
      .querySelector('a')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(first.open).toBe(true);
    document
      .getElementById('outside')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(first.open).toBe(false);
  });

  it('closes on Escape and returns focus to the button', () => {
    first.open = true;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(first.open).toBe(false);
    expect(document.activeElement).toBe(first.querySelector('summary'));
  });

  it('ignores other keys and stops listening once removed', () => {
    first.open = true;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(first.open).toBe(true);
    stop();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(first.open).toBe(true);
  });
});
