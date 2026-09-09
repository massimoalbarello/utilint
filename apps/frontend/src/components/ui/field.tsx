import type { ReactNode } from 'react';
export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="field">
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
      {children}
      {hint && <small id={htmlFor ? `${htmlFor}-hint` : undefined}>{hint}</small>}
    </div>
  );
}
