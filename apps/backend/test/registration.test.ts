import { expect, test } from 'bun:test';
import { fixture } from './support/fixture';

const metadata = {
  client_name: 'A hosted app',
  redirect_uris: ['https://app.example/callback'],
  application_type: 'web',
  token_endpoint_auth_method: 'client_secret_basic',
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  scope: 'profile ai:invoke offline_access',
};
async function register(
  app: Awaited<ReturnType<typeof fixture>>['app'],
  body: unknown,
  ip = `198.18.${crypto.getRandomValues(new Uint8Array(2)).join('.')}`,
) {
  return app.handle(
    new Request('http://localhost:4350/api/auth/oauth2/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    }),
  );
}

test('anonymous DCR creates a confidential PKCE client, never a user or grant, and is discoverable', async () => {
  const f = await fixture();
  try {
    const response = await register(f.app, metadata);
    expect(response.status).toBe(201);
    const client = (await response.json()) as {
      client_id: string;
      client_secret: string;
      redirect_uris: string[];
      token_endpoint_auth_method: string;
    };
    expect(client.client_id).toBeString();
    expect(client.client_secret.length).toBeGreaterThan(20);
    expect(client.redirect_uris).toEqual(metadata.redirect_uris);
    expect(client.token_endpoint_auth_method).toBe('client_secret_basic');
    const [saved] = await f.db`SELECT * FROM auth_oauthClient`;
    expect(saved.userId).toBeNull();
    const authorize = new URL('http://localhost:4350/api/auth/oauth2/authorize');
    authorize.search = new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: metadata.redirect_uris[0] ?? '',
      response_type: 'code',
      scope: metadata.scope,
      state: crypto.randomUUID(),
      resource: 'http://localhost:4350/v1',
    }).toString();
    const missingPKCE = await f.app.handle(new Request(authorize.href));
    const error = missingPKCE.headers.get('location') ?? (await missingPKCE.text());
    expect(error).toContain('invalid_request');
    expect(error.toLowerCase()).toContain('pkce');
    expect(saved.clientSecret).not.toBe(client.client_secret);
    expect(await f.db`SELECT id FROM auth_user`).toHaveLength(0);
    expect(await f.db`SELECT id FROM auth_oauthConsent`).toHaveLength(0);
    const discovery = await f.app.handle(
      new Request('http://localhost:4350/.well-known/oauth-authorization-server/api/auth'),
    );
    expect(discovery.status).toBe(200);
    expect(
      ((await discovery.json()) as { registration_endpoint: string }).registration_endpoint,
    ).toBe('http://localhost:4350/api/auth/oauth2/register');
  } finally {
    await f.close();
  }
});

for (const [name, patch] of Object.entries({
  'insecure web callback': { redirect_uris: ['http://app.example/callback'] },
  'callback fragment': { redirect_uris: ['https://app.example/callback#fragment'] },
  'callback credentials': { redirect_uris: ['https://user:password@app.example/callback'] },
  'reserved initiation parameter': {
    redirect_uris: ['https://app.example/callback?utilint_connect=1'],
  },
  'public client': { token_endpoint_auth_method: 'none' },
  'client credentials grant': { grant_types: ['client_credentials'] },
  'unavailable scope': { scope: 'admin' },
  'too many callbacks': {
    redirect_uris: Array.from({ length: 11 }, (_, i) => `https://app.example/callback/${i}`),
  },
  'oversized name': { client_name: 'x'.repeat(81) },
})) {
  test(`DCR refuses ${name} without persisting a client`, async () => {
    const f = await fixture();
    try {
      const response = await register(f.app, { ...metadata, ...patch });
      expect(response.status).toBe(400);
      expect(await f.db`SELECT id FROM auth_oauthClient`).toHaveLength(0);
    } finally {
      await f.close();
    }
  });
}

test('DCR rate limit stops repeated registration attempts', async () => {
  const f = await fixture();
  try {
    const ip = `198.19.${crypto.getRandomValues(new Uint8Array(2)).join('.')}`;
    for (let i = 0; i < 5; i++) expect((await register(f.app, metadata, ip)).status).toBe(201);
    expect((await register(f.app, metadata, ip)).status).toBe(429);
    expect(await f.db`SELECT id FROM auth_oauthClient`).toHaveLength(5);
  } finally {
    await f.close();
  }
});
