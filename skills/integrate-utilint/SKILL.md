---
name: integrate-utilint
description: Add Utilint subscription OAuth and gateway access to a hosted app, including automatic client registration, consent, per-user tokens, and recovery after client deletion. Use when integrating an app with Utilint or fixing that integration.
---

# Integrate Utilint

Give users a **Connect utilint** action so they can bring their ChatGPT subscription into the
app. Utilint hosts passkey sign-in/signup, ChatGPT connection, and consent. Its dashboard is for
users to manage their subscription and revoke app access. App registration happens on the
integrating backend; users do not need developer accounts or client configuration forms.

Read the host app's authentication, persistence, and gateway code before choosing where to add
this workflow. Use the app's existing session and data layers, and a maintained OAuth client
library (Content Use uses `oauth4webapi`). Adapt to the user's stack; this skill does not require
converting a private workspace into a multi-user app or changing its sign-in method.

## Ownership and configuration

- The **deployment** owns one confidential OAuth client. Persist its client ID and secret across
  restarts. Serialize first registration and replacement; concurrent users must share the result.
- Each **app user** owns their grant, access/refresh tokens, and model requests. Bind pending
  authorization attempts to that user's current app session and the OAuth client/issuer.
- Default the backend Utilint origin to `https://utilint.com`, overridable with `UTILINT_URL`.
  Examples below use `UTILINT_ORIGIN` for that resolved origin. Use HTTPS, with HTTP loopback only
  for local development. Do not accept an arbitrary provider origin from a callback.
- Keep client secrets and user tokens encrypted on the backend. Neither belongs in frontend
  JavaScript, browser storage, logs, copied consent links, or popup messages.

## Register the app automatically

On the first connection, send this request from the app backend to the configured Utilint origin:

