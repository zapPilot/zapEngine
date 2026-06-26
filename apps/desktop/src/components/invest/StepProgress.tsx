interface StepProgressProps {
  current: number;
  total?: number;
}

/** Three-segment progress indicator for the invest flow. */
export function StepProgress({ current, total = 3 }: StepProgressProps) {
  return (
    <div className="flex gap-[5px] px-5 pt-[14px]">
      {Array.from({ length: total }, (_, index) => (
        <div
          key={index}
          className="h-[3px] flex-1 rounded-full"
          style={{
            background:
              index < current ? 'var(--accent)' : 'rgba(255,255,255,.1)',
          }}
        />
      ))}
    </div>
  );
}
