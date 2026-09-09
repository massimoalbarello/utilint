import type { SQL } from 'bun';
import type { DeveloperRepository } from './developers.ts';

export function createDeveloperRepository(db: SQL): DeveloperRepository {
  return {
    async publicCallback(clientId) {
      const [value] = await db`SELECT json_extract(redirectUris, '$[0]') AS url
        FROM auth_oauthClient WHERE clientId=${clientId} AND COALESCE(disabled,0)=0`;
      return value?.url ?? null;
    },
  };
}
