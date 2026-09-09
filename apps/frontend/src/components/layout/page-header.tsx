import type { ReactNode } from 'react';
export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
      </div>
      {action}
    </header>
  );
}
