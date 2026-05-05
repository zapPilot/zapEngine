import { describe, expect, it } from 'vitest';
import {
  scaleOnHover,
  fadeInUpStaggered,
  revealOnView,
  staggeredSlideIn,
  pulsingRing,
  containerWithStagger,
  rotatingBorder,
} from '../animations';

describe('animations', () => {
  describe('scaleOnHover', () => {
    it('returns whileHover scale and y values', () => {
      expect(scaleOnHover.whileHover).toEqual({ scale: 1.05, y: -2 });
    });

    it('returns whileTap scale value', () => {
      expect(scaleOnHover.whileTap).toEqual({ scale: 0.95 });
    });
  });

  describe('fadeInUpStaggered', () => {
    it('returns initial opacity and y values', () => {
      const result = fadeInUpStaggered(0);
      expect(result.initial).toEqual({ opacity: 0, y: 30 });
    });

    it('returns whileInView animation props', () => {
      const result = fadeInUpStaggered(0);
      expect(result.whileInView).toEqual({ opacity: 1, y: 0 });
    });

    it('applies delay to transition', () => {
      const result = fadeInUpStaggered(0.2);
      expect(result.transition).toEqual({ duration: 0.6, delay: 0.2 });
    });

    it('defaults to 0 delay', () => {
      const result = fadeInUpStaggered();
      expect(result.transition).toEqual({ duration: 0.6, delay: 0 });
    });

    it('sets viewport once', () => {
      const result = fadeInUpStaggered();
      expect(result.viewport).toEqual({ once: true });
    });
  });

  describe('revealOnView', () => {
    it('returns initial opacity and y values', () => {
      const result = revealOnView({});
      expect(result.initial).toEqual({ opacity: 0, y: 30 });
    });

    it('returns whileInView animation props', () => {
      const result = revealOnView({});
      expect(result.whileInView).toEqual({ opacity: 1, y: 0 });
    });

    it('applies custom delay', () => {
      const result = revealOnView({ delay: 0.5 });
      expect(result.transition).toEqual({ duration: 0.8, delay: 0.5 });
    });

    it('applies custom duration', () => {
      const result = revealOnView({ duration: 1.2 });
      expect(result.transition).toEqual({ duration: 1.2, delay: 0 });
    });

    it('applies custom offsetY', () => {
      const result = revealOnView({ offsetY: 50 });
      expect(result.initial).toEqual({ opacity: 0, y: 50 });
    });

    it('uses default values when no options provided', () => {
      const result = revealOnView();
      expect(result.transition).toEqual({ duration: 0.8, delay: 0 });
      expect(result.initial).toEqual({ opacity: 0, y: 30 });
    });

    it('sets viewport once', () => {
      const result = revealOnView({});
      expect(result.viewport).toEqual({ once: true });
    });
  });

  describe('staggeredSlideIn', () => {
    it('returns initial opacity and x from left', () => {
      const result = staggeredSlideIn(0, 'left');
      expect(result.initial).toEqual({ opacity: 0, x: -20 });
    });

    it('returns animate opacity and x', () => {
      const result = staggeredSlideIn(0, 'left');
      expect(result.animate).toEqual({ opacity: 1, x: 0 });
    });

    it('calculates delay from index', () => {
      const result = staggeredSlideIn(2, 'left', 0.1);
      expect(result.transition).toEqual({ delay: 0.2 });
    });

    it('defaults to left direction', () => {
      const result = staggeredSlideIn(1);
      expect(result.initial).toEqual({ opacity: 0, x: -20 });
    });

    it('slides from right when specified', () => {
      const result = staggeredSlideIn(0, 'right');
      expect(result.initial).toEqual({ opacity: 0, x: 20 });
    });

    it('defaults stagger delay to 0.1', () => {
      const result = staggeredSlideIn(1);
      expect(result.transition).toEqual({ delay: 0.1 });
    });
  });

  describe('pulsingRing', () => {
    it('returns animate with scale and opacity arrays', () => {
      const result = pulsingRing();
      expect(result.animate).toEqual({
        scale: [1, 1.1, 1],
        opacity: [0.1, 0, 0.1],
      });
    });

    it('applies delay', () => {
      const result = pulsingRing(2);
      expect(result.transition).toMatchObject({ delay: 2 });
    });

    it('applies custom duration', () => {
      const result = pulsingRing(0, 6);
      expect(result.transition).toMatchObject({ duration: 6 });
    });

    it('sets repeat to infinity', () => {
      const result = pulsingRing();
      expect(result.transition).toMatchObject({ repeat: Infinity });
    });

    it('sets ease to easeInOut', () => {
      const result = pulsingRing();
      expect(result.transition).toMatchObject({ ease: 'easeInOut' });
    });

    it('defaults duration to 4', () => {
      const result = pulsingRing();
      expect(result.transition).toMatchObject({ duration: 4 });
    });

    it('defaults delay to 0', () => {
      const result = pulsingRing();
      expect(result.transition).toMatchObject({ delay: 0 });
    });
  });

  describe('containerWithStagger', () => {
    it('returns container variants', () => {
      const result = containerWithStagger();
      expect(result.container).toBeDefined();
      expect(result.container.hidden).toEqual({ opacity: 0 });
      expect(result.container.visible).toBeDefined();
    });

    it('returns item variants', () => {
      const result = containerWithStagger();
      expect(result.item).toBeDefined();
      expect(result.item.hidden).toEqual({ opacity: 0, y: 30 });
      expect(result.item.visible).toEqual({ opacity: 1, y: 0 });
    });

    it('applies custom stagger delay', () => {
      const result = containerWithStagger(0.3);
      expect(result.container.visible.transition).toMatchObject({
        staggerChildren: 0.3,
      });
    });

    it('applies custom delay children', () => {
      const result = containerWithStagger(0.2, 0.5);
      expect(result.container.visible.transition).toMatchObject({
        delayChildren: 0.5,
      });
    });

    it('defaults stagger delay to 0.2', () => {
      const result = containerWithStagger();
      expect(result.container.visible.transition).toMatchObject({
        staggerChildren: 0.2,
      });
    });

    it('defaults delay children to 0.3', () => {
      const result = containerWithStagger();
      expect(result.container.visible.transition).toMatchObject({
        delayChildren: 0.3,
      });
    });
  });

  describe('rotatingBorder', () => {
    it('returns animate with rotate array', () => {
      const result = rotatingBorder();
      expect(result.animate).toEqual({ rotate: [0, 360] });
    });

    it('applies custom duration', () => {
      const result = rotatingBorder(20);
      expect(result.transition).toMatchObject({ duration: 20 });
    });

    it('defaults duration to 12', () => {
      const result = rotatingBorder();
      expect(result.transition).toMatchObject({ duration: 12 });
    });

    it('sets repeat to infinity', () => {
      const result = rotatingBorder();
      expect(result.transition).toMatchObject({ repeat: Infinity });
    });

    it('sets ease to linear', () => {
      const result = rotatingBorder();
      expect(result.transition).toMatchObject({ ease: 'linear' });
    });
  });
});
