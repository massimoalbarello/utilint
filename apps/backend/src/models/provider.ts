import { z } from 'zod';

export const chatGPTTokensSchema = z.object({
  access: z.string().min(1),
  refresh: z.string().min(1),
  expires: z.number().finite(),
  accountId: z.string().min(1),
  email: z.string(),
  plan: z.string(),
});
export type ChatGPTTokens = z.infer<typeof chatGPTTokensSchema>;
export type RelayInput = {
  endpoint: 'chat/completions' | 'responses';
  body: Record<string, unknown>;
  signal: AbortSignal;
};
export type ProviderModel = { id: string; object: string; created: number; owned_by: string };
export type ProviderConnection = {
  models(): Promise<ProviderModel[]>;
  validate(input: RelayInput['body']): void;
  relay(input: RelayInput): Promise<Response>;
};
