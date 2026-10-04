import { SALES_EMAIL, SUPPORT_EMAIL } from './config';
import { initWaitlist } from './waitlist';

function initInterestLinks(): void {
  const interest = document.querySelector<HTMLSelectElement>('#interest');
  if (!interest) return;

  document
    .querySelectorAll<HTMLAnchorElement>('.interest-link')
    .forEach((link) => {
      link.addEventListener('click', () => {
        interest.value = link.dataset.interest || 'KOKODE Studio';
      });
    });
}

function initContactEmails(): void {
  const row = document.querySelector<HTMLElement>('[data-contact-row]');
  const sales = document.querySelector<HTMLAnchorElement>('[data-sales-email]');
  const support = document.querySelector<HTMLAnchorElement>(
    '[data-support-email]',
  );

  const entries: Array<[HTMLAnchorElement | null, string]> = [
    [sales, SALES_EMAIL],
    [support, SUPPORT_EMAIL],
  ];

  let visible = 0;
  for (const [element, email] of entries) {
    if (!element) continue;
    if (!email) {
      element.hidden = true;
      continue;
    }
    element.href = `mailto:${email}`;
    element.textContent = email;
    visible += 1;
  }

  if (row) row.hidden = visible === 0;
}

initInterestLinks();
initContactEmails();
initWaitlist();
