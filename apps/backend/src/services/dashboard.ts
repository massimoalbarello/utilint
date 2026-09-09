import { type Actor, AppError } from '#models/gateway.ts';
import type { ConnectionRepository } from '#repositories/connections.ts';
import type { ProviderService } from './providers.ts';

export function createDashboardService(
  repository: ConnectionRepository,
  providers: ProviderService,
) {
  return {
    async overview(ownerId: string) {
      const [provider, connections] = await Promise.all([
        providers.overview(ownerId),
        repository.connections(ownerId),
      ]);
      return { provider, connections };
    },
    async revoke(actor: Actor) {
      if (!(await repository.revoke(actor)))
        throw new AppError(404, 'not_found', 'Connection not found.');
      return { revoked: true };
    },
  };
}
export type DashboardService = ReturnType<typeof createDashboardService>;
