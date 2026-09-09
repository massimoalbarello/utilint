import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, expect, type Page, request as requestFactory } from '@playwright/test';
import { fixture } from '../apps/backend/test/support/fixture';

const origin = 'http://localhost:4350';
const redirectUri = 'http://localhost:4351/callback';
const assets = new Map<string, Blob>();
const frontend = resolve('apps/frontend/dist');
for (const file of new Bun.Glob('**/*').scanSync({ cwd: frontend, onlyFiles: true })) {
  const source = Bun.file(resolve(frontend, file));
  assets.set(file, new Blob([await source.arrayBuffer()], { type: source.type }));
}
const f = await fixture(origin, assets);
f.app.listen({ hostname: '127.0.0.1', port: 4350 });
const callback = Bun.serve({
  hostname: '127.0.0.1',
  port: 4351,
  fetch: () => new Response('Callback received'),
});
const browser = await chromium.launch({
  channel: process.env.CI ? undefined : 'chrome',
  headless: true,
});
const server = await requestFactory.newContext();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
async function authenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}
await authenticator(page);
const output = resolve('outputs');
await mkdir(output, { recursive: true });
async function screenshot(name: string) {
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
try {
  await page.goto(`${origin}/login?signup=true`);
  await page.getByRole('button', { name: 'Create account with a passkey' }).click();
  await expect(page).toHaveURL(`${origin}/dashboard`, { timeout: 15000 });
  await screenshot('account-empty');
  await page.getByRole('link', { name: 'Developers', exact: true }).click();
  await page.getByRole('button', { name: 'Register an app' }).click();
  await page.getByLabel('Application name', { exact: true }).fill('Notes');
  await page.getByLabel('Redirect URLs', { exact: true }).fill(redirectUri);
  await page
    .getByLabel('Connection start URL', { exact: true })
    .fill('http://localhost:4351/start');
  const creation = page.waitForResponse(
    (r) => r.url() === `${origin}/api/developer/apps` && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Create application' }).click();
  const created = await creation;
  expect(created.status()).toBe(200);
  const client = await created.json();
  expect(client.client_secret).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'Save your client secret' })).toBeVisible();
  await page.getByRole('button', { name: 'I’ve saved it' }).click();
  await screenshot('developers');
  const basic = Buffer.from(`${client.client_id}:${client.client_secret}`).toString('base64');
  async function authorizationCode(login: boolean) {
    const verifier = randomBytes(32).toString('base64url');
    const state = randomBytes(24).toString('hex');
    const params = new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'profile ai:invoke offline_access',
      resource: `${origin}/v1`,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      state,
      prompt: 'consent',
    });
    const connect = new URLSearchParams({
      redirect_uri: redirectUri,
      state,
      code_challenge: params.get('code_challenge')!,
    });
    await page.goto(`${origin}/connect/${client.client_id}?${connect}`);
    if (login) {
      await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
    }
    await expect(
      page.getByRole('heading', {
        name: /Connect your ChatGPT subscription|Authorize Notes|Notes is already authorized/,
      }),
    ).toBeVisible();
    if (
      await page.getByRole('heading', { name: 'Connect your ChatGPT subscription' }).isVisible()
    ) {
      const oauthQuery = new URL(page.url()).search.slice(1);
      const premature = await context.request.post(`${origin}/api/auth/oauth2/consent`, {
        headers: { origin },
        data: { accept: true, oauth_query: oauthQuery },
      });
      expect(premature.status()).toBe(403);
      const tampered = new URLSearchParams(oauthQuery);
      tampered.set('client_id', 'attacker');
      expect(
        (
          await context.request.post(`${origin}/api/connect/context`, {
            headers: { origin },
            data: { oauthQuery: tampered.toString() },
          })
        ).ok(),
      ).toBe(false);
      await page.getByRole('button', { name: 'Connect ChatGPT', exact: true }).click();
      await expect(page.getByLabel('ChatGPT sign-in code')).toHaveText('TEST-12345');
      await screenshot('consent-connect-chatgpt');
      f.state.now += 6000;
    }
    await expect(
      page.getByRole('heading', { name: /Authorize Notes|Notes is already authorized/ }),
    ).toBeVisible({ timeout: 15000 });
    await screenshot('consent');
    await page.getByRole('button', { name: /Allow connection|Continue to Notes/ }).click();
    await expect(page).toHaveURL(/localhost:4351\/callback\?/, { timeout: 15000 });
    const result = new URL(page.url());
    expect(result.searchParams.get('state')).toBe(state);
    expect(result.searchParams.get('iss')).toBe(`${origin}/api/auth`);
    return {
      grant_type: 'authorization_code',
      code: result.searchParams.get('code') ?? '',
      code_verifier: verifier,
      redirect_uri: redirectUri,
      resource: `${origin}/v1`,
    };
  }
  const exchangeCode = (form: Awaited<ReturnType<typeof authorizationCode>>) =>
    server.post(`${origin}/api/auth/oauth2/token`, {
      headers: { authorization: `Basic ${basic}` },
      form,
    });
  async function authorize(login: boolean) {
    const response = await exchangeCode(await authorizationCode(login));
    expect(response.status()).toBe(200);
    return response.json();
  }
  for (const suffix of ['', '/test']) {
    const link = await server.get(`${origin}/connect/${client.client_id}${suffix}`, {
      maxRedirects: 0,
    });
    expect(link.status()).toBe(302);
    expect(link.headers().location).toBe(
      suffix ? `/connect/${client.client_id}` : 'http://localhost:4351/start',
    );
  }
  expect(
    (
      await server.get(`${origin}/connect/${client.client_id}?state=${'x'.repeat(32)}`, {
        maxRedirects: 0,
      })
    ).status(),
  ).toBe(400);
  expect((await server.get(`${origin}/connect/unknown`, { maxRedirects: 0 })).status()).toBe(404);
  const invalidStart = await context.request.put(
    `${origin}/api/developer/apps/${client.client_id}/start`,
    {
      headers: { origin },
      data: { startUrl: 'https://attacker.example/start' },
    },
  );
  expect(invalidStart.status()).toBe(400);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.goto(
    `${origin}/login?redirect=${encodeURIComponent(`/connect/${client.client_id}/test`)}`,
  );
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page).toHaveURL('http://localhost:4351/start');
  await page.goto(`${origin}/dashboard`);
  await page.getByRole('button', { name: 'Sign out' }).click();
  const tokens = await authorize(true);
  const generate = (token: string, streaming = false, endpoint = 'chat/completions') =>
    server.post(`${origin}/v1/${endpoint}`, {
      headers: { authorization: `Bearer ${token}` },
      data: {
        model: 'gpt-5.6-sol',
        stream: streaming,
        ...(endpoint === 'responses'
          ? { input: 'Hello' }
          : { messages: [{ role: 'user', content: 'Hello' }] }),
      },
    });
  expect((await generate(tokens.access_token)).status()).toBe(200);
  expect(f.state.calls).toBe(1);
  await page.goto(`${origin}/dashboard`);
  async function connectChatGPT() {
    await page.getByRole('button', { name: 'Connect ChatGPT' }).click();
    await expect(page.getByLabel('ChatGPT sign-in code')).toHaveText('TEST-12345');
    await screenshot('connect-chatgpt');
    f.state.now += 6000;
    await expect(page.getByText('ChatGPT connected.', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByText('fixture@example.test · plus')).toBeVisible();
  }
  await expect(page.getByText('fixture@example.test · plus')).toBeVisible();
  const dashboard = await (await context.request.get(`${origin}/api/dashboard`)).json();
  expect(dashboard.connections).toEqual([{ clientId: client.client_id, name: 'Notes' }]);
  for (const value of [f.access, f.refresh, 'fixture-private-device-id']) {
    expect(JSON.stringify(dashboard)).not.toContain(value);
    expect(await page.content()).not.toContain(value);
    expect((await readFile(join(f.folder, 'app.db'))).toString('utf8')).not.toContain(value);
  }
  const generation = await generate(tokens.access_token);
  expect(generation.status()).toBe(200);
  expect((await generation.json()).choices[0].message.content).toBe('Hello from ChatGPT.');
  const callsBeforeInvalidRequests = f.state.calls;
  for (const unsupported of [{ max_tokens: 32 }, { temperature: 0.5 }]) {
    const rejected = await server.post(`${origin}/v1/chat/completions`, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
      data: {
        model: 'gpt-5.6-sol',
        messages: [{ role: 'user', content: 'Hello' }],
        ...unsupported,
      },
    });
    expect(rejected.status()).toBe(400);
  }
  expect(f.state.calls).toBe(callsBeforeInvalidRequests);
  const responses = await generate(tokens.access_token, false, 'responses');
  expect((await responses.json()).output[0].content[0].text).toBe('Hello from ChatGPT.');
  const streamed = await generate(tokens.access_token, true);
  expect(await streamed.text()).toContain('[DONE]');
  const responseStream = await generate(tokens.access_token, true, 'responses');
  expect(await responseStream.text()).toContain('response.completed');
  expect((await generate('invalid-token')).status()).toBe(401);
  f.state.upstreamError = true;
  const failed = await generate(tokens.access_token);
  expect(failed.status()).toBe(401);
  expect(await failed.text()).not.toContain(f.access);
  expect(failed.headers()['x-private-token']).toBeUndefined();
  f.state.upstreamError = false;
  await screenshot('account-connected');
  console.log(
    'PASS real passkeys, app registration, OAuth PKCE, encrypted provider storage, and both gateway APIs',
  );
  const crossOrigin = await context.request.delete(`${origin}/api/provider`, {
    headers: { origin: 'https://attacker.example' },
  });
  expect(crossOrigin.status()).toBe(403);
  const bypass = await context.request.post(`${origin}/api/auth/oauth2/delete-consent`, {
    headers: { origin },
    data: { id: 'fake' },
  });
  expect(bypass.status()).toBe(404);
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await authenticator(otherPage);
  await otherPage.goto(`${origin}/login?signup=true`);
  await otherPage.getByRole('button', { name: 'Create account with a passkey' }).click();
  await expect(otherPage).toHaveURL(`${origin}/dashboard`);
  expect(await (await other.request.get(`${origin}/api/dashboard`)).json()).toEqual({
    provider: null,
    connections: [],
  });
  expect(
    (
      await other.request.delete(`${origin}/api/connections/${client.client_id}`, {
        headers: { origin },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await other.request.delete(`${origin}/api/developer/apps/${client.client_id}`, {
        headers: { origin },
      })
    ).ok(),
  ).toBe(false);
  expect(
    (
      await other.request.put(`${origin}/api/developer/apps/${client.client_id}/start`, {
        headers: { origin },
        data: { startUrl: 'http://localhost:4351/attacker' },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await other.request.get(`${origin}/connect/${client.client_id}`, { maxRedirects: 0 })
    ).headers().location,
  ).toBe('http://localhost:4351/start');
  await other.close();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Connect ChatGPT' })).toBeVisible();
  const before = f.state.calls;
  expect((await generate(tokens.access_token)).status()).toBe(403);
  expect(f.state.calls).toBe(before);
  await connectChatGPT();
  expect((await generate(tokens.access_token)).status()).toBe(200);
  const refreshResponse = await server.post(`${origin}/api/auth/oauth2/token`, {
    headers: { authorization: `Basic ${basic}` },
    form: {
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      resource: `${origin}/v1`,
    },
  });
  expect(refreshResponse.status()).toBe(200);
  const refreshed = await refreshResponse.json();
  const pendingCode = await authorizationCode(false);
  await page.goto(`${origin}/dashboard`);
  await page.getByRole('button', { name: 'Revoke access' }).click();
  await page.getByRole('button', { name: 'Revoke access' }).click();
  await expect(page.getByText('No connected apps')).toBeVisible();
  expect((await exchangeCode(pendingCode)).status()).toBe(400);
  expect((await generate(refreshed.access_token)).status()).toBe(401);
  expect(
    (
      await server.post(`${origin}/api/auth/oauth2/token`, {
        headers: { authorization: `Basic ${basic}` },
        form: {
          grant_type: 'refresh_token',
          refresh_token: refreshed.refresh_token,
          resource: `${origin}/v1`,
        },
      })
    ).ok(),
  ).toBe(false);
  await page.goto(`${origin}/developers`);
  await expect(
    page.getByText(`${origin}/connect/${client.client_id}`, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Consent test URL', { exact: true })).toHaveCount(0);
  const reauthorized = await authorize(false);
  expect((await generate(refreshed.access_token)).status()).toBe(401);
  expect((await generate(reauthorized.access_token)).status()).toBe(200);
  await page.goto(`${origin}/dashboard`);
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot('account-mobile');
  await page.getByRole('link', { name: 'Developers', exact: true }).click();
  await screenshot('developers-mobile');
  const deleted = await context.request.delete(`${origin}/api/developer/apps/${client.client_id}`, {
    headers: { origin },
  });
  expect(deleted.status()).toBe(200);
  expect(
    (await server.get(`${origin}/connect/${client.client_id}`, { maxRedirects: 0 })).status(),
  ).toBe(404);
  expect((await generate(reauthorized.access_token)).status()).toBe(401);
  expect(
    (await f.db`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'gateway_%'`)
      .length,
  ).toBe(0);
  expect(errors).toEqual([]);
  console.log(
    'PASS cross-user isolation, CSRF rejection, disconnect/reconnect, token revocation, and mobile layouts',
  );
} catch (error) {
  await screenshot('failure');
  console.error('Page:', new URL(page.url()).pathname);
  console.error((await page.locator('body').innerText()).slice(0, 1600));
  throw error;
} finally {
  await server.dispose();
  await browser.close();
  await f.app.stop();
  callback.stop(true);
  await f.close();
}