```http
POST /api/auth/oauth2/register
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

No Utilint session is required. Process the `201` response with the OAuth library and securely
persist `client_id` and the one-time `client_secret` before starting authorization. Registration
creates an app identity, not permission to use anyone's subscription. Names are self-declared;
consent also displays the callback hostname.

Use one exact callback URL. Registration allows up to 10 callbacks, a name up to 80 characters,
and five attempts per minute per IP. Web callbacks require HTTPS. For localhost development use
`application_type: "native"` and an exact HTTP loopback callback. This integration expects an app
backend using `client_secret_basic`; do not distribute a client secret to a public browser client.

OAuth metadata is available at `/.well-known/oauth-authorization-server/api/auth`; its issuer is
`UTILINT_ORIGIN/api/auth` and it advertises the registration endpoint.

## Keep registration usable

Before opening consent with a saved client, request:

```http
GET /api/connect/clients/CLIENT_ID/status
```

This Utilint-specific endpoint returns HTTP 200 with `{ "clientId": "CLIENT_ID", "status":
"active" }`, `"missing"`, or `"disabled"`, and `Cache-Control: no-store`.

- **active:** reuse the saved client.
- **missing:** register a replacement through DCR. Atomically replace only the version checked,
  retaining the old config if registration or storage fails. Require fresh user consent.
- **disabled:** stop and surface the block. Do not register around it.

Require a valid response for the exact requested client ID. A timeout, malformed response,
redirect, or ordinary HTTP 404/429/5xx is not evidence of deletion. Preserve the registration and
let the user retry; do not loop or continually create new clients. Bind stored tokens and pending
codes to their original client so replacement cannot reuse old permissions. Revoking one user's
consent or disconnecting locally must not replace the deployment's client.

## Start consent and handle the callback

Open a popup synchronously from a user click, or use full-page navigation when popups are blocked.
Use an authenticated app-backend action to prepare the connection; validate its request origin.
Confirm the app user, ensure registration, create fresh random `state` and an S256 PKCE verifier,
and store the attempt against the app user/session/client for at most 10 minutes. Then navigate to:

```text
UTILINT_ORIGIN/connect/CLIENT_ID?redirect_uri=ENCODED_CALLBACK&state=STATE&code_challenge=CHALLENGE
```

Use URL-building APIs for encoding. `state` must be 32–256 URL-safe characters. The challenge is
base64url SHA-256 of the verifier, without padding (43 characters). Utilint selects authorization
code flow, `profile ai:invoke offline_access`, the `UTILINT_ORIGIN/v1` resource, and S256 PKCE.

The optional bare consent link is `UTILINT_ORIGIN/connect/CLIENT_ID`. It redirects to the first
registered callback with `utilint_connect=1` appended. **No separate start URL is registered.**
Your one callback distinguishes two cases:

1. **Initiation:** the marker is `utilint_connect=1`, with only the registered fixed query
   parameters and no authorization-response fields. Check the app session, resume here after app
   login if necessary, then prepare fresh state/PKCE as above.
2. **Response:** no initiation marker. Validate state and `iss` against the original app session
   and `UTILINT_ORIGIN/api/auth`, consume the attempt once, and exchange the code. A cancellation,
   expired attempt, changed user/session/client, or malformed/mixed query fails cleanly; it must
   never silently start another flow. Never accept a code without a pending attempt.

Reserve `utilint_connect`; do not include it in the registered callback or the OAuth
`redirect_uri`. Do not reuse a fixed state/verifier. For automatic recovery, start from the app's
own Connect action: a bare URL containing a deleted client ID cannot discover the old callback.

Utilint skips completed steps. An existing grant shows **already authorized** and a Continue
button. The app still receives a fresh authorization code through its callback.

## Exchange, store, and use tokens

Exchange on the backend with the maintained OAuth library:

| Setting | Value |
| --- | --- |
| Token endpoint | `UTILINT_ORIGIN/api/auth/oauth2/token` |
| Client authentication | `client_secret_basic` |
| Grant | `authorization_code` |
| Inputs | Returned `code`, original `code_verifier`, exact registered `redirect_uri` |
| Resource | `UTILINT_ORIGIN/v1` |

Validate the token response and required scopes. Save access/refresh tokens under the app user,
bound to client ID and issuer. Access tokens currently last 15 minutes; refresh tokens rotate and
expire after 30 days. Honor the returned expiry, serialize refreshes per user, and replace token
pairs together. An uncertain refresh may already have rotated upstream: reconnect instead of
replaying the refresh token.

Use the **user's Utilint access token**, never the client secret or a ChatGPT token, as Bearer
authorization to `GET /v1/models`. Select a returned model and call `POST /v1/chat/completions` or
`POST /v1/responses` at the same origin. Scope model requests and saved output to the app user.
A client ID alone grants no gateway access. On 401/403 require reconnection; on 429 show the usage
limit. Do not automatically retry potentially billable model requests or add a paid API fallback
unless requested. Saved outputs should not cause another model call merely by being reopened.

After token exchange, redirect to a clean app-owned completion page. For a popup, post only a
completion notification to the opener with an exact `targetOrigin`; verify both `event.origin`
and `event.source` in the opener and re-fetch connection status from your backend. Handle popup
cancellation/closure and full-page return. Do not put codes or tokens in messages to the opener.

Link **Manage app access** to `UTILINT_ORIGIN/dashboard`. User revocation invalidates the grant
and its tokens; already-dispatched model requests may finish. Utilint's consent pages require a
popup/top-level browser page: iframes are blocked. Embed a button, not the authentication iframe.

## Verify the integration

Exercise a fresh app user through sign-in, ChatGPT connection, consent, code exchange, and one
gateway response. Also verify existing users/grants, cancellation, popup fallback, state/session
mismatch, replay, restart/refresh, and revoked access. Test concurrent registration and confirmed
client deletion separately from failed lookups and disabled clients. Verify one user's tokens
cannot authorize another user's requests and secrets do not reach the browser.

Use disposable data and real passkey registration/authentication for isolated browser tests;
virtual authenticators are suitable. Replace external model transport for repeatable tests rather
than seeding sessions or weakening authentication. Live authorization and model calls follow the
user's task authorization; do not treat this skill as permission to create accounts or spend
subscription allowance independently.

The executable provider contract in this repo lives in
[OAuth configuration](../../apps/backend/src/lib/auth/better-auth.ts),
[connection routes](../../apps/backend/src/routes/connect.ts), and
[the two-app integration test](../../scripts/e2e-content-use.ts). That test expects Content Use
checked out beside Utilint, both frontends built, and runs with `bun scripts/e2e-content-use.ts`.
[Content Use](https://github.com/massimoalbarello/content-use) is the reference consuming app.

Utilint currently uses the Codex device-code subscription transport. Do not describe this as a
general-purpose OpenAI API key or a public OpenAI third-party subscription-delegation API.
