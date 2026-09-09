import { Elysia, t } from 'elysia';
import type { Auth } from '#lib/auth/better-auth.ts';
import { AppError } from '#models/gateway.ts';
import { createConsentService } from '#services/consent.ts';
import type { DeveloperService } from '#services/developers.ts';
import type { ProviderService } from '#services/providers.ts';

export function connectRoutes({
  auth,
  providers,
  developers,
  origin,
}: {
  auth: Auth;
  providers: ProviderService;
  developers: DeveloperService;
  origin: string;
}) {
  const consent = createConsentService(auth, providers);
  return new Elysia()
    .get(
      '/connect/:clientId/test',
      async ({ request, params, redirect }) => {
        if (!(await auth.api.getSession({ headers: request.headers }))) {
          const target = `/connect/${encodeURIComponent(params.clientId)}/test`;
          return redirect(`/login?redirect=${encodeURIComponent(target)}`);
        }
        return redirect(
          await developers.testUrl({ headers: request.headers, clientId: params.clientId, origin }),
        );
      },
      { params: t.Object({ clientId: t.String({ minLength: 1, maxLength: 200 }) }) },
    )
    .get(
      '/connect/:clientId',
      ({ params, query, redirect }) => {
        const target = new URL('/api/auth/oauth2/authorize', origin);
        target.search = new URLSearchParams({
          client_id: params.clientId,
          response_type: 'code',
          scope: 'profile ai:invoke offline_access',
          resource: `${origin}/v1`,
          prompt: 'consent',
          code_challenge_method: 'S256',
          redirect_uri: query.redirect_uri,
          state: query.state,
          code_challenge: query.code_challenge,
        }).toString();
        return redirect(target.href, 302);
      },
      {
        params: t.Object({ clientId: t.String({ minLength: 1, maxLength: 200 }) }),
        query: t.Object(
          {
            redirect_uri: t.String({ format: 'uri', maxLength: 2000 }),
            state: t.String({ minLength: 32, maxLength: 256, pattern: '^[A-Za-z0-9_-]+$' }),
            code_challenge: t.String({ minLength: 43, maxLength: 43, pattern: '^[A-Za-z0-9_-]+$' }),
          },
          { additionalProperties: false },
        ),
      },
    )
    .post(
      '/api/connect/context',
      ({ request, body }) => {
        if (request.headers.get('origin') !== origin)
          throw new AppError(403, 'invalid_origin', 'Open this connection in utilint.');
        return consent.context(request.headers, body.oauthQuery);
      },
      { body: t.Object({ oauthQuery: t.String({ minLength: 1, maxLength: 12000 }) }) },
    );
}
