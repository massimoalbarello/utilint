import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/app';
import { createSqliteDatabase } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrate';
import { createAuth } from '../../src/lib/auth/better-auth';
import { createChatGPTProvider } from '../../src/lib/chatgpt';
import { createChatGPTAuth } from '../../src/lib/chatgpt-auth';
import { createVault } from '../../src/lib/vault';
import { createConnectionRepository } from '../../src/repositories/sqlite-connections';
import { createDashboardService } from '../../src/services/dashboard';
import { createDeveloperService } from '../../src/services/developers';
import { createGatewayService } from '../../src/services/gateway';
import { createProviderService } from '../../src/services/providers';

export async function fixture(origin = 'http://localhost:4350', assets = new Map<string, Blob>()) {
  const folder = await mkdtemp(join(tmpdir(), 'utilint-test-'));
  const db = await createSqliteDatabase({ dataFolder: folder });
  await runMigrations({ db });
  const secret = randomBytes(32).toString('hex');
  const vault = createVault(secret);
  const repository = createConnectionRepository(db);
  const state = {
    now: Date.now(),
    approved: true,
    calls: 0,
    refreshes: 0,
    upstreamError: false,
    onRefresh: async () => {},
    onPoll: async () => {},
  };
  const access = `test.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture-account', chatgpt_plan_type: 'plus' }, email: 'fixture@example.test' })).toString('base64url')}.fixture-signature`;
  const refresh = 'fixture-provider-refresh-secret';
  const transport = (async (url, init) => {
    const target = String(url);
    if (init?.redirect !== 'error') throw new Error('Upstream redirects must be refused.');
    if (target === 'https://auth.openai.com/api/accounts/deviceauth/usercode')
      return Response.json({
        device_auth_id: 'fixture-private-device-id',
        user_code: 'TEST-12345',
        interval: 5,
      });
    if (target === 'https://auth.openai.com/api/accounts/deviceauth/token') {
      await state.onPoll();
      return state.approved
        ? Response.json({ authorization_code: 'fixture-code', code_verifier: 'fixture-verifier' })
        : new Response(null, { status: 403 });
    }
    if (target === 'https://auth.openai.com/oauth/token') {
      if (new URLSearchParams(String(init?.body)).get('grant_type') === 'refresh_token') {
        state.refreshes++;
        await state.onRefresh();
      }
      return Response.json({ access_token: access, refresh_token: refresh, expires_in: 3600 });
    }
    if (!target.startsWith('https://chatgpt.com/backend-api/codex/'))
      throw new Error('Unexpected provider host.');
    const headers = new Headers(init?.headers);
    if (
      headers.get('authorization') !== `Bearer ${access}` ||
      headers.get('chatgpt-account-id') !== 'fixture-account'
    )
      throw new Error('Wrong provider credentials.');
    if (target.includes('/models?'))
      return Response.json({ models: [{ slug: 'gpt-5.6-sol', visibility: 'list' }] });
    state.calls++;
    const body = JSON.parse(String(init?.body));
    if (body.store !== false || body.stream !== true)
      throw new Error('Unexpected subscription request.');
    if (state.upstreamError)
      return Response.json(
        { error: { message: access, refresh_token: refresh } },
        { status: 401, headers: { 'x-private-token': access } },
      );
    const output = {
      type: 'message',
      id: 'msg_fixture',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: 'Hello from ChatGPT.', annotations: [] }],
    };
    const response = {
      id: 'resp_fixture',
      object: 'response',
      model: body.model,
      created_at: 1,
      status: 'completed',
      output: [],
      usage: { input_tokens: 4, output_tokens: 5, total_tokens: 9 },
    };
    const events = [
      { type: 'response.created', response: { ...response, status: 'in_progress' } },
      {
        type: 'response.output_text.delta',
        delta: 'Hello from ChatGPT.',
        output_index: 0,
        content_index: 0,
        item_id: 'msg_fixture',
      },
      { type: 'response.output_item.done', output_index: 0, item: output },
      { type: 'response.completed', response },
    ];
    return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
      headers: { 'content-type': 'text/event-stream' },
    });
  }) as typeof fetch;
  const providers = createProviderService({
    repository,
    vault,
    auth: createChatGPTAuth(transport),
    chatgpt: createChatGPTProvider(transport),
    now: () => state.now,
  });
  const auth = createAuth({ database: db, baseUrl: new URL(origin), secret });
  const app = createApp({
    auth,
    providers,
    dashboard: createDashboardService(repository, providers),
    developers: createDeveloperService(auth),
    gateway: createGatewayService(repository, providers),
    assets,
    origin,
  });
  return {
    folder,
    db,
    app,
    auth,
    secret,
    vault,
    repository,
    providers,
    state,
    access,
    refresh,
    async user(id: string) {
      await db`INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(${id},'Test',${`${id}@test.invalid`},0,${new Date().toISOString()},${new Date().toISOString()})`;
      return { ownerId: id, sessionId: `session-${id}` };
    },
    async close() {
      await db.close();
      await rm(folder, { recursive: true, force: true });
    },
  };
}
