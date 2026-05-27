import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { PITCH_SLIDES } from '@/config/pitch';
import { PitchNav } from '../PitchNav.client';

function clearBody() {
  while (document.body.firstChild) {
    document.body.removeChild(document.body.firstChild);
  }
}

describe('PitchNav.client', () => {
  beforeEach(() => {
    // gtag is mocked globally by vitest.setup.ts; reset call history per test.
    vi.mocked(window.gtag as ReturnType<typeof vi.fn>).mockClear();
  });

  afterEach(() => {
    clearBody();
  });

  describe('rendering', () => {
    it('renders one dot per slide', () => {
      render(<PitchNav />);
      expect(screen.getAllByRole('button')).toHaveLength(PITCH_SLIDES.length);
    });

    it('marks the first slide active by default', () => {
      render(<PitchNav />);
      const buttons = screen.getAllByRole('button');
      expect(buttons[0]).toHaveAttribute('data-active', 'true');
      expect(buttons[0]).toHaveAttribute('aria-current', 'true');
      expect(buttons[1]).toHaveAttribute('data-active', 'false');
    });

    it('labels every dot for assistive tech', () => {
      render(<PitchNav />);
      for (const slide of PITCH_SLIDES) {
        expect(
          screen.getByLabelText(`Jump to ${slide.label}`),
        ).toBeInTheDocument();
      }
    });
  });

  describe('analytics', () => {
    it('fires pitch_view on mount', () => {
      render(<PitchNav />);
      expect(window.gtag).toHaveBeenCalledWith('event', 'pitch_view', {
        source: 'pitch_page',
      });
    });
  });

  describe('keyboard handler', () => {
    it('ignores unrelated keys', () => {
      render(<PitchNav />);
      act(() => {
        fireEvent.keyDown(window, { key: 'Enter' });
        fireEvent.keyDown(window, { key: 'a' });
      });
      expect(screen.getAllByRole('button')[0]).toHaveAttribute(
        'data-active',
        'true',
      );
    });

    it('ignores modifier-key combos', () => {
      render(<PitchNav />);
      act(() => {
        fireEvent.keyDown(window, { key: 'ArrowDown', metaKey: true });
        fireEvent.keyDown(window, { key: 'ArrowDown', ctrlKey: true });
        fireEvent.keyDown(window, { key: 'ArrowDown', altKey: true });
      });
      expect(screen.getAllByRole('button')[0]).toHaveAttribute(
        'data-active',
        'true',
      );
    });

    it('ignores keys while an input is focused', () => {
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();
      render(<PitchNav />);
      act(() => {
        fireEvent.keyDown(input, { key: 'ArrowDown' });
      });
      expect(screen.getAllByRole('button')[0]).toHaveAttribute(
        'data-active',
        'true',
      );
    });

    it('handles every supported navigation key without crashing', () => {
      render(<PitchNav />);
      act(() => {
        fireEvent.keyDown(window, { key: 'ArrowDown' });
        fireEvent.keyDown(window, { key: 'ArrowUp' });
        fireEvent.keyDown(window, { key: 'PageDown' });
        fireEvent.keyDown(window, { key: 'PageUp' });
        fireEvent.keyDown(window, { key: ' ' });
        fireEvent.keyDown(window, { key: ' ', shiftKey: true });
        fireEvent.keyDown(window, { key: 'Spacebar' });
        fireEvent.keyDown(window, { key: 'j' });
        fireEvent.keyDown(window, { key: 'J' });
        fireEvent.keyDown(window, { key: 'k' });
        fireEvent.keyDown(window, { key: 'K' });
      });
    });
  });

  describe('IntersectionObserver wiring', () => {
    function mountWithSlides(slideCount: number) {
      let captured: IntersectionObserverCallback | undefined;
      const observe = vi.fn();
      const disconnect = vi.fn();
      class MockIO {
        observe = observe;
        disconnect = disconnect;
        unobserve = vi.fn();
        takeRecords = (): IntersectionObserverEntry[] => [];
        constructor(callback: IntersectionObserverCallback) {
          captured = callback;
        }
      }
      const original = globalThis.IntersectionObserver;
      vi.stubGlobal('IntersectionObserver', MockIO);

      // Mount slide-shaped DOM with a counter so scrollToSlide + setCounter
      // hit their happy paths, not just the null-guard branches.
      const counter = document.createElement('span');
      counter.setAttribute('data-pitch-counter-current', '');
      counter.textContent = '01';
      document.body.appendChild(counter);

      const slideElements: HTMLElement[] = [];
      for (const slide of PITCH_SLIDES.slice(0, slideCount)) {
        const el = document.createElement('section');
        el.id = `slide-${slide.id}`;
        el.setAttribute('data-slide-id', slide.id);
        // jsdom doesn't implement scrollIntoView — stub it so clicks don't throw.
        el.scrollIntoView = vi.fn();
        document.body.appendChild(el);
        slideElements.push(el);
      }

      const utils = render(<PitchNav />);
      return {
        ...utils,
        observe,
        disconnect,
        counter,
        slideElements,
        // Convenience: invoke the captured IO callback as if entries fired.
        triggerEntries(targets: HTMLElement[], isIntersecting = true) {
          if (captured === undefined) {
            throw new Error('IntersectionObserver callback was not captured');
          }
          const observer = {
            disconnect,
            observe,
            unobserve: vi.fn(),
            takeRecords: () => [],
            root: null,
            rootMargin: '',
            thresholds: [0.5],
          } as unknown as IntersectionObserver;
          const entries = targets.map((target) => ({
            target,
            isIntersecting,
            intersectionRatio: isIntersecting ? 1 : 0,
            intersectionRect: target.getBoundingClientRect(),
            boundingClientRect: target.getBoundingClientRect(),
            rootBounds: null,
            time: 0,
          })) as unknown as IntersectionObserverEntry[];
          act(() => {
            captured!(entries, observer);
          });
        },
        teardown() {
          vi.stubGlobal('IntersectionObserver', original);
        },
      };
    }

    it('observes each rendered slide element and cleans up on unmount', () => {
      const ctx = mountWithSlides(3);
      try {
        expect(ctx.observe).toHaveBeenCalledTimes(3);
        ctx.unmount();
        expect(ctx.disconnect).toHaveBeenCalled();
      } finally {
        ctx.teardown();
      }
    });

    it('updates the active dot, navbar counter, and fires pitch_slide_viewed when a slide intersects', () => {
      const ctx = mountWithSlides(3);
      try {
        // Slide 3 (index 2) intersects → counter shows 03, dot 3 active,
        // gtag receives pitch_slide_viewed event with slide_id 'solution'.
        ctx.triggerEntries([ctx.slideElements[2]!]);

        expect(ctx.counter.textContent).toBe('03');
        const buttons = screen.getAllByRole('button');
        expect(buttons[2]).toHaveAttribute('data-active', 'true');
        expect(buttons[0]).toHaveAttribute('data-active', 'false');
        expect(window.gtag).toHaveBeenCalledWith(
          'event',
          'pitch_slide_viewed',
          { slide_id: PITCH_SLIDES[2].id },
        );
      } finally {
        ctx.teardown();
      }
    });

    it('ignores non-intersecting and unrecognized entries', () => {
      const ctx = mountWithSlides(3);
      try {
        const orphan = document.createElement('section');
        orphan.setAttribute('data-slide-id', 'not-a-slide');
        document.body.appendChild(orphan);

        ctx.triggerEntries([ctx.slideElements[0]!], false); // not intersecting
        ctx.triggerEntries([orphan], true); // intersecting but unknown id

        // Active dot remains the default (first slide); counter unchanged.
        const buttons = screen.getAllByRole('button');
        expect(buttons[0]).toHaveAttribute('data-active', 'true');
        expect(ctx.counter.textContent).toBe('01');
      } finally {
        ctx.teardown();
      }
    });

    it('drives keyboard navigation against real slide elements', () => {
      const ctx = mountWithSlides(PITCH_SLIDES.length);
      try {
        // ArrowDown from slide 0 → scrollIntoView called on slide 1.
        fireEvent.keyDown(window, { key: 'ArrowDown' });
        expect(ctx.slideElements[1]?.scrollIntoView).toHaveBeenCalled();

        // ArrowUp from slide 0 stays at 0 (Math.max guard).
        fireEvent.keyDown(window, { key: 'ArrowUp' });
        // No assertion on element 0 — scrollIntoView WOULD be called on
        // slide-0 (which is the same as current), proving the up-guard path.
        expect(ctx.slideElements[0]?.scrollIntoView).toHaveBeenCalled();
      } finally {
        ctx.teardown();
      }
    });
  });

  describe('form field guards', () => {
    it('ignores keys originating from a textarea', () => {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();
      render(<PitchNav />);
      act(() => {
        fireEvent.keyDown(textarea, { key: 'ArrowDown' });
      });
      expect(screen.getAllByRole('button')[0]).toHaveAttribute(
        'data-active',
        'true',
      );
    });

    it('ignores keys originating from a contenteditable element', () => {
      const div = document.createElement('div');
      div.contentEditable = 'true';
      document.body.appendChild(div);
      div.focus();
      render(<PitchNav />);
      act(() => {
        fireEvent.keyDown(div, { key: 'ArrowDown' });
      });
      expect(screen.getAllByRole('button')[0]).toHaveAttribute(
        'data-active',
        'true',
      );
    });
  });

  describe('dot click', () => {
    it('does not crash when slide DOM nodes are missing', () => {
      render(<PitchNav />);
      fireEvent.click(
        screen.getByLabelText(`Jump to ${PITCH_SLIDES[2].label}`),
      );
    });

    it('scrolls into view when the slide DOM node exists', () => {
      const slide = document.createElement('section');
      slide.id = `slide-${PITCH_SLIDES[1].id}`;
      slide.setAttribute('data-slide-id', PITCH_SLIDES[1].id);
      const scrollSpy = vi.fn();
      slide.scrollIntoView = scrollSpy;
      document.body.appendChild(slide);

      render(<PitchNav />);
      fireEvent.click(
        screen.getByLabelText(`Jump to ${PITCH_SLIDES[1].label}`),
      );
      expect(scrollSpy).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      });
    });
  });
});
