import { cn } from '../utils';

describe('cn (className utility)', () => {
  it('should merge class names', () => {
    expect(cn('class1', 'class2')).toBe('class1 class2');
  });

  it('should handle conditional classes', () => {
    expect(cn('base', false && 'hidden', true && 'visible')).toBe('base visible');
  });

  it('should merge Tailwind conflicting classes', () => {
    // tailwind-merge deduplicates conflicting utilities
    expect(cn('px-2 px-4')).toBe('px-4');
    expect(cn('text-red-500 text-blue-500')).toBe('text-blue-500');
  });

  it('should handle arrays and objects', () => {
    expect(cn(['class1', 'class2'])).toBe('class1 class2');
    expect(cn({ active: true, disabled: false })).toBe('active');
  });

  it('should handle undefined and null values', () => {
    expect(cn('base', undefined, null, 'end')).toBe('base end');
  });
});
