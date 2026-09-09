---
name: integrate-utilint
description: Integrate an app with Utilint using dynamic client registration, user consent, and the model gateway.
---

# Integrate Utilint

Use `https://utilint.com` by default, overridable with `UTILINT_URL`. Below, `U` means that
resolved origin. This integration requires an app backend.

## Register the app

Send from the backend without user cookies or an authorization header:

```http
POST U/api/auth/oauth2/register
Content-Type: application/json

{
  "client_name": "Your app",
  "redirect_uris": ["https://your-app.example/api/utilint/callback"],
  "application_type": "web",
  "token_endpoint_auth_method": "client_secret_basic",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "scope": "profile ai:invoke offline_access"
}
```

Expect HTTP **201** with `client_id` and `client_secret`. Persist one encrypted client per app
deployment and reuse it across users and restarts. Serialize registration so concurrent users
share the client. Users need no Utilint developer account; each user authorizes separately.

Callbacks require HTTPS, without credentials, fragments, or a `utilint_connect` parameter.
For HTTP loopback development, use `application_type: "native"`. Limits: 80-character name,
10 callbacks, five registration attempts per minute per IP.

Discovery: `U/.well-known/oauth-authorization-server/api/auth`. Issuer: `U/api/auth`.

## Open consent

The app's **Connect utilint** action ensures registration, creates fresh state and an S256 PKCE
verifier, and saves the attempt against the current app user/session/client. Open:

```text
U/connect/CLIENT_ID?redirect_uri=ENCODED_CALLBACK&state=STATE&code_challenge=CHALLENGE
```

`state`: 32–256 characters from `[A-Za-z0-9_-]`. `code_challenge`: base64url SHA-256 of the verifier,
without padding (43 characters). URL-encode the values. Use a popup or full-page navigation;
iframes are blocked.

Utilint handles passkey login/signup, ChatGPT connection, and consent, skipping completed steps.
An existing grant shows **already authorized** and Continue, then returns a fresh code.
The route selects authorization-code flow, S256, `profile ai:invoke offline_access`, and resource
`U/v1`.

Use the same callback for both cases:

- The optional bare link `U/connect/CLIENT_ID` redirects to that callback with `utilint_connect=1`.
  When this marker appears alone (apart from fixed registered query parameters), sign in to the
  app if needed, then create state/PKCE and open consent. No separate start URL is registered.
- For an OAuth response, reject a mixed initiation marker, validate `state` and `iss` (`U/api/auth`)
  against the saved user/session/client attempt, consume it once, and exchange `code` on the
  backend. Cancellation or an invalid/expired attempt ends the flow.

## Exchange and refresh tokens

Use `POST U/api/auth/oauth2/token`, `application/x-www-form-urlencoded`, and HTTP Basic client
authentication (`client_secret_basic`). An OAuth library such as `oauth4webapi` handles encoding
and response validation.

| Grant | Form fields |
| --- | --- |
| Code exchange | `grant_type=authorization_code`, `code`, `code_verifier`, exact `redirect_uri`, `resource=U/v1` |
| Refresh | `grant_type=refresh_token`, `refresh_token`, `resource=U/v1` |

Store access/refresh tokens encrypted on the backend **per app user**, bound to client ID and
issuer. Honor `expires_in`; access tokens last 15 minutes. Refresh tokens rotate, expire after
30 days, and cannot be reused. Serialize refreshes and save each new token pair together.
If refresh fails or its outcome is unknown, reconnect instead of replaying the token.

The browser receives only completion status. Remove callback codes/state from the final URL.

## Call the gateway

Send `Authorization: Bearer USER_ACCESS_TOKEN` from the backend, with JSON bodies for POST:

- `GET U/v1/models` — choose a model from the returned `data[].id`.
- `POST U/v1/chat/completions` — OpenAI-compatible `model` and `messages`.
- `POST U/v1/responses` — OpenAI-compatible `model` and `input`.

The gateway supports text and function tools, including `stream: true`. Unsupported fields return
400; see the [request schemas](../../apps/backend/src/models/request.ts) for optional fields.
`max_completion_tokens` / `max_output_tokens` are length targets, not hard caps.

Use the user's OAuth token, not the app secret or a ChatGPT credential. Refresh expired tokens;
reconnect on revoked/invalid access. Treat 429 as a rate or allowance limit. Link
**Manage app access** to `U/dashboard`, where users can revoke the app.

## Recover a deleted client

Before opening consent with a saved client, call `GET U/api/connect/clients/CLIENT_ID/status`.
Expect HTTP **200** with `{ "clientId": "CLIENT_ID", "status": "active" }`:

- `active`: reuse the client.
- `missing`: register a replacement, atomically replace the checked client, and obtain fresh
  user consent. Old tokens and pending attempts belong to the old client.
- `disabled`: stop; do not re-register around the block.

Do not follow redirects. Only a valid HTTP 200 response matching the requested client ID confirms
status. On any other
response or network failure, keep the saved client and let the user retry. Start recovery from
the app's Connect action; a bare URL with a deleted client ID cannot discover its old callback.
