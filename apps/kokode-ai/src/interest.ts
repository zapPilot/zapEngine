import { DOM_IDS } from './dom-ids';
import { INTEREST } from '@zapengine/kokode-story/ja/form';

/** The option label for an interest id, or null for an unknown id. */
export function interestLabel(id: string | null | undefined): string | null {
  const match = INTEREST.find((option) => option.id === id);
  return match ? match.label : null;
}

/** Selects the option for `id` only when the form actually offers it. */
function choose(select: HTMLSelectElement, id: string | undefined): void {
  const label = interestLabel(id);
  if (label === null) return;
  if (!Array.from(select.options).some((option) => option.value === label)) {
    return;
  }
  select.value = label;
}

/**
 * Preselects the form from `?interest=<id>` (deck links) and from
 * `[data-interest]` links on the page.
 */
export function initInterest(): void {
  const select = document.getElementById(DOM_IDS.interest);
  if (!(select instanceof HTMLSelectElement)) return;

  const fromQuery = new URLSearchParams(window.location.search).get('interest');
  if (fromQuery) choose(select, fromQuery);

  document.querySelectorAll<HTMLElement>('[data-interest]').forEach((link) => {
    link.addEventListener('click', () => {
      choose(select, link.dataset['interest']);
    });
  });
}
