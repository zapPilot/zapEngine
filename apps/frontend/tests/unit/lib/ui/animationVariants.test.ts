import { describe, expect, it } from 'vitest';

import {
  dropdownMenu,
  fadeInOut,
  fadeInUp,
  SMOOTH_TRANSITION,
} from '@/lib/ui/animationVariants';

describe('animationVariants', () => {
  describe('SMOOTH_TRANSITION', () => {
    it('should have correct duration', () => {
      expect(SMOOTH_TRANSITION.duration).toBe(0.4);
    });

    it('should have correct ease values', () => {
      expect(SMOOTH_TRANSITION.ease).toEqual([0.4, 0, 0.2, 1]);
    });
  });

  describe('fadeInUp', () => {
    it('should have initial state with opacity 0 and y offset 20', () => {
      expect(fadeInUp.initial).toEqual({ opacity: 0, y: 20 });
    });

    it('should have animate state with opacity 1 and y 0', () => {
      expect(fadeInUp.animate).toEqual({ opacity: 1, y: 0 });
    });

    it('should have exit state with opacity 0 and y 20', () => {
      expect(fadeInUp.exit).toEqual({ opacity: 0, y: 20 });
    });

    it('should have all three states defined', () => {
      expect(fadeInUp.initial).toBeDefined();
      expect(fadeInUp.animate).toBeDefined();
      expect(fadeInUp.exit).toBeDefined();
    });
  });

  describe('fadeInOut', () => {
    it('should have initial state with opacity 0', () => {
      expect(fadeInOut.initial).toEqual({ opacity: 0 });
    });

    it('should have animate state with opacity 1', () => {
      expect(fadeInOut.animate).toEqual({ opacity: 1 });
    });

    it('should have exit state with opacity 0', () => {
      expect(fadeInOut.exit).toEqual({ opacity: 0 });
    });

    it('should have all three states defined', () => {
      expect(fadeInOut.initial).toBeDefined();
      expect(fadeInOut.animate).toBeDefined();
      expect(fadeInOut.exit).toBeDefined();
    });
  });

  describe('dropdownMenu', () => {
    it('should have initial state with opacity 0, y -10, scale 0.95', () => {
      expect(dropdownMenu.initial).toEqual({
        opacity: 0,
        y: -10,
        scale: 0.95,
      });
    });

    it('should have animate state with opacity 1, y 0, scale 1', () => {
      expect(dropdownMenu.animate).toEqual({
        opacity: 1,
        y: 0,
        scale: 1,
      });
    });

    it('should have exit state with opacity 0, y -10, scale 0.95', () => {
      expect(dropdownMenu.exit).toEqual({
        opacity: 0,
        y: -10,
        scale: 0.95,
      });
    });

    it('should have all three states defined', () => {
      expect(dropdownMenu.initial).toBeDefined();
      expect(dropdownMenu.animate).toBeDefined();
      expect(dropdownMenu.exit).toBeDefined();
    });

    it('should have scale animation for dropdown effect', () => {
      expect(dropdownMenu.initial.scale).toBe(0.95);
      expect(dropdownMenu.animate.scale).toBe(1);
      expect(dropdownMenu.exit.scale).toBe(0.95);
    });
  });

  describe('variant structure', () => {
    it('all variants should have initial, animate, and exit states', () => {
      const variants = [fadeInUp, fadeInOut, dropdownMenu];
      for (const variant of variants) {
        expect(variant).toHaveProperty('initial');
        expect(variant).toHaveProperty('animate');
        expect(variant).toHaveProperty('exit');
      }
    });

    it('all variants should return Variants type from framer-motion', () => {
      expect(fadeInUp).toBeDefined();
      expect(fadeInOut).toBeDefined();
      expect(dropdownMenu).toBeDefined();
    });
  });
});
