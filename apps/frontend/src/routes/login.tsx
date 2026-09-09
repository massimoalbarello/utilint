import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Fingerprint } from 'lucide-react';
import { AuthLayout } from '../components/layout/public-layout';
import { Button, Notice } from '../components/ui';
import { authClient } from '../lib/auth';
export const Route = createFileRoute('/login')({
  validateSearch: (
    s: Record<string, unknown>,
  ): { signup?: boolean; redirect?: string; oauth_query?: string } => ({
    signup: s.signup === true || s.signup === 'true',
    redirect: typeof s.redirect === 'string' ? s.redirect : undefined,
    oauth_query: typeof s.oauth_query === 'string' ? s.oauth_query : undefined,
  }),
  component: Login,
});
function Login() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toggle = new URLSearchParams(window.location.search);
  toggle.set('signup', String(!search.signup));
  const mutation = useMutation({
    mutationFn: async (signup: boolean) => {
      const result = signup
        ? await authClient.passkey.addPasskey({ createSession: true, name: 'Primary passkey' })
        : await authClient.signIn.passkey();
      if (result.error)
        throw new Error(result.error.message ?? 'Passkey authentication was not completed.');
      qc.clear();
      const redirectData = result.data as { url?: string; redirect?: boolean } | null;
      if (redirectData?.url) {
        window.location.assign(redirectData.url);
        return;
      }
      const target =
        search.redirect?.startsWith('/') &&
        !search.redirect.startsWith('//') &&
        !search.redirect.includes('\\')
          ? search.redirect
          : '/dashboard';
      await navigate({ to: target });
    },
  });
  return (
    <AuthLayout>
      <h1>{search.signup ? 'Create an account' : 'Sign in'}</h1>
      <p>Use a passkey on your device.</p>
      {mutation.error && <Notice error>{mutation.error.message}</Notice>}
      <Button pending={mutation.isPending} onClick={() => mutation.mutate(Boolean(search.signup))}>
        <Fingerprint size={18} />
        {search.signup ? 'Create account with a passkey' : 'Sign in with a passkey'}
      </Button>
      <div className="auth-switch">
        {search.signup ? 'Already registered?' : 'New to Utilint?'}{' '}
        <a href={`/login?${toggle.toString()}`}>
          {search.signup ? 'Sign in' : 'Create an account'}
        </a>
      </div>
    </AuthLayout>
  );
}
