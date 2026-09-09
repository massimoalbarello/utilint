import type { ReactNode } from 'react';
export function Empty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </div>
  );
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div className="notice" data-error={error || undefined} role={error ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
