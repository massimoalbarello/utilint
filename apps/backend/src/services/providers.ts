import { randomBytes } from 'node:crypto';
import type { createChatGPTProvider } from '#lib/chatgpt.ts';
import type { ChatGPTAuth } from '#lib/chatgpt-auth.ts';
import { chatGPTVerificationUrl } from '#lib/chatgpt-auth.ts';
import type { Vault } from '#lib/vault.ts';
import { AppError, type LoginActor } from '#models/gateway.ts';
import { type ChatGPTTokens, chatGPTTokensSchema } from '#models/provider.ts';
import type { ConnectionRepository } from '#repositories/connections.ts';

type Attempt = LoginActor &
  Awaited<ReturnType<ChatGPTAuth['begin']>> & {
    id: string;
    nextPoll: number;
    expiresAt: number;
    status: 'pending' | 'connected' | 'failed';
  };

export function createProviderService({
  repository,
  vault,
  auth,
  chatgpt,
  now = Date.now,
}: {
  repository: ConnectionRepository;
  vault: Vault;
  auth: ChatGPTAuth;
  chatgpt: ReturnType<typeof createChatGPTProvider>;
  now?: () => number;
}) {
  const attempts = new Map<string, Attempt>();
  const locks = new Map<string, Promise<unknown>>();
  async function exclusive<T>(ownerId: string, work: () => Promise<T>): Promise<T> {
    const current = (locks.get(ownerId) ?? Promise.resolve()).catch(() => {}).then(work);
    locks.set(ownerId, current);
    try {
      return await current;
    } finally {
      if (locks.get(ownerId) === current) locks.delete(ownerId);
    }
  }
  function cancel(ownerId: string) {
    for (const [id, attempt] of attempts) if (attempt.ownerId === ownerId) attempts.delete(id);
  }
  function clean() {
    for (const [id, attempt] of attempts) if (attempt.expiresAt <= now()) attempts.delete(id);
  }
  const read = (ownerId: string, encrypted: string) =>
    chatGPTTokensSchema.parse(JSON.parse(vault.open(ownerId, encrypted)));
  const seal = (ownerId: string, tokens: ChatGPTTokens) =>
    vault.seal(ownerId, JSON.stringify(tokens));
  const publicAttempt = (value: Attempt) => ({
    id: value.id,
    userCode: value.userCode,
    verificationUrl: chatGPTVerificationUrl,
    intervalMs: value.intervalMs,
    expiresAt: value.expiresAt,
    status: value.status,
  });
  function attemptFor(actor: LoginActor, id: string) {
    clean();
    const attempt = attempts.get(id);
    if (!attempt || attempt.ownerId !== actor.ownerId || attempt.sessionId !== actor.sessionId)
      throw new AppError(404, 'login_expired', 'Connect ChatGPT again. This sign-in has expired.');
    return attempt;
  }
  return {
    async verifyVault() {
      const existing = await repository.firstCredential();
      if (!existing) return;
      try {
        read(existing.ownerId, existing.encrypted);
      } catch {
        throw new Error(
          'The deployment secret cannot decrypt this database. Restore the original BETTER_AUTH_SECRET.',
        );
      }
    },
    async overview(ownerId: string) {
      const credential = await repository.credential(ownerId);
      if (!credential) return null;
      const { email, plan } = read(ownerId, credential.encrypted);
      return { email, plan, connectedAt: credential.connectedAt };
    },
    begin(actor: LoginActor) {
      return exclusive(actor.ownerId, async () => {
        clean();
        const existing = [...attempts.values()].find(
          (a) =>
            a.ownerId === actor.ownerId &&
            a.sessionId === actor.sessionId &&
            a.status === 'pending',
        );
        if (existing) return publicAttempt(existing);
        if (attempts.size >= 200)
          throw new AppError(429, 'login_busy', 'Please try again shortly.');
        cancel(actor.ownerId);
        const device = await auth.begin();
        const attempt: Attempt = {
          ...actor,
          ...device,
          id: randomBytes(32).toString('base64url'),
          nextPoll: now() + device.intervalMs,
          expiresAt: now() + 15 * 60_000,
          status: 'pending',
        };
        attempts.set(attempt.id, attempt);
        return publicAttempt(attempt);
      });
    },
    poll(actor: LoginActor, id: string) {
      return exclusive(actor.ownerId, async () => {
        const attempt = attemptFor(actor, id);
        if (attempt.status !== 'pending' || now() < attempt.nextPoll) return publicAttempt(attempt);
        attempt.nextPoll = now() + attempt.intervalMs;
        try {
          const tokens = await auth.poll(attempt);
          if (attempts.get(id) !== attempt) throw new Error('Login cancelled.');
          if (tokens) {
            await chatgpt(tokens).models();
            if (attempts.get(id) !== attempt || attempt.expiresAt <= now())
              throw new Error('Login expired.');
            await repository.saveCredential(actor.ownerId, {
              encrypted: seal(actor.ownerId, tokens),
              connectedAt: now(),
            });
            attempt.status = 'connected';
            attempt.deviceAuthId = '';
          }
          return publicAttempt(attempt);
        } catch {
          attempt.status = 'failed';
          attempt.deviceAuthId = '';
          throw new AppError(502, 'chatgpt_login_failed', 'ChatGPT sign-in failed. Start again.');
        }
      });
    },
    async cancelLogin(actor: LoginActor, id: string) {
      attemptFor(actor, id);
      attempts.delete(id);
      return { cancelled: true };
    },
    async disconnect(ownerId: string) {
      cancel(ownerId);
      await exclusive(ownerId, async () => {
        cancel(ownerId);
        await repository.deleteCredential(ownerId);
      });
      return { disconnected: true };
    },
    connection(ownerId: string) {
      return exclusive(ownerId, async () => {
        const credential = await repository.credential(ownerId);
        if (!credential)
          throw new AppError(403, 'provider_not_connected', 'Connect ChatGPT in utilint.');
        let tokens = read(ownerId, credential.encrypted);
        if (tokens.expires <= now() + 60_000) {
          try {
            tokens = await auth.refresh(tokens);
          } catch {
            throw new AppError(403, 'reconnect_required', 'Reconnect ChatGPT in utilint.');
          }
          if (
            !(await repository.replaceCredential(
              ownerId,
              credential.encrypted,
              seal(ownerId, tokens),
            ))
          )
            throw new AppError(403, 'provider_disconnected', 'The ChatGPT connection changed.');
        }
        return chatgpt(tokens);
      });
    },
  };
}
export type ProviderService = ReturnType<typeof createProviderService>;
