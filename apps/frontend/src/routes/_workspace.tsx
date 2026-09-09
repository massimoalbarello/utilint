import { createFileRoute, redirect } from '@tanstack/react-router';
import { Shell } from '../components/shell';
import { sessionOptions } from '../queries/dashboard';
export const Route = createFileRoute('/_workspace')({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.fetchQuery(sessionOptions);
    if (!session) throw redirect({ to: '/login', search: { redirect: location.href } });
    return { session };
  },
  component: Shell,
});
