# Connect with utilint

Register an app in **Developers** with its exact callback URL and **Connection start URL**.
The start URL is your backend endpoint that begins OAuth for the current app user, for example
`https://your-app.com/auth/utilint/start`. It must use HTTPS (or HTTP localhost), share an origin
with a registered callback, and have no query or fragment. Keep the client secret on your backend.

The dashboard gives you one **Consent URL**. Embed this exact link in your app as a button or
open it from the dashboard to authorize your own account:

```
https://YOUR_UTILINT/connect/CLIENT_ID
```

Opening it redirects to your registered start endpoint. That endpoint checks your app session
(and returns there after app login if needed), creates a fresh OAuth attempt, then redirects back
to Utilint. This follows the app-initiated request pattern described in
[third-party initiated login](https://openid.net/specs/openid-connect-core-1_0.html#ThirdPartyInitiatedLogin).
There is no preview mode: accepting consent creates real app access and returns to your callback
for token exchange. Existing `/connect/CLIENT_ID/test` links redirect to the same real flow.

Your start endpoint creates a random `state` and S256 PKCE verifier, stores both against the
signed-in user's session for at most 10 minutes, and redirects to the consent URL with:

| Query field | Value |
| --- | --- |
| `redirect_uri` | One exact registered callback URL |
| `state` | Fresh random value, 32–256 URL-safe characters |
| `code_challenge` | Base64url SHA-256 of the verifier, without padding |

The URL selects authorization-code flow with `profile ai:invoke offline_access`, the `/v1`
resource, and S256. The bare link always uses the registered start URL; supplying a partial set
of OAuth parameters fails. Never reuse a fixed state/verifier or put the client secret in a URL.
Apps already creating their own attempts can continue opening the parameterized URL directly.
Open either URL in a popup from a user click, with a normal redirect if popups are blocked.

For Content Use, register these endpoints (using your deployment's origin):

```
Connection start URL: https://YOUR_CONTENT_USE/api/utilint/start
Redirect URL:         https://YOUR_CONTENT_USE/api/utilint/callback
```

Existing registered apps can add their start URL under **Connection setup** without changing
client IDs, secrets, grants, or tokens. Only the app's developer can change this setting. The
public link only redirects to the registered address and never exposes credentials.

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
