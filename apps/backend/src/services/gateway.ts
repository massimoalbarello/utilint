import { type Actor, AppError } from '#models/gateway.ts';
import type { RelayInput } from '#models/provider.ts';
import { prepareRequest } from '#models/request.ts';
import type { ConnectionRepository } from '#repositories/connections.ts';
import type { ProviderService } from './providers.ts';

export function createGatewayService(repository: ConnectionRepository, providers: ProviderService) {
  async function connection(actor: Actor) {
    if (!(await repository.authorized(actor)))
      throw new AppError(403, 'app_not_authorized', 'Authorize this app in Utilint.');
    const provider = await providers.connection(actor.ownerId);
    // A revoke/disconnect may complete while the provider refreshes its token.
    if (!(await repository.authorized(actor)) || !(await repository.credential(actor.ownerId)))
      throw new AppError(403, 'connection_revoked', 'The connection was revoked.');
    return provider;
  }
  return {
    async models(actor: Actor) {
      return { object: 'list', data: await (await connection(actor)).models() };
    },
    async relay({
      actor,
      endpoint,
      body,
      signal,
    }: {
      actor: Actor;
      endpoint: RelayInput['endpoint'];
      body: unknown;
      signal: AbortSignal;
    }) {
      const parsed = prepareRequest(endpoint, body);
      const provider = await connection(actor);
      provider.validate(parsed);
      try {
        const response = await provider.relay({
          endpoint,
          body: parsed,
          signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new AppError(
            response.status,
            'provider_error',
            'ChatGPT could not complete this request. Retry or reconnect ChatGPT.',
          );
        }
        return new Response(response.body, {
          headers: {
            'content-type': response.headers.get('content-type') ?? 'application/json',
            'cache-control': 'no-store',
          },
        });
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(502, 'provider_error', 'ChatGPT could not complete this request.');
      }
    },
  };
}
export type GatewayService = ReturnType<typeof createGatewayService>;
