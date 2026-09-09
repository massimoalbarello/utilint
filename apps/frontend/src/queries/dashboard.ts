import { queryOptions } from '@tanstack/react-query';
import { api, unwrap } from '../lib/api';
import { authClient } from '../lib/auth';
export const sessionOptions = queryOptions({
  queryKey: ['session'],
  queryFn: async () => {
    const result = await authClient.getSession();
    if (result.error) throw new Error('Could not load your session.');
    return result.data;
  },
  staleTime: 30_000,
});
export const dashboardOptions = queryOptions({
  queryKey: ['dashboard'],
  queryFn: () => unwrap(api.api.dashboard.get()),
});
export const developerOptions = queryOptions({
  queryKey: ['developer-apps'],
  queryFn: () => unwrap(api.api.developer.apps.get()),
});
export const publicClientOptions = (clientId: string) =>
  queryOptions({
    queryKey: ['oauth-client', clientId],
    queryFn: () => unwrap(api.api.authorization({ clientId }).get()),
  });
export type DeveloperApp = NonNullable<
  Awaited<ReturnType<typeof api.api.developer.apps.get>>['data']
>[number];
