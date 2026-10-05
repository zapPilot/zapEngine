import { markup, type Markup } from './markup';

// Decorative line icons; the text next to each one carries the meaning.
const icon = (body: Markup): Markup =>
  markup`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICONS = {
  pc: icon(
    markup`<rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" />`,
  ),
  tablet: icon(
    markup`<rect x="5" y="3" width="14" height="18" rx="2" /><path d="M11 18h2" />`,
  ),
  phone: icon(
    markup`<rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18h2" />`,
  ),
  lock: icon(
    markup`<rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />`,
  ),
  server: icon(
    markup`<rect x="4" y="4" width="16" height="7" rx="1.5" /><rect x="4" y="13" width="16" height="7" rx="1.5" /><path d="M8 7.5h.01M8 16.5h.01" />`,
  ),
  wifi: icon(
    markup`<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01" />`,
  ),
  blocked: icon(
    markup`<circle cx="12" cy="12" r="9" /><path d="M6 6l12 12" />`,
  ),
  arrow: icon(markup`<path d="M4 12h16M14 6l6 6-6 6" />`),
  globe: icon(
    markup`<circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z" />`,
  ),
} as const;

/**
 * Placeholder line drawing for the anatomy demo, to be replaced by a figure
 * the local model generated and a physician checked.
 */
export const SKETCH = markup`<svg class="sketch" viewBox="0 0 200 160" aria-hidden="true" focusable="false">
  <path d="M30 42C52 16 148 16 170 42" />
  <path d="M30 42C21 72 30 112 62 136M170 42C179 72 170 112 138 136" />
  <path d="M40 50C60 41 85 43 98 56M160 50C140 41 115 43 102 56" />
  <path d="M100 52C70 52 46 72 49 101C51 126 76 141 100 133C124 141 149 126 151 101C154 72 130 52 100 52Z" />
  <path class="sketch-mid" d="M100 30V146" />
  <path class="sketch-accent" d="M81 98C79 114 77 130 75 150" />
</svg>`;
