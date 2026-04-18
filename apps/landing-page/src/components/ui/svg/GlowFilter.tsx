interface GlowFilterProps {
  id?: string;
  stdDeviation?: number;
}

/**
 * SVG glow filter effect
 * Creates a soft blur around SVG elements
 * @param id - Filter ID for referencing in SVG elements
 * @param stdDeviation - Blur intensity (default: 3)
 */
export function GlowFilter({ id = 'glow', stdDeviation = 3 }: GlowFilterProps) {
  return (
    <filter id={id}>
      <feGaussianBlur stdDeviation={stdDeviation} result="coloredBlur" />
      <feMerge>
        <feMergeNode in="coloredBlur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}
