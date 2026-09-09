export interface DeveloperRepository {
  listStarts(ownerId: string): Promise<{ clientId: string; url: string }[]>;
  publicStart(clientId: string): Promise<string | null>;
  saveStart(ownerId: string, clientId: string, url: string): Promise<boolean>;
}
