import type { SQL } from 'bun';
import type { DeveloperRepository } from './developers.ts';

export function createDeveloperRepository(db: SQL): DeveloperRepository {
  return {
    async listStarts(ownerId) {
      return db`SELECT s.clientId, s.url FROM developer_connection_start s
        JOIN auth_oauthClient c ON c.clientId=s.clientId WHERE c.userId=${ownerId}`;
    },
    async publicStart(clientId) {
      const [value] = await db`SELECT s.url FROM developer_connection_start s
        JOIN auth_oauthClient c ON c.clientId=s.clientId
        WHERE c.clientId=${clientId} AND COALESCE(c.disabled,0)=0`;
      return value?.url ?? null;
    },
    async saveStart(ownerId, clientId, url) {
      const rows = await db`INSERT INTO developer_connection_start(clientId,url)
        SELECT clientId, ${url} FROM auth_oauthClient WHERE clientId=${clientId} AND userId=${ownerId}
        ON CONFLICT(clientId) DO UPDATE SET url=excluded.url RETURNING clientId`;
      return rows.length > 0;
    },
  };
}
