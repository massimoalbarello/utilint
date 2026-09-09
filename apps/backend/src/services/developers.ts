import type { Auth } from '#lib/auth/better-auth.ts';
import { AppError } from '#models/gateway.ts';
import type { DeveloperRepository } from '#repositories/developers.ts';

function validateStart(value: string, callbacks: string[]) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    !(
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    ) ||
    !callbacks.some((callback) => new URL(callback).origin === url.origin)
  ) {
    throw new AppError(
      400,
      'invalid_start_url',
      'Use an HTTPS start URL on the same origin as a redirect URL (or HTTP localhost).',
    );
  }
}
export function createDeveloperService(auth: Auth, repository: DeveloperRepository) {
  return {
    async list(headers: Headers, ownerId: string) {
      const apps = await auth.api.getOAuthClients({ headers });
      const starts = new Map(
        (await repository.listStarts(ownerId)).map((item) => [item.clientId, item.url]),
      );
      return (apps ?? []).map((app) => ({ ...app, startUrl: starts.get(app.client_id) ?? null }));
    },
    async startUrl(clientId: string) {
      const url = await repository.publicStart(clientId);
      if (!url)
        throw new AppError(404, 'not_found', 'This app has not configured its connection URL.');
      return url;
    },
    async updateStart({
      headers,
      ownerId,
      clientId,
      startUrl,
    }: {
      headers: Headers;
      ownerId: string;
      clientId: string;
      startUrl: string;
    }) {
      const app = (await auth.api.getOAuthClients({ headers }))?.find(
        (app) => app.client_id === clientId,
      );
      if (!app) throw new AppError(404, 'not_found', 'App not found.');
      validateStart(startUrl, app.redirect_uris);
      if (!(await repository.saveStart(ownerId, clientId, startUrl)))
        throw new AppError(404, 'not_found', 'App not found.');
      return { saved: true };
    },
    async register({
      headers,
      ownerId,
      name,
      redirectUris,
      startUrl,
    }: {
      headers: Headers;
      ownerId: string;
      name: string;
      redirectUris: string[];
      startUrl?: string;
    }) {
      if (startUrl) validateStart(startUrl, redirectUris);
      const client = await auth.api.createOAuthClient({
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
      if (startUrl) await repository.saveStart(ownerId, client.client_id, startUrl);
      return client;
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
