import { api, unwrap } from '../lib/api';
import { authClient } from '../lib/auth';
export const disconnectProvider = () => unwrap(api.api.provider.delete());
export const revokeApp = (clientId: string) => unwrap(api.api.connections({ clientId }).delete());
export async function authorizeApp(input: { accept: boolean; scope: string; claims?: string }) {
  const result = await authClient.oauth2.consent(input);
  if (result.error) throw new Error(result.error.message ?? 'Could not authorize this app.');
  if (!result.data?.url) throw new Error('Restart authorization from the app.');
  return result.data.url;
}
