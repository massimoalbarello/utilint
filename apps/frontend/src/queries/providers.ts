import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { api, unwrap } from '../lib/api';
import { dashboardOptions } from './dashboard';
export const beginChatGPTLogin = () => unwrap(api.api.provider.chatgpt.post());
export const cancelChatGPTLogin = (loginId: string) =>
  unwrap(api.api.provider.chatgpt({ loginId }).delete());
export const chatGPTLoginOptions = (loginId: string, queryClient: QueryClient) =>
  queryOptions({
    queryKey: ['provider-login', loginId],
    queryFn: async () => {
      const result = await unwrap(api.api.provider.chatgpt({ loginId }).post());
      if (result.status === 'connected') {
        await queryClient.invalidateQueries(dashboardOptions);
        await queryClient.invalidateQueries({ queryKey: ['consent'] });
      }
      return result;
    },
    refetchInterval: (query) =>
      !query.state.error && query.state.data?.status === 'pending'
        ? query.state.data.intervalMs
        : false,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: Infinity,
  });
