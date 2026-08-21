'use client';

/**
 * Expand-to-overlay wrapper for a chart card.
 *
 * A CSS overlay rather than the Fullscreen API: `requestFullscreen` is absent
 * in jsdom and unsupported for arbitrary elements on iOS Safari, and the chart
 * shell declares `container-type: inline-size`, which would trap an in-tree
 * `position: fixed` child inside the containment box.
 *
 * The overlay is portalled to `document.body` and re-declares `.shell-root`
 * there: every landing chart rule is scoped under that class, so an overlay
 * outside the shell would render an unstyled chart.
 *
 * Knows nothing about what it wraps — the caller passes the figure to enlarge.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';

export function ChartZoom({
  label,
  children,
}: {
  /** Names the chart in both buttons' accessible names, e.g. "Strategy NAV". */
  readonly label: string;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);

    // Store the previous value rather than clearing: the page may already be
    // locked by something else.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    // Captured here rather than read in the cleanup: the trigger stays mounted
    // for the whole open lifetime, so this is the node focus must return to.
    const trigger = triggerRef.current;

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // One return path for every way out — Escape, backdrop, close button,
      // unmount — so focus never lands back on the document body.
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="chart-zoom-trigger"
        aria-label={`Expand ${label} chart`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Maximize2 aria-hidden />
      </button>

      {open &&
        createPortal(
          <div
            className="shell-root chart-zoom-overlay"
            onClick={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            {/*
              Two tabbable elements only, so the browser's own tab order is
              enough — no focus trap. Escape and the backdrop both close, which
              is what a trap would otherwise be protecting.
            */}
            <div
              className="chart-zoom-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={`${label} — expanded chart`}
            >
              <button
                ref={closeRef}
                type="button"
                className="chart-zoom-close"
                aria-label="Close expanded chart"
                onClick={() => setOpen(false)}
              >
                <X aria-hidden />
              </button>
              {children}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
