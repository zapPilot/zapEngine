import type { CSSProperties, ReactNode } from 'react';
export function FixedStage({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: ReactNode;
}) {
  return (
    <div
      className="sk-stage-container"
      style={
        {
          '--sk-w': width,
          '--sk-h': height,
          aspectRatio: `${width} / ${height}`,
        } as CSSProperties
      }
    >
      <div className="sk-stage">{children}</div>
    </div>
  );
}
