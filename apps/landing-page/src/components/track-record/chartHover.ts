/**
 * Pointer and keyboard math for the chart hover layer.
 *
 * Kept free of React and the DOM so the scale-invariance that makes the
 * crosshair correct at every viewport width is unit-testable without
 * simulating pointer events.
 */

/** The structural slice of DOMRect this module needs. */
export interface PointerBox {
  readonly left: number;
  readonly width: number;
}

export interface HoverKey {
  readonly key: string;
  readonly shiftKey: boolean;
}

/** Half the tooltip's max-width plus a little air, in px. Track landing.css. */
const TOOLTIP_EDGE_GUARD = 122;

/**
 * Nearest data index under the pointer, or -1 when the box has no layout.
 *
 * The caller measures the hover surface, whose inset is the plot band, so the
 * fraction across the box is already the fraction across the index domain — no
 * viewBox conversion, and correct at any rendered width. jsdom reports a
 * zero-width box, so the guard makes an unstubbed test fail loudly instead of
 * asserting on garbage.
 */
export function indexFromPointer(
  clientX: number,
  box: PointerBox,
  total: number,
): number {
  if (total <= 0 || box.width <= 0) return -1;
  if (total === 1) return 0;
  const ratio = (clientX - box.left) / box.width;
  return Math.min(total - 1, Math.max(0, Math.round(ratio * (total - 1))));
}

/**
 * Next index for a key press, or null when the key is not ours — the caller
 * uses null to decide whether to preventDefault.
 *
 * Shift+Arrow jumps between marked events and stops at the last one; with no
 * events to jump to it degrades to a plain step rather than doing nothing.
 */
export function nextIndexForKey(
  event: HoverKey,
  current: number,
  total: number,
  eventIndices: readonly number[],
): number | null {
  if (total <= 0) return null;
  const clamp = (value: number): number =>
    Math.min(total - 1, Math.max(0, value));

  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowLeft': {
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      if (!event.shiftKey || eventIndices.length === 0) {
        return clamp(current + direction);
      }
      return nearestEventIndex(eventIndices, current, direction) ?? current;
    }
    case 'PageDown':
      return clamp(current + 10);
    case 'PageUp':
      return clamp(current - 10);
    case 'Home':
      return 0;
    case 'End':
      return total - 1;
    default:
      return null;
  }
}

function nearestEventIndex(
  eventIndices: readonly number[],
  current: number,
  direction: number,
): number | null {
  const candidates = eventIndices.filter((index) =>
    direction > 0 ? index > current : index < current,
  );
  if (candidates.length === 0) return null;
  return direction > 0 ? Math.min(...candidates) : Math.max(...candidates);
}

/**
 * Keep a centre-anchored tooltip inside the card without measuring it — CSS
 * clamps the position, so there is no read-then-reposition frame.
 */
export function tooltipLeftStyle(leftPercent: string): string {
  return `clamp(${TOOLTIP_EDGE_GUARD}px, ${leftPercent}, calc(100% - ${TOOLTIP_EDGE_GUARD}px))`;
}
