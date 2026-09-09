import type { Auth } from '#lib/auth/better-auth.ts';
import { AppError } from '#models/gateway.ts';
import type { DeveloperRepository } from '#repositories/developers.ts';

export function createDeveloperService(auth: Auth, repository: DeveloperRepository) {
  return {
    async registrationStatus(clientId: string) {
      return { clientId, status: await repository.registrationStatus(clientId) };
    },
    list(headers: Headers) {
      return auth.api.getOAuthClients({ headers });
    },
    async connectionUrl(clientId: string) {
      const callback = await repository.publicCallback(clientId);
      if (!callback) throw new AppError(404, 'not_found', 'App not found.');
      const url = new URL(callback);
      if (
        url.username ||
        url.password ||
        url.hash ||
        !(
          url.protocol === 'https:' ||
          (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
        )
      )
        throw new AppError(400, 'invalid_callback', 'This app needs a valid HTTPS callback URL.');
      url.searchParams.set('utilint_connect', '1');
      return url.href;
    },
    async register({
      headers,
      name,
      redirectUris,
    }: {
      headers: Headers;
      name: string;
      redirectUris: string[];
    }) {
      if (redirectUris.some((uri) => new URL(uri).searchParams.has('utilint_connect')))
        throw new AppError(
          400,
          'invalid_callback',
          'The utilint_connect query parameter is reserved.',
        );
      return auth.api.createOAuthClient({
        headers,
        body: {
          client_name: name,
          redirect_uris: redirectUris,
          application_type: redirectUris.some((uri) =>
            ['localhost', '127.0.0.1', '[::1]'].includes(new URL(uri).hostname),
          )
            ? 'native'
            : 'web',
          token_endpoint_auth_method: 'client_secret_basic',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          scope: 'profile ai:invoke offline_access',
        },
      });
    },
    rotate({ headers, clientId }: { headers: Headers; clientId: string }) {
      return auth.api.rotateClientSecret({ headers, body: { client_id: clientId } });
    },
    remove({ headers, clientId }: { headers: Headers; clientId: string }) {
      return auth.api.deleteOAuthClient({ headers, body: { client_id: clientId } });
    },
    publicClient({ headers, clientId }: { headers: Headers; clientId: string }) {
      return auth.api.getOAuthClientPublic({ headers, query: { client_id: clientId } });
    },
  };
}
export type DeveloperService = ReturnType<typeof createDeveloperService>;
