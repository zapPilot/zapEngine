// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initInterest, interestLabel } from './interest';
import { INTEREST } from './story/form';

const label = (id: string) =>
  INTEREST.find((option) => option.id === id)?.label ?? '';

function mount(
  options: readonly string[] = INTEREST.map((option) => option.label),
): void {
  document.body.innerHTML = `
    <select id="interest">
      <option value="">-</option>
      ${options.map((value) => `<option value="${value}">${value}</option>`).join('')}
    </select>
    <a href="#contact" data-interest="materials">materials</a>
    <a href="#contact" data-interest="KOKODE Studio">legacy</a>
    <a href="#contact" data-interest="partner">partner</a>`;
}

const select = () =>
  document.querySelector<HTMLSelectElement>('#interest') as HTMLSelectElement;

function click(index: number): void {
  document.querySelectorAll<HTMLElement>('[data-interest]')[index]?.click();
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('interestLabel', () => {
  it('maps ids to option labels and rejects anything else', () => {
    expect(interestLabel('partner')).toBe(label('partner'));
    expect(interestLabel('KOKODE Studio')).toBeNull();
    expect(interestLabel(null)).toBeNull();
    expect(interestLabel(undefined)).toBeNull();
  });
});

describe('initInterest', () => {
  it('preselects the option named by ?interest=', () => {
    window.history.replaceState(null, '', '/?interest=partner#contact');
    mount();
    initInterest();
    expect(select().value).toBe(label('partner'));
  });

  it('ignores an unknown ?interest= value', () => {
    window.history.replaceState(null, '', '/?interest=KOKODE%20Studio');
    mount();
    initInterest();
    expect(select().value).toBe('');
  });

  it('applies a data-interest link only when its option exists', () => {
    mount();
    initInterest();
    click(1);
    expect(select().value).toBe('');
    click(0);
    expect(select().value).toBe(label('materials'));
  });

  it('leaves the select alone when the form does not offer that option', () => {
    mount([label('referral')]);
    initInterest();
    click(2);
    expect(select().value).toBe('');
  });

  it('does nothing on pages without the form', () => {
    document.body.innerHTML = '<a data-interest="partner">x</a>';
    expect(() => initInterest()).not.toThrow();
  });
});
