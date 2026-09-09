# Connect with utilint

Register **one client per hosted app**, not per end user. Your backend can do this automatically
using RFC 7591 dynamic client registration, without a Utilint account:

```http
POST /api/auth/oauth2/register
Content-Type: application/json

{
  "client_name": "Your app",
  "redirect_uris": ["https://your-app.com/api/utilint/callback"],
  "application_type": "web",
  "token_endpoint_auth_method": "client_secret_basic",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "scope": "profile ai:invoke offline_access"
}
```

Persist the returned `client_id` and one-time `client_secret` securely on the backend and reuse
them for every user and across restarts. Use a maintained OAuth library for registration and
code exchange. Registration creates an app identity; it does not grant access to any user.
Each user must sign in, connect ChatGPT, and approve the app. The app name is self-declared;
the consent page also shows the registered callback's host.

Only confidential backend clients using `client_secret_basic` are supported. Registration is
limited to five requests per minute per IP, at most 10 exact callback URLs, and a name up to 80
characters. HTTPS callbacks are required for web apps; localhost development uses
`application_type: native`. S256 PKCE remains required. No client credentials grant is enabled.
Discovery advertises the registration endpoint in the OAuth authorization-server metadata.

Alternatively, the developer can register the app once in **Developers** and save its one-time
secret on their backend. End users never need the developer dashboard. The exact **Callback URL**
handles both starting the connection and receiving authorization. No separate start URL is needed.

Build the **Consent URL** from the returned client ID (the dashboard also shows it for manually registered apps). Embed this exact link in your app as a button or
open it from the dashboard to authorize your own account:

```
https://YOUR_UTILINT/connect/CLIENT_ID
```

Opening it redirects to the first registered callback with `utilint_connect=1` appended.
Existing fixed callback query parameters are preserved. The callback must distinguish two cases:

1. **Connection request:** `utilint_connect=1`, with no authorization-response parameters. Check
   the app session (return here after app login if needed), create fresh state and PKCE, and
   redirect to Utilint as described below. Apart from the initiation marker, only fixed query
   parameters from the registered callback may be present. Reserve `utilint_connect` for Utilint.
2. **Authorization response:** no initiation marker. Validate and consume the pending attempt,
   then exchange the code. Cancellation, missing state, malformed responses, or a response mixed
   with the initiation marker must fail; they must never start a new connection automatically.

For every connection request, create a random `state` and S256 PKCE verifier and store both
against the signed-in app user's session for at most 10 minutes. Redirect to the consent URL with:

| Query field | Value |
| --- | --- |
| `redirect_uri` | The exact registered callback, **without** `utilint_connect=1` |
| `state` | Fresh random value, 32–256 URL-safe characters |
| `code_challenge` | Base64url SHA-256 of the verifier, without padding |

The URL selects authorization-code flow with `profile ai:invoke offline_access`, the `/v1`
resource, and S256. The bare link uses the registered callback; supplying a partial set of OAuth
parameters fails. Never reuse a fixed state/verifier or put the client secret in a URL.
Apps already creating their own attempts can continue opening the parameterized URL directly.
Open either URL in a popup from a user click, with a normal redirect if popups are blocked.

For Content Use, the only URL to register is:

```
https://YOUR_CONTENT_USE/api/utilint/callback
```

Existing registrations use their saved callback automatically; client IDs, secrets, grants, and
tokens do not change. The public link never exposes credentials. Accepting consent grants real
app access and returns to the callback for token exchange. Old `/connect/CLIENT_ID/test` links
redirect to the same real flow.

The hosted flow checks the session, offers passkey sign-in or signup, connects ChatGPT if needed,
and asks for consent. Existing connections skip completed steps. An existing app grant shows
**already authorized** and a Continue button. It does not silently grant new scopes.

At the callback, validate `state` against the initiating session and the `iss` parameter against
`https://YOUR_UTILINT/api/auth`. Consume the pending attempt once, including on cancellation.
Use a maintained OAuth client such as oauth4webapi to exchange `code` plus `code_verifier` at
`POST /api/auth/oauth2/token`, using `client_secret_basic`, `grant_type=authorization_code`,
the same `redirect_uri`, and `resource=https://YOUR_UTILINT/v1`.

Store the returned access and refresh tokens encrypted on your backend, scoped to your user.
Access tokens expire after 15 minutes; refresh tokens rotate and expire after 30 days.
Serialize refreshes for a user and replace both tokens together. A rejected/uncertain refresh
requires reconnecting. Call `GET /v1/models` with the access token, then send model requests to
`POST /v1/chat/completions` or `POST /v1/responses` using Bearer authorization.

The callback can redirect to a clean same-origin completion page. For popup integration, send
only a completion notification to your opener with an exact `targetOrigin`; the opener must
check both `event.origin` and `event.source`. Tokens and authorization codes never belong in a
postMessage, browser storage, or frontend JavaScript. The backend must still validate its own
connection before issuing a model request.

The consent page deliberately runs in a popup/top-level page. Iframes remain blocked to prevent
clickjacking and avoid third-party-cookie/passkey restrictions. Apps can embed a button or link
without hosting authentication UI. For a native app, launch the same flow in the system browser.
This version expects an app backend; it does not distribute client secrets to public clients.

See [Content Use](https://github.com/massimoalbarello/content-use) for a complete integration with
Settings, popup cancellation, transcript summaries, encrypted storage and token refresh.

To rerun the two-app browser test, check out both integration branches in sibling `utilint` and
`content-use` directories, install dependencies and build both frontends. From `utilint`, run
`bun scripts/e2e-content-use.ts`. It uses disposable databases and ephemeral passkeys on localhost
ports 4360/4361, with only the external ChatGPT transport and media worker replaced. It covers
signup, connection, consent, server token exchange, a dashboard summary and an existing grant.
Screenshots are written to the ignored `outputs` directory.

## Security boundaries

Utilint retains ChatGPT credentials. Each app gets an audience-bound token for its grant and user.
The OAuth provider validates signed/expiring requests, exact callbacks, PKCE, and code exchange.
The gateway independently checks an active grant on each request. Revoking an app removes its
consent, access tokens, refresh tokens and unexchanged codes. Already-dispatched requests may finish.
The ChatGPT connection is checked server-side before accepting consent.

The connection step uses Utilint's existing Codex device-code transport. This is distinct from a
general-purpose OpenAI API credential or a public OpenAI third-party subscription delegation API.
See [OpenAI authentication](https://learn.chatgpt.com/docs/auth#openai-authentication).

Design references: [OAuth security BCP](https://www.rfc-editor.org/rfc/rfc9700.html) and
[Better Auth OAuth provider](https://better-auth.com/docs/plugins/oauth-provider).
