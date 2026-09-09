import { Elysia, t } from 'elysia';
import type { Auth } from '#lib/auth/better-auth.ts';
import { AppError } from '#models/gateway.ts';
import type { DashboardService } from '#services/dashboard.ts';
import type { DeveloperService } from '#services/developers.ts';
import type { ProviderService } from '#services/providers.ts';

const clientParams = t.Object({ clientId: t.String({ minLength: 1, maxLength: 200 }) });
export function dashboardRoutes({
  auth,
  dashboard,
  developers,
  providers,
  origin,
}: {
  auth: Auth;
  dashboard: DashboardService;
  developers: DeveloperService;
  providers: ProviderService;
  origin: string;
}) {
  return new Elysia({ prefix: '/api' })
    .resolve(async ({ request }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) throw new AppError(401, 'unauthorized', 'Sign in with your passkey.');
      if (
        !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
        request.headers.get('origin') !== origin
      )
        throw new AppError(403, 'invalid_origin', 'Use the Utilint dashboard to make this change.');
      return { ownerId: session.user.id, sessionId: session.session.id };
    })
    .get('/dashboard', ({ ownerId }) => dashboard.overview(ownerId))
    .delete('/provider', ({ ownerId }) => providers.disconnect(ownerId))
    .post('/provider/chatgpt', ({ ownerId, sessionId }) => providers.begin({ ownerId, sessionId }))
    .post(
      '/provider/chatgpt/:loginId',
      ({ ownerId, sessionId, params }) => providers.poll({ ownerId, sessionId }, params.loginId),
      {
        params: t.Object({
          loginId: t.String({ minLength: 43, maxLength: 43, pattern: '^[A-Za-z0-9_-]+$' }),
        }),
      },
    )
    .delete(
      '/provider/chatgpt/:loginId',
      ({ ownerId, sessionId, params }) =>
        providers.cancelLogin({ ownerId, sessionId }, params.loginId),
      {
        params: t.Object({
          loginId: t.String({ minLength: 43, maxLength: 43, pattern: '^[A-Za-z0-9_-]+$' }),
        }),
      },
    )
    .delete(
      '/connections/:clientId',
      ({ ownerId, params }) => dashboard.revoke({ ownerId, clientId: params.clientId }),
      { params: clientParams },
    )
    .get('/developer/apps', ({ request }) => developers.list(request.headers))
    .post(
      '/developer/apps',
      ({ request, body }) =>
        developers.register({
          headers: request.headers,
          name: body.name,
          redirectUris: body.redirectUris,
        }),
      {
        body: t.Object({
          name: t.String({ minLength: 1, maxLength: 80 }),
          redirectUris: t.Array(t.String({ format: 'uri', maxLength: 2000 }), {
            minItems: 1,
            maxItems: 10,
          }),
        }),
      },
    )
    .post(
      '/developer/apps/:clientId/rotate',
      ({ request, params }) =>
        developers.rotate({ headers: request.headers, clientId: params.clientId }),
      { params: clientParams },
    )
    .delete(
      '/developer/apps/:clientId',
      ({ request, params }) =>
        developers.remove({ headers: request.headers, clientId: params.clientId }),
      { params: clientParams },
    )
    .get(
      '/authorization/:clientId',
      ({ request, params }) =>
        developers.publicClient({ headers: request.headers, clientId: params.clientId }),
      { params: clientParams },
    );
}
