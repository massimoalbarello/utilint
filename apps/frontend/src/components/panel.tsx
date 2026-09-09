import type { ReactNode } from 'react';
import { Card, CardContent } from './ui/card';
export function Panel({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={['panel', className].join(' ')}>
      {(title || action) && (
        <div className="panel-heading">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      <CardContent>{children}</CardContent>
    </Card>
  );
}
