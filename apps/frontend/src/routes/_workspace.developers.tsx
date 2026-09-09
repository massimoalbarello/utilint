import { createFileRoute, redirect } from '@tanstack/react-router';

// Existing bookmarks return to the user dashboard.
export const Route = createFileRoute('/_workspace/developers')({
  beforeLoad: () => {
    throw redirect({ to: '/dashboard', replace: true });
  },
});
