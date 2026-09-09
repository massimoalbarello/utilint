export interface DeveloperRepository {
  publicCallback(clientId: string): Promise<string | null>;
}
