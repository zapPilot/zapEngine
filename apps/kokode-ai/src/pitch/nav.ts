// Keyboard paging for the pitch decks. Without this script the slides still
// scroll and snap; with it, arrows/PageUp/PageDown/Space/Home/End page, and
// the URL hash follows the slide on screen so a link reopens the same slide.

import { initLangMenu } from '../lang-menu';

const NEXT = new Set(['ArrowDown', 'ArrowRight', 'PageDown', ' ']);
const PREVIOUS = new Set(['ArrowUp', 'ArrowLeft', 'PageUp']);

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SUMMARY'].includes(
      target.tagName,
    )
  );
}

function reducedMotion(): boolean {
  return (
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  );
}

export function slideTarget(
  key: string,
  shift: boolean,
  current: number,
  count: number,
): number | null {
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const step =
    key === ' ' && shift ? -1 : NEXT.has(key) ? 1 : PREVIOUS.has(key) ? -1 : 0;
  if (step === 0) return null;
  return Math.min(Math.max(current + step, 0), count - 1);
}

export function initDeckNav(root: ParentNode = document): () => void {
  const slides = Array.from(root.querySelectorAll<HTMLElement>('.slide'));
  if (slides.length === 0) return () => undefined;
  let current = Math.max(
    0,
    slides.findIndex((slide) => `#${slide.id}` === window.location.hash),
  );

  const go = (index: number): void => {
    const slide = slides[index];
    if (!slide) return;
    current = index;
    slide.scrollIntoView({
      behavior: reducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || isTyping(event.target)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = slideTarget(
      event.key,
      event.shiftKey,
      current,
      slides.length,
    );
    if (target === null) return;
    event.preventDefault();
    go(target);
  };
  document.addEventListener('keydown', onKey);

  let observer: IntersectionObserver | null = null;
  if (typeof IntersectionObserver === 'function') {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = slides.indexOf(entry.target as HTMLElement);
          if (index === -1) continue;
          current = index;
          history.replaceState(null, '', `#${entry.target.id}`);
        }
      },
      { threshold: 0.6 },
    );
    slides.forEach((slide) => observer?.observe(slide));
  }

  return () => {
    document.removeEventListener('keydown', onKey);
    observer?.disconnect();
  };
}

/** Exported PDFs and browser printouts link to the live site. */
function initPrintLinks(): void {
  const swap = (toPdf: boolean) => {
    document
      .querySelectorAll<HTMLAnchorElement>('a[data-pdf-href]')
      .forEach((link) => {
        if (toPdf) {
          link.dataset['webHref'] = link.getAttribute('href') ?? '';
          link.href = link.dataset['pdfHref'] ?? link.href;
        } else if (link.dataset['webHref'] !== undefined) {
          link.setAttribute('href', link.dataset['webHref']);
        }
      });
  };
  window.addEventListener('beforeprint', () => swap(true));
  window.addEventListener('afterprint', () => swap(false));
}

if (typeof document !== 'undefined' && document.querySelector('.deck')) {
  initLangMenu();
  initDeckNav();
  initPrintLinks();
}
