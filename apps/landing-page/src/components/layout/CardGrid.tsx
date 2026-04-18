interface CardGridProps {
  columns?: 1 | 2 | 3 | 4;
  children: React.ReactNode;
  className?: string;
}

export function CardGrid({ columns = 3, children, className = '' }: CardGridProps) {
  const colClasses = {
    1: 'grid-cols-1',
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
  };

  return (
    <div className={`grid grid-cols-1 ${colClasses[columns]} gap-8 ${className}`}>{children}</div>
  );
}
