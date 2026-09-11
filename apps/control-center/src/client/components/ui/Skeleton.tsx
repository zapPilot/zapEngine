import './skeleton.css';

export function SkeletonBlock(props: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={['cc-skeleton-block', props.className]
        .filter(Boolean)
        .join(' ')}
    />
  );
}

export function SkeletonRows(props: { rows?: number }) {
  const rows = props.rows ?? 3;
  return (
    <div aria-hidden="true" className="cc-skeleton-rows">
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonBlock
          className={index % 3 === 2 ? 'cc-skeleton-short' : undefined}
          key={index}
        />
      ))}
    </div>
  );
}
