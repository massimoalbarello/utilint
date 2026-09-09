import { Elysia } from 'elysia';
import type { Auth } from '#lib/auth/better-auth.ts';
import { AppError } from '#models/gateway.ts';
import type { GatewayService } from '#services/gateway.ts';
export function gatewayRoutes({ auth, gateway }: { auth: Auth; gateway: GatewayService }) {
  return new Elysia({ prefix: '/v1' })
    .resolve(async ({ request }) => {
      const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '');
      if (!match?.[1])
        throw new AppError(401, 'invalid_token', 'A utilint OAuth access token is required.');
      try {
        return { actor: await auth.api.verifyGatewayToken({ body: { token: match[1] } }) };
      } catch {
        throw new AppError(
          401,
          'invalid_token',
          'The access token is invalid, expired, revoked, or not intended for this gateway.',
        );
      }
    })
    .get('/models', ({ actor }) => gateway.models(actor))
    .get('/me', ({ actor }) => ({ id: actor.ownerId, client_id: actor.clientId }))
    .post('/chat/completions', ({ actor, body, request }) =>
      gateway.relay({ actor, endpoint: 'chat/completions', body, signal: request.signal }),
    )
    .post('/responses', ({ actor, body, request }) =>
      gateway.relay({ actor, endpoint: 'responses', body, signal: request.signal }),
    );
}
