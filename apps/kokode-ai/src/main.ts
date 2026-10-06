import { getAttribution } from './analytics';
import { SALES_EMAIL, SUPPORT_EMAIL } from './config';
import { initInterest } from './interest';
import { initLangMenu } from './lang-menu';
import { initWaitlist } from './waitlist';

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

// Record the first touch (UTM, referrer, landing URL) on arrival, not only
// when the form is submitted. Runs on every page, including privacy.html.
getAttribution();
initInterest();
initLangMenu();
initContactEmails();
initWaitlist();
