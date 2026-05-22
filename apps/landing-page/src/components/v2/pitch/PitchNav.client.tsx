'use client';

import { useEffect, useRef, useState } from 'react';
import { PITCH_SLIDES, type PitchSlideId } from '@/config/pitch';
import { trackPitchView, trackSlideViewed } from '@/lib/analytics/pitch';

const KEYS_DOWN = new Set(['ArrowDown', 'PageDown', 'j', 'J']);
const KEYS_UP = new Set(['ArrowUp', 'PageUp', 'k', 'K']);

function directionFromEvent(event: KeyboardEvent): 'down' | 'up' | null {
  if (event.key === ' ' || event.key === 'Spacebar') {
    return event.shiftKey ? 'up' : 'down';
  }
  if (KEYS_DOWN.has(event.key)) return 'down';
  if (KEYS_UP.has(event.key)) return 'up';
  return null;
}

function isFormFieldTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

function scrollToSlide(id: PitchSlideId) {
  if (typeof document === 'undefined') return;
  const element = document.getElementById(`slide-${id}`);
  if (element !== null) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function setCounter(index: number) {
  if (typeof document === 'undefined') return;
  const node = document.querySelector('[data-pitch-counter-current]');
  if (node !== null) {
    node.textContent = String(index + 1).padStart(2, '0');
  }
}

/**
 * Right-edge dot navigation for /pitch.
 *
 * Three responsibilities, all driven by the same slide list:
 *   1. Render a clickable dot per slide, gold-fill the active one.
 *   2. Watch arrow / Page / Space / j / k keys and scroll one slide.
 *   3. Watch IntersectionObserver to keep `activeId` and the navbar slide
 *      counter (`[data-pitch-counter-current]`) in sync with scroll position.
 *
 * `activeId` is mirrored in a ref so the keyboard handler is a stable
 * `useEffect` with `[]` deps — no rebinding on every state change.
 */
export function PitchNav() {
  const [activeId, setActiveId] = useState<PitchSlideId>(PITCH_SLIDES[0].id);
  const activeIdRef = useRef<PitchSlideId>(PITCH_SLIDES[0].id);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Fire page-view once on mount.
  useEffect(() => {
    trackPitchView();
  }, []);

  // Keyboard navigation.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isFormFieldTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const direction = directionFromEvent(event);
      if (direction === null) return;

      event.preventDefault();
      const currentIndex = PITCH_SLIDES.findIndex(
        (slide) => slide.id === activeIdRef.current,
      );
      const nextIndex =
        direction === 'down'
          ? Math.min(PITCH_SLIDES.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1);
      const next = PITCH_SLIDES[nextIndex];
      if (next !== undefined) {
        scrollToSlide(next.id);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Sync active slide with scroll position via IntersectionObserver.
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const elements = PITCH_SLIDES.map((slide) =>
      document.getElementById(`slide-${slide.id}`),
    ).filter((element): element is HTMLElement => element !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = entry.target.getAttribute(
            'data-slide-id',
          ) as PitchSlideId | null;
          if (id === null) continue;
          const index = PITCH_SLIDES.findIndex((slide) => slide.id === id);
          if (index < 0) continue;
          setActiveId(id);
          setCounter(index);
          trackSlideViewed(id);
        }
      },
      { threshold: 0.5 },
    );

    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="pitch-dot-nav" aria-label="Pitch slide navigation">
      {PITCH_SLIDES.map((slide) => {
        const isActive = slide.id === activeId;
        return (
          <button
            key={slide.id}
            type="button"
            className="pitch-dot-nav-button"
            data-active={isActive ? 'true' : 'false'}
            aria-label={`Jump to ${slide.label}`}
            {...(isActive ? { 'aria-current': 'true' } : {})}
            onClick={() => scrollToSlide(slide.id)}
          />
        );
      })}
    </nav>
  );
}
