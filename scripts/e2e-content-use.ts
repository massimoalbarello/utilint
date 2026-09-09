import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, expect, type Page } from '@playwright/test';
import { createApp } from '../../content-use/apps/backend/src/app';
import { createSqliteDatabase } from '../../content-use/apps/backend/src/db/client';
import { migrate } from '../../content-use/apps/backend/src/db/migrate';
import { createAuth } from '../../content-use/apps/backend/src/lib/auth/better-auth';
import { createUtilintVault } from '../../content-use/apps/backend/src/lib/utilint-vault';
import { SqliteAccountsRepository } from '../../content-use/apps/backend/src/repositories/accounts/repository';
import { SqliteOwnerRegistrationRepository } from '../../content-use/apps/backend/src/repositories/owner-registration/repository';
import { SqlitePlaylistsRepository } from '../../content-use/apps/backend/src/repositories/playlists/repository';
import { SqliteRecordsRepository } from '../../content-use/apps/backend/src/repositories/records/repository';
import { SqliteUtilintRepository } from '../../content-use/apps/backend/src/repositories/utilint/repository';
import { AccountsService } from '../../content-use/apps/backend/src/services/accounts/service';
import { OwnerRegistrationService } from '../../content-use/apps/backend/src/services/owner-registration/service';
import { PlaylistsService } from '../../content-use/apps/backend/src/services/playlists/service';
import { RecordsService } from '../../content-use/apps/backend/src/services/records/service';
import { createUtilintService } from '../../content-use/apps/backend/src/services/utilint/service';
import { fixture } from '../apps/backend/test/support/fixture';

// Run with the content-use integration branch checked out beside utilint and both frontends built.
await mkdir(resolve('outputs'), { recursive: true });
const u = 'http://localhost:4360',
  c = 'http://localhost:4361';
const ua = new Map<string, Blob>(),
  ca = new Map<string, string>();
for (const file of new Bun.Glob('**/*').scanSync({
  cwd: resolve(import.meta.dir, '../apps/frontend/dist'),
  onlyFiles: true,
})) {
  const source = Bun.file(resolve(import.meta.dir, '../apps/frontend/dist', file));
  ua.set(file, new Blob([await source.arrayBuffer()], { type: source.type }));
}
for (const file of new Bun.Glob('**/*').scanSync({
  cwd: resolve(import.meta.dir, '../../content-use/apps/frontend/dist'),
  onlyFiles: true,
}))
  ca.set(`/${file}`, resolve(import.meta.dir, '../../content-use/apps/frontend/dist', file));
const f = await fixture(u, ua),
  folder = await mkdtemp(join(tmpdir(), 'utilint-content-test-'));
const db = await createSqliteDatabase({ dataFolder: folder });
await migrate(db);
const repo = new SqliteRecordsRepository(db),
  pr = new SqlitePlaylistsRepository(db),
  secret = crypto.randomUUID().repeat(2);
