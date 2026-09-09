import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';
import { Notice } from '../components/ui/feedback';
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => <Outlet />,
  errorComponent: ({ error, reset }) => (
    <main className="standalone">
      <h1>Something needs attention</h1>
      <Notice error>{error.message}</Notice>
      <button type="button" className="button primary" onClick={reset}>
        Try again
      </button>
      <Link to="/dashboard">Back to overview</Link>
    </main>
  ),
  notFoundComponent: () => (
    <main className="standalone">
      <h1>Page not found</h1>
      <Link to="/">Return to utilint</Link>
    </main>
  ),
});
