export interface DeveloperRepository {
  registrationStatus(clientId: string): Promise<'active' | 'missing' | 'disabled'>;
  publicCallback(clientId: string): Promise<string | null>;
}
