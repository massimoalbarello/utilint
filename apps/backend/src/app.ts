import { APIError } from 'better-auth/api';
import { Elysia } from 'elysia';
import type { AssetFiles } from '#lib/assets.ts';
import type { Auth } from '#lib/auth/better-auth.ts';
import { AppError } from '#models/gateway.ts';
import { dashboardRoutes } from '#routes/dashboard.ts';
import { gatewayRoutes } from '#routes/gateway.ts';
import type { DashboardService } from '#services/dashboard.ts';
import type { DeveloperService } from '#services/developers.ts';
import type { GatewayService } from '#services/gateway.ts';
import type { ProviderService } from '#services/providers.ts';
export function createApp({
  auth,
  dashboard,
  developers,
  gateway,
  providers,
  assets,
  origin,
}: {
  auth: Auth;
  dashboard: DashboardService;
  developers: DeveloperService;
  gateway: GatewayService;
  providers: ProviderService;
  assets: AssetFiles;
  origin: string;
}) {
  return new Elysia({ serve: { maxRequestBodySize: 262144, idleTimeout: 180 } })
    .onError(({ error, code }) => {
      const status =
        error instanceof AppError
          ? error.status
          : error instanceof APIError
            ? error.statusCode
            : code === 'VALIDATION' || code === 'PARSE'
              ? 400
              : code === 'NOT_FOUND'
                ? 404
                : 500;
      const message =
        error instanceof AppError
          ? error.message
          : error instanceof APIError
            ? (error.body?.message ??
              error.body?.error_description ??
              'Authorization could not be completed.')
            : status === 400
              ? 'Invalid request. Check the required fields and supported values.'
              : status === 404
                ? 'Endpoint not found.'
                : 'The request could not be completed.';
      return Response.json(
        {
          error: {
            message,
            type:
              status === 401
                ? 'authentication_error'
                : status === 429
                  ? 'rate_limit_error'
                  : 'invalid_request_error',
            code: error instanceof AppError ? error.code : String(code).toLowerCase(),
          },
        },
        {
          status,
          headers: {
            'cache-control': 'no-store',
            ...(status === 401 ? { 'www-authenticate': 'Bearer realm="utilint"' } : {}),
          },
        },
      );
    })
    .onRequest(({ set }) => {
      set.headers['x-content-type-options'] = 'nosniff';
      set.headers['referrer-policy'] = 'no-referrer';
      set.headers['x-frame-options'] = 'DENY';
      set.headers['cache-control'] = 'no-store';
      set.headers['content-security-policy'] =
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
    })
    .get('/api/health', () => ({
      status: 'ok',
      service: 'utilint',
      provider: 'openai',
      authentication: ['chatgpt-subscription'],
      version: '0.1.0',
    }))
    .get('/api/auth/*', ({ request }) => auth.handler(request))
    .post('/api/auth/*', ({ request }) => auth.handler(request), { parse: 'none' })
    .patch('/api/auth/*', ({ request }) => auth.handler(request), { parse: 'none' })
    .delete('/api/auth/*', ({ request }) => auth.handler(request), { parse: 'none' })
    .get('/.well-known/*', ({ request }) => auth.handler(request))
    .use(dashboardRoutes({ auth, dashboard, developers, providers, origin }))
    .use(gatewayRoutes({ auth, gateway }))
    .get('/*', ({ path }) => {
      if (path.startsWith('/api/') || path.startsWith('/v1/'))
        throw new AppError(404, 'not_found', 'Endpoint not found.');
      const asset = assets.get(path.slice(1));
      if (asset)
        return new Response(asset, {
          headers: {
            'cache-control': path.startsWith('/assets/')
              ? 'public,max-age=31536000,immutable'
              : 'no-cache',
          },
        });
      const index = assets.get('index.html');
      return index
        ? new Response(index, { headers: { 'content-type': 'text/html; charset=utf-8' } })
        : new Response('Utilint frontend is running in Vite.', { status: 200 });
    });
}
