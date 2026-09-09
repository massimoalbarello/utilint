import { z } from 'zod';
import { AppError } from '#models/gateway.ts';
import type { ChatGPTTokens } from '#models/provider.ts';

// Codex's public device flow, also used by OpenClaw. This is not the RFC 8628
// token polling protocol.
// Protocol reference: openclaw/extensions/openai/openai-chatgpt-device-code.ts.
const authOrigin = 'https://auth.openai.com';
const clientId = 'app_EMoamEEZ73f0CkXaXp7hrann';
export const chatGPTVerificationUrl = `${authOrigin}/codex/device`;
const identitySchema = z.object({
  'https://api.openai.com/auth': z.object({
    chatgpt_account_id: z.string().min(1),
    chatgpt_plan_type: z.string().optional(),
  }),
  'https://api.openai.com/profile': z.object({ email: z.string().optional() }).optional(),
  email: z.string().optional(),
  exp: z.number().optional(),
});

export async function boundedJson(response: Response, max = 1024 * 1024): Promise<unknown> {
  if (!response.body) throw new Error('Empty provider response.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) throw new Error('Provider response is too large.');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createChatGPTAuth(fetcher: typeof fetch = fetch) {
  async function post(path: string, body: Record<string, string>, form = false) {
    return fetcher(`${authOrigin}${path}`, {
      method: 'POST',
      headers: {
        'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json',
        'user-agent': 'utilint/0.2.0',
        originator: 'utilint',
      },
      body: form ? new URLSearchParams(body) : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
  }
  async function tokens(response: Response, existingRefresh?: string): Promise<ChatGPTTokens> {
    if (!response.ok) {
      await response.body?.cancel();
      throw new AppError(
        403,
        'chatgpt_reconnect_required',
        'ChatGPT could not authorize this connection. Connect ChatGPT again in Utilint.',
      );
    }
    const data = z
      .object({
        access_token: z.string().min(1),
        refresh_token: z.string().min(1).optional(),
        expires_in: z.number().positive().optional(),
      })
      .parse(await boundedJson(response));
    // These claims are metadata from a token obtained directly from the pinned
    // OAuth server. They never establish a Utilint user identity or session.
    const claims = identitySchema.parse(
      JSON.parse(Buffer.from(data.access_token.split('.')[1] ?? '', 'base64url').toString('utf8')),
    );
    const refresh = data.refresh_token ?? existingRefresh;
    if (!refresh) throw new Error('Missing refresh token.');
    return {
      access: data.access_token,
      refresh,
      expires: data.expires_in ? Date.now() + data.expires_in * 1000 : (claims.exp ?? 0) * 1000,
      accountId: claims['https://api.openai.com/auth'].chatgpt_account_id,
      plan: claims['https://api.openai.com/auth'].chatgpt_plan_type ?? 'ChatGPT',
      email: claims['https://api.openai.com/profile']?.email ?? claims.email ?? '',
    };
  }
  return {
    async begin() {
      const response = await post('/api/accounts/deviceauth/usercode', { client_id: clientId });
      if (!response.ok) {
        await response.body?.cancel();
        throw new AppError(
          502,
          'chatgpt_login_unavailable',
          'OpenAI could not start device sign-in. Please try again shortly.',
        );
      }
      const data = z
        .object({
          device_auth_id: z.string().min(1).max(2048),
          user_code: z.string().min(1).max(64).optional(),
          usercode: z.string().min(1).max(64).optional(),
          interval: z.union([z.number(), z.string()]).optional(),
        })
        .parse(await boundedJson(response, 16384));
      const userCode = data.user_code ?? data.usercode;
      if (!userCode) throw new Error('Missing user code.');
      const seconds = Number(data.interval ?? 5);
      return {
        deviceAuthId: data.device_auth_id,
        userCode,
        intervalMs: Number.isFinite(seconds)
          ? Math.max(5000, Math.min(60000, seconds * 1000))
          : 5000,
      };
    },
    async poll({ deviceAuthId, userCode }: { deviceAuthId: string; userCode: string }) {
      const response = await post('/api/accounts/deviceauth/token', {
        device_auth_id: deviceAuthId,
        user_code: userCode,
      });
      if (response.status === 403 || response.status === 404) {
        await response.body?.cancel();
        return null;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new AppError(
          502,
          'chatgpt_login_failed',
          'ChatGPT sign-in failed. Start a new connection.',
        );
      }
      const data = z
        .object({ authorization_code: z.string().min(1), code_verifier: z.string().min(1) })
        .parse(await boundedJson(response, 16384));
      return tokens(
        await post(
          '/oauth/token',
          {
            grant_type: 'authorization_code',
            client_id: clientId,
            code: data.authorization_code,
            code_verifier: data.code_verifier,
            redirect_uri: `${authOrigin}/deviceauth/callback`,
          },
          true,
        ),
      );
    },
    async refresh(value: ChatGPTTokens) {
      const next = await tokens(
        await post(
          '/oauth/token',
          {
            grant_type: 'refresh_token',
            client_id: clientId,
            refresh_token: value.refresh,
          },
          true,
        ),
        value.refresh,
      );
      if (next.accountId !== value.accountId)
        throw new Error('Provider account changed during refresh.');
      return next;
    },
  };
}
export type ChatGPTAuth = ReturnType<typeof createChatGPTAuth>;
