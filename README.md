# Utility intelligence

[![Deploy on nibrun](https://nibrun.com/button.svg)](https://app.nibrun.com/deploy?name=utilint&binary=https%3A%2F%2Fgithub.com%2Fmassimoalbarello%2Futilint%2Freleases%2Fdownload%2Fnibrun-latest%2Futilint&port=3000&env=BETTER_AUTH_SECRET&minimal)

Connect your ChatGPT subscription and authorize apps to use it. Developers register OAuth apps;
utilint keeps provider credentials on the backend and proxies model requests. No usage database,
budgets, or paid API fallback.

## Deploy

The button selects the `utilint` Linux binary from the rolling `nibrun-latest` prerelease.
It asks for `BETTER_AUTH_SECRET`. Generate a unique secret with `openssl rand -hex 32` and save it
in your password manager. Keep the same secret across updates; changing it makes existing
credentials unreadable. CI publishes the prerelease after checks pass on `main`.

nibrun supplies the HTTPS hostname and persistent `/app/data` directory automatically. To update
an existing instance, use `nib run https://github.com/massimoalbarello/utilint/releases/download/nibrun-latest/utilint --app YOUR_APP`.
Back up the database and retain the deployment secret separately.

## Use

Create a passkey account. In **Account**, connect ChatGPT using OpenAI's device code. This uses
the Codex allowance included in an eligible ChatGPT plan. No CLI installation is needed. You can
disconnect/reconnect ChatGPT and revoke individual apps. Requests already sent may finish.

In **Developers**, register your app's callback URLs and save its one-time client secret.
Copy the connection URL to start the hosted passkey → ChatGPT → consent flow from your app.
See [Connect with utilint](docs/connect.md) for the popup integration and callback contract.
Use authorization code with S256 PKCE and `client_secret_basic` from your app's backend:

| Setting | Value |
| --- | --- |
| Authorization | `/api/auth/oauth2/authorize` |
| Token / refresh | `/api/auth/oauth2/token` |
| Resource / OpenAI SDK base URL | `https://YOUR_INSTANCE/v1` |
| Scopes | `profile ai:invoke offline_access` |

Send the user's **utilint access token** as Bearer authorization to `GET /v1/models`,
`POST /v1/responses` or `POST /v1/chat/completions`. Select a model returned by `/v1/models`.
Text, function tools and streaming are supported. Subscription requests use `store: false`;
`max_completion_tokens` (Chat Completions) and `max_output_tokens` (Responses) are prompt
targets. Unsupported fields are rejected. The subscription transport follows the current Codex
device flow and may change upstream.

Provider access/refresh tokens and account metadata are encrypted with AES-256-GCM, a random
nonce and owner-bound associated data. HKDF derives a separate vault key from the required
deployment secret. No vault key file or plaintext provider token is written to disk. Apps and
browsers never receive provider tokens. The running backend and whoever controls its deployment
secret must be trusted: the proxy needs plaintext credentials in memory to call OpenAI.

## Develop

Requires Bun 1.4.0. Structure, passkey authentication and binary deployment follow
[context-use](https://github.com/massimoalbarello/context-use). Engineering guidance lives in
the scoped `AGENTS.md` files. The UI uses shadcn/Base UI primitives.

```sh
bun install
cp apps/backend/.env.example apps/backend/.env
# Set BETTER_AUTH_SECRET in that file, then:
bun run dev
bun run check:all
bun run test:e2e
bun run build
```

Open `http://localhost:5173`. Browser tests use an isolated real passkey flow and a controlled
OpenAI transport; they require Chrome locally. `bun run build` embeds frontend assets and
migrations in `apps/backend/dist/app` for Linux x86_64. `bun run build:local` targets your machine.
