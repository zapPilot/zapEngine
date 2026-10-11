import type { FC } from 'react';

/**
 * Thickness for a flat 3D object: `count` copies of its rounded outline
 * stacked `depth` px behind it, shaded from `colors[0]` (back) to the last.
 */
export const Slices: FC<{
  readonly count: number;
  readonly depth: number;
  readonly radius: number;
  readonly colors: readonly string[];
}> = ({ count, depth, radius, colors }) => (
  <>
    {Array.from({ length: count }, (_, i) => (
      <div
        key={i}
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radius,
          background:
            colors[
              Math.min(
                colors.length - 1,
                Math.floor((i / count) * colors.length),
              )
            ],
          transform: `translateZ(${-depth + (i * depth) / count}px)`,
        }}
      />
    ))}
  </>
);
