import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Brand } from '../identity';
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-layout">
      <Link to="/" className="auth-brand">
        <Brand />
      </Link>
      <section className="auth-content">{children}</section>
    </main>
  );
}