const jobs = {
  wake() {
    void (async () => {
      const r = await repo.claim();
      if (r)
        await repo.finish({
          ownerId: r.ownerId,
          id: r.id,
          markdown:
            'A transcript about making AI tools portable. Users can carry subscriptions across apps.',
        });
    })();
  },
  cancel: async () => {},
  deleteFiles: async () => {},
  mediaPath: () => '',
};
const auth = createAuth({ database: db, baseUrl: new URL(c), secret });
const utilint = createUtilintService({
  repository: new SqliteUtilintRepository(db),
  records: repo,
  vault: createUtilintVault(secret),
  origin: c,
});
const app = createApp({
  auth,
  utilint,
  origin: c,
  assets: ca,
  records: new RecordsService(repo, jobs, async (url) => url),
  registration: new OwnerRegistrationService(new SqliteOwnerRegistrationRepository(db)),
  playlists: new PlaylistsService(pr, jobs),
  accounts: new AccountsService(
    new SqliteAccountsRepository(db),
    pr,
    {
      list: async () => {
        throw new Error('No discovery');
      },
    },
    jobs,
  ),
});
f.app.listen({ hostname: '127.0.0.1', port: 4360 });
app.listen({ hostname: '127.0.0.1', port: 4361 });
const browser = await chromium.launch({
  channel: process.env.CI ? undefined : 'chrome',
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const errors: string[] = [];
async function passkey(page: Page) {
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = await context.newCDPSession(page);
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
try {
  const developer = await context.newPage();
  await passkey(developer);
  await developer.goto(`${u}/login?signup=true`);
  await developer.getByRole('button', { name: 'Create account with a passkey' }).click();
  await expect(developer).toHaveURL(`${u}/dashboard`);
  const client = await developer.evaluate(
    async (callback) =>
      (
        await fetch('/api/developer/apps', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: 'Content Use',
            redirectUris: [callback],
          }),
        })
      ).json(),
    `${c}/api/utilint/callback`,
  );
  expect(client.client_secret).toBeTruthy();
  await developer.getByRole('button', { name: 'Sign out' }).click();
  const page = await context.newPage();
  await passkey(page);
  await page.goto(c);
  await page.getByRole('button', { name: 'Create your passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Records', exact: true })).toBeVisible();
  await page.goto(`${c}/settings`);
  await page.getByLabel('utilint URL', { exact: true }).fill(u);
  await page.getByLabel('Client ID', { exact: true }).fill(client.client_id);
  await page.getByLabel('Client secret', { exact: true }).fill(client.client_secret);
  await page.getByRole('button', { name: 'Save utilint app' }).click();
  await expect(page.getByText('Ready to connect', { exact: true })).toBeVisible();
  await expect(page.getByText('Connection start URL', { exact: true })).toHaveCount(0);
  // Missing, malformed, and mixed responses must fail rather than restarting OAuth.
  for (const query of [
    '',
    '?code=invalid',
    '?state=invalid',
    '?error=access_denied',
    '?utilint_connect=1&code=invalid',
    '?utilint_connect=1&state=invalid',
    '?utilint_connect=1&utilint_connect=1',
    '?utilint_connect=2',
  ]) {
    const response = await context.request.get(`${c}/api/utilint/callback${query}`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(303);
    expect(response.headers().location).toBe(`${c}/utilint/complete?status=failed`);
  }
  expect((await (await context.request.get(`${c}/api/utilint`)).json()).connected).toBe(false);
  const created = await page.evaluate(async () =>
    (
      await fetch('/api/records', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://youtu.be/rY0wnfFHYbs' }),
      })
    ).json(),
  );
  await page.goto(c);
  await expect(page.getByRole('button', { name: 'Summarize', exact: true })).toBeEnabled();
  const popupEvent = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Summarize', exact: true }).click();
  const popup = await popupEvent;
  await passkey(popup);
  await expect(popup.getByRole('heading', { name: 'Continue to Content Use' })).toBeVisible();
  await popup.getByRole('button', { name: 'New to utilint? Create an account' }).click();
  await popup.getByRole('button', { name: 'Create account with a passkey' }).click();
  await expect(
    popup.getByRole('heading', { name: 'Connect your ChatGPT subscription' }),
  ).toBeVisible();
  await popup.getByRole('button', { name: 'Connect ChatGPT', exact: true }).click();
  await expect(popup.getByLabel('ChatGPT sign-in code')).toHaveText('TEST-12345');
  f.state.now += 6000;
  await expect(popup.getByRole('heading', { name: 'Authorize Content Use' })).toBeVisible({
    timeout: 20000,
  });
  await popup.setViewportSize({ width: 390, height: 780 });
  await popup.screenshot({ path: resolve('outputs/consent-content-use.png'), fullPage: true });
  expect(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await popup.getByRole('button', { name: 'Allow connection' }).click();
  await expect(page.getByText('Hello from ChatGPT.', { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await page.screenshot({
    path: resolve('outputs/content-use-summary.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(f.state.calls).toBe(1);
  await expect(page.getByRole('button', { name: 'Summarized', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Summarized', exact: true })).toBeDisabled();
  const duplicate = await page.evaluate(
    async (id) => (await fetch(`/api/records/${id}/summary`, { method: 'POST' })).json(),
    created.id,
  );
  expect(duplicate.summary.text).toBe('Hello from ChatGPT.');
  expect(f.state.calls).toBe(1);
  await page.getByRole('button', { name: 'View summary', exact: true }).click();
  const stored = JSON.stringify(await db`SELECT * FROM utilint_secrets`);
  expect(stored).not.toContain(client.client_secret);
  expect(stored).not.toContain('access_token');
  expect(await page.content()).not.toContain(f.access);
  expect((await page.evaluate(async () => (await fetch('/api/utilint')).json())).connected).toBe(
    true,
  );
  await page.goto(`${c}/settings`);
  await expect(page.getByText('Developer setup', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: resolve('outputs/content-use-connected.png'), fullPage: true });
  await page.getByRole('button', { name: 'Disconnect utilint', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Connect utilint', exact: true })).toBeVisible();
  const returningEvent = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Connect utilint', exact: true }).click();
  const returning = await returningEvent;
  await expect(
    returning.getByRole('heading', { name: 'Content Use is already authorized' }),
  ).toBeVisible();
  await returning.getByRole('button', { name: 'Continue to Content Use' }).click();
  await expect(page.getByRole('button', { name: 'Disconnect utilint' })).toBeVisible();
  await page.goto(`${c}/records/${created.id}`);
  await expect(page.getByRole('button', { name: 'Summarized', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'View summary' }).click();
  await expect(page.getByText('Hello from ChatGPT.', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve('outputs/content-use-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // The exact dashboard link performs a real self-authorization, including both logged-out apps.
  await page.goto(`${c}/settings`);
  await page.getByRole('button', { name: 'Disconnect utilint', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await developer.goto(`${u}/dashboard`);
  await developer.getByRole('button', { name: 'Sign out', exact: true }).click();
  // Keep the Content Use passkey on its original authenticator. It navigates the public link first.
  const signedOutResponse = await context.request.get(`${c}/api/utilint/callback?code=invalid`, {
    maxRedirects: 0,
  });
  expect(signedOutResponse.headers().location).toBe(`${c}/utilint/complete?status=failed`);
  await page.goto(`${u}/connect/${client.client_id}`);
  await expect(page.getByRole('button', { name: 'Sign in with passkey' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in with passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Continue to Content Use' })).toBeVisible();
  // The developer's authenticator holds their real registered Utilint passkey.
  await developer.goto(page.url());
  await page.close();
  await developer.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(
    developer.getByRole('heading', { name: 'Connect your ChatGPT subscription' }),
  ).toBeVisible();
  await developer.getByRole('button', { name: 'Connect ChatGPT', exact: true }).click();
  await expect(developer.getByLabel('ChatGPT sign-in code')).toHaveText('TEST-12345');
  f.state.now += 6000;
  await expect(developer.getByRole('heading', { name: 'Authorize Content Use' })).toBeVisible({
    timeout: 20000,
  });
  await developer.getByRole('button', { name: 'Allow connection' }).click();
  await expect(developer.getByRole('heading', { name: 'utilint connected' })).toBeVisible();
  expect((await (await context.request.get(`${c}/api/utilint`)).json()).connected).toBe(true);
  expect((await (await context.request.get(`${u}/api/dashboard`)).json()).connections).toEqual([
    { clientId: client.client_id, name: 'Content Use' },
  ]);
  await developer.screenshot({
    path: resolve('outputs/consent-real-link-complete.png'),
    fullPage: true,
  });
  await developer.goto(`${u}/connect/${client.client_id}/test`);
  await expect(
    developer.getByRole('heading', { name: 'Content Use is already authorized' }),
  ).toBeVisible();
  await developer.getByRole('button', { name: 'Continue to Content Use' }).click();
  await expect(developer.getByRole('heading', { name: 'utilint connected' })).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    'PASS two-app browser flow: dashboard summary → Utilint signup → ChatGPT → consent → server exchange → gateway summary → returning-user skip → mobile → signed-out real link → developer self-authorization',
  );
} catch (error) {
  for (const page of context.pages())
    if (!page.isClosed())
      console.log(new URL(page.url()).pathname, await page.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
  await app.stop();
  await f.app.stop();
  await db.close();
  await f.close();
  await rm(folder, { recursive: true, force: true });
}
