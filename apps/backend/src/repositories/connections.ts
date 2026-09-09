import type { Actor, Connection, Credential } from '#models/gateway.ts';

export interface ConnectionRepository {
  firstCredential(): Promise<(Credential & { ownerId: string }) | null>;
  credential(ownerId: string): Promise<Credential | null>;
  saveCredential(ownerId: string, credential: Credential): Promise<void>;
  replaceCredential(ownerId: string, expected: string, encrypted: string): Promise<boolean>;
  deleteCredential(ownerId: string): Promise<void>;
  connections(ownerId: string): Promise<Connection[]>;
  authorized(actor: Actor): Promise<boolean>;
  revoke(actor: Actor): Promise<boolean>;
}
