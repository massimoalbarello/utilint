import type { ReactNode } from 'react';
import { Card, CardContent } from './ui/card';
export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <div className="panel-heading">
        <h2>{title}</h2>
      </div>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
