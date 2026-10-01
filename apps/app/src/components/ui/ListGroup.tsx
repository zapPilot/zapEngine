import type { ReactNode, ReactElement } from 'react';
import { Card } from './Card';
export function ListGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <Card padding="sm" {...(className ? { className } : {})}>
      {children}
    </Card>
  );
}
