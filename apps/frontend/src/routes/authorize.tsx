import { useMutation } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { AuthLayout } from '../components/layout/public-layout';
import { Button, Notice } from '../components/ui';
import { publicClientOptions, sessionOptions } from '../queries/dashboard';
import { authorizeApp } from '../queries/mutations';
export const Route = createFileRoute('/authorize')({
  validateSearch: (s: Record<string, unknown>) => ({
    client_id: typeof s.client_id === 'string' ? s.client_id : '',
    scope: typeof s.scope === 'string' ? s.scope : '',
    claims: typeof s.claims === 'string' ? s.claims : undefined,
  }),
  beforeLoad: async ({ context, location, search }) => {
    if (!(await context.queryClient.fetchQuery(sessionOptions)))
      throw redirect({ to: '/login', search: { redirect: location.href } });
    if (!search.client_id) throw new Error('Restart authorization from the app.');
  },
  loaderDeps: ({ search }) => ({ clientId: search.client_id }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(publicClientOptions(deps.clientId)),
  component: Authorize,
});
function Authorize() {
  const client = Route.useLoaderData();
  const search = Route.useSearch();
  const consent = useMutation({
    mutationFn: (accept: boolean) =>
      authorizeApp({ accept, scope: search.scope, claims: search.claims }),
    onSuccess: (url) => window.location.assign(url),
  });
  return (
    <AuthLayout>
      <h1>Connect {client.client_name ?? 'this app'}?</h1>
      <p>
        This app can use your ChatGPT subscription through Utilint. Your ChatGPT credentials stay in
        Utilint.
      </p>
      <ul className="permission-list">
        {search.scope.split(' ').includes('profile') && <li>Identify your Utilint account.</li>}
        {search.scope.split(' ').includes('ai:invoke') && (
          <li>Send model requests using your subscription.</li>
        )}
        {search.scope.split(' ').includes('offline_access') && (
          <li>Stay connected until you revoke access.</li>
        )}
      </ul>
      {consent.error && <Notice error>{consent.error.message}</Notice>}
      <div className="actions">
        <Button
          variant="outline"
          disabled={consent.isPending}
          onClick={() => consent.mutate(false)}
        >
          Cancel
        </Button>
        <Button pending={consent.isPending} onClick={() => consent.mutate(true)}>
          Allow connection
        </Button>
      </div>
    </AuthLayout>
  );
}
