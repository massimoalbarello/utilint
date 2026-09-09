import type { SQL } from 'bun';
import type { Connection, Credential } from '#models/gateway.ts';
import type { ConnectionRepository } from './connections.ts';

export function createConnectionRepository(db: SQL): ConnectionRepository {
  return {
    async firstCredential() {
      const [value] = await db<
        (Credential & { ownerId: string })[]
      >`SELECT ownerId, encrypted, connectedAt FROM provider_credential LIMIT 1`;
      return value ?? null;
    },
    async credential(ownerId) {
      const [value] = await db<
        Credential[]
      >`SELECT encrypted, connectedAt FROM provider_credential WHERE ownerId=${ownerId}`;
      return value ?? null;
    },
    async saveCredential(ownerId, value) {
      await db`INSERT INTO provider_credential(ownerId, encrypted, connectedAt) VALUES(${ownerId}, ${value.encrypted}, ${value.connectedAt})
        ON CONFLICT(ownerId) DO UPDATE SET encrypted=excluded.encrypted, connectedAt=excluded.connectedAt`;
    },
    async replaceCredential(ownerId, expected, encrypted) {
      return (
        (
          await db`UPDATE provider_credential SET encrypted=${encrypted} WHERE ownerId=${ownerId} AND encrypted=${expected} RETURNING ownerId`
        ).length > 0
      );
    },
    async deleteCredential(ownerId) {
      await db`DELETE FROM provider_credential WHERE ownerId=${ownerId}`;
    },
    async connections(ownerId) {
      return await db<Connection[]>`SELECT DISTINCT c.clientId, COALESCE(a.name, 'App') name
        FROM auth_oauthConsent c JOIN auth_oauthClient a ON a.clientId=c.clientId
        WHERE c.userId=${ownerId} AND COALESCE(a.disabled,0)=0 ORDER BY name,c.clientId`;
    },
    async authorized({ ownerId, clientId }) {
      return (
        (
          await db`SELECT 1 FROM auth_oauthConsent c JOIN auth_oauthClient a ON a.clientId=c.clientId
        WHERE c.userId=${ownerId} AND c.clientId=${clientId} AND COALESCE(a.disabled,0)=0
        AND EXISTS (SELECT 1 FROM json_each(c.scopes) WHERE value='ai:invoke') LIMIT 1`
        ).length > 0
      );
    },
    async revoke({ ownerId, clientId }) {
      return db.begin(async (tx) => {
        const deleted =
          await tx`DELETE FROM auth_oauthConsent WHERE userId=${ownerId} AND clientId=${clientId} RETURNING id`;
        if (!deleted.length) return false;
        await tx`DELETE FROM auth_oauthAccessToken WHERE userId=${ownerId} AND clientId=${clientId}`;
        await tx`DELETE FROM auth_oauthRefreshToken WHERE userId=${ownerId} AND clientId=${clientId}`;
        // Better Auth stores unexchanged OAuth codes alongside other verification records.
        await tx`DELETE FROM auth_verification WHERE CASE WHEN json_valid(value) THEN
          json_extract(value, '$.type')='authorization_code'
          AND json_extract(value, '$.userId')=${ownerId}
          AND json_extract(value, '$.query.client_id')=${clientId}
          ELSE 0 END`;
        return true;
      });
    },
  };
}
