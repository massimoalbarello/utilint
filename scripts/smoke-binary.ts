import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect } from '@playwright/test';

const binary = resolve('apps/backend/dist/app');
const folder = await mkdtemp(join(tmpdir(), 'utilint-binary-test-'));
const origin = 'http://localhost:4352';
const env = {
  ...process.env,
  PORT: '4352',
  BASE_URL: origin,
  NIBRUN_DATA_DIR: folder,
  BETTER_AUTH_SECRET: '',
};
try {
  const missing = Bun.spawn([binary], { cwd: folder, env, stdout: 'pipe', stderr: 'pipe' });
  const [, message, status] = await Promise.all([
    new Response(missing.stdout).text(),
    new Response(missing.stderr).text(),
    missing.exited,
  ]);
  expect(status).not.toBe(0);
  expect(message).toContain('BETTER_AUTH_SECRET');
  expect(await readdir(folder)).toEqual([]);
  const secret = randomBytes(32).toString('hex');
  const child = Bun.spawn([binary], {
    cwd: folder,
    env: { ...env, BETTER_AUTH_SECRET: secret },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = new Response(child.stdout).text();
  const stderr = new Response(child.stderr).text();
  try {
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(`${origin}/api/health`)).status;
          } catch {
            return 0;
          }
        },
        { timeout: 15000 },
      )
      .toBe(200);
    const html = await (await fetch(origin)).text();
    expect(html).toContain('<title>utilint</title>');
    const asset = /src="([^"]+\.js)"/.exec(html)?.[1];
    expect(asset).toBeTruthy();
    expect((await fetch(`${origin}${asset}`)).status).toBe(200);
    expect((await fetch(`${origin}/api/dashboard`)).status).toBe(401);
    const discovery = await (
      await fetch(`${origin}/.well-known/oauth-authorization-server/api/auth`)
    ).json();
    expect(discovery.issuer).toBe(`${origin}/api/auth`);
    expect(await readdir(folder)).toContain('app.db');
    expect((await readdir(folder)).some((name) => /secret|vault|key/.test(name))).toBe(false);
  } finally {
    child.kill();
    await child.exited;
    expect(await stdout).not.toContain(secret);
    expect(await stderr).not.toContain(secret);
  }
  console.log(
    'PASS compiled binary: required secret, embedded assets, migrations, and protected API',
  );
} finally {
  await rm(folder, { recursive: true, force: true });
}
