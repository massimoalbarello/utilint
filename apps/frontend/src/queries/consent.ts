import { queryOptions } from '@tanstack/react-query';
import { api, unwrap } from '../lib/api';
import { authClient } from '../lib/auth';
export const consentOptions = (oauthQuery: string) =>
  queryOptions({
    queryKey: ['consent', oauthQuery],
    queryFn: () => unwrap(api.api.connect.context.post({ oauthQuery })),
    retry: false,
  });
export async function signInForConsent(signup: boolean) {
  const result = signup
    ? await authClient.passkey.addPasskey({ createSession: true, name: 'Primary passkey' })
    : await authClient.signIn.passkey();
  if (result.error)
    throw new Error(result.error.message ?? 'Passkey authentication was not completed.');
  return (result.data as { url?: string } | null)?.url;
}
