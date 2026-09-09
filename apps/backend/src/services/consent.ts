import type { Auth } from '#lib/auth/better-auth.ts';
import { AppError } from '#models/gateway.ts';
import type { ProviderService } from './providers.ts';

export function createConsentService(auth: Auth, providers: ProviderService) {
  return {
    async context(headers: Headers, oauthQuery: string) {
      const query = new URLSearchParams(oauthQuery);
      const clientId = query.get('client_id');
      if (!clientId || query.getAll('client_id').length !== 1)
        throw new AppError(400, 'invalid_request', 'Restart connection from the app.');
      // The provider verifies the signature and expiry before any request data is displayed.
      const client = await auth.api.getOAuthClientPublicPrelogin({
        headers,
        body: { client_id: clientId, oauth_query: oauthQuery },
      });
      const session = await auth.api.getSession({ headers });
      const scopes = (query.get('scope') ?? '').split(' ').filter(Boolean);
      const consents = session ? await auth.api.getOAuthConsents({ headers }) : [];
      const authorized = consents.some(
        (consent) =>
          consent.clientId === clientId &&
          scopes.every((scope) => consent.scopes.includes(scope)) &&
          query.getAll('resource').every((resource) => consent.resources?.includes(resource)),
      );
      return {
        name: client.client_name ?? 'App',
        clientId,
        scopes,
        signedIn: Boolean(session),
        provider: session ? await providers.overview(session.user.id) : null,
        authorized,
      };
    },
  };
}
