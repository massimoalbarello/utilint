import { getOAuthProviderApi, type OAuthOptions, oauthProvider } from '@better-auth/oauth-provider';
import { passkey } from '@better-auth/passkey';
import { bunSqlAdapter } from '@ilbertt/better-auth-bun-sql';
import { betterAuth } from 'better-auth';
import { APIError, createAuthEndpoint, getAuthoritativeSessionFromCtx } from 'better-auth/api';
import type { SQL } from 'bun';
import { z } from 'zod';

export function createAuth({
  database,
  baseUrl,
  secret,
}: {
  database: SQL;
  baseUrl: URL;
  secret: string;
}) {
  const resource = `${baseUrl.origin}/v1`;
  const oauthOptions = {
    loginPage: '/login',
    consentPage: '/authorize',
    scopes: ['profile', 'ai:invoke', 'offline_access'],
    resources: [
      { identifier: resource, name: 'Utilint gateway', allowedScopes: ['profile', 'ai:invoke'] },
    ],
    clientRegistrationDefaultResources: [resource],
    clientRegistrationRequirePKCE: true,
    grantTypes: ['authorization_code', 'refresh_token'],
    disableJwtPlugin: true,
    allowDynamicClientRegistration: false,
    allowUnauthenticatedClientRegistration: false,
    clientRegistrationDefaultScopes: ['profile', 'ai:invoke', 'offline_access'],
    resourcePrivileges: () => false,
    accessTokenExpiresIn: 900,
    refreshTokenExpiresIn: 2_592_000,
    refreshTokenReuseInterval: 0,
    clientPrivileges: ({ user, action }) =>
      Boolean(user) && action !== 'configure-client-credentials-scopes',
  } satisfies OAuthOptions<['profile', 'ai:invoke', 'offline_access']>;
  const auth = betterAuth({
    appName: 'Utilint',
    baseURL: baseUrl.origin,
    basePath: '/api/auth',
    secret,
    database: bunSqlAdapter({ sql: database, tablesPrefix: 'auth_' }),
    disabledPaths: [
      '/utilint/verify-token',
      '/oauth2/delete-consent',
      '/oauth2/update-consent',
      '/oauth2/create-client',
      '/oauth2/update-client',
    ],
    rateLimit: { enabled: true, window: 60, max: 100 },
    plugins: [
      passkey({
        rpID: baseUrl.hostname,
        rpName: 'Utilint',
        origin: baseUrl.origin,
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        registration: {
          requireSession: false,
          resolveUser: () => {
            const id = Bun.randomUUIDv7();
            return { id, name: `utilint-${id}`, displayName: 'Utilint member' };
          },
          afterVerification: async ({ ctx, verification, user }) => {
            if (!verification.registrationInfo?.userVerified)
              throw APIError.from('UNAUTHORIZED', {
                code: 'user_verification_required',
                message: 'Verify your identity with your passkey.',
              });
            const existing = await ctx.context.internalAdapter.findUserById(user.id);
            const session = await getAuthoritativeSessionFromCtx(ctx);
            if (existing && session?.user.id !== user.id)
              throw APIError.from('FORBIDDEN', {
                code: 'session_required',
                message: 'Sign in to add a passkey.',
              });
            if (!existing) {
              await ctx.context.internalAdapter.createUser(
                {
                  id: user.id,
                  name: 'Utilint member',
                  email: `${user.id}@users.utilint.invalid`,
                  emailVerified: false,
                },
                { method: 'passkey' },
              );
            }
            return { userId: user.id };
          },
        },
        authentication: {
          afterVerification: ({ verification }) => {
            if (!verification.authenticationInfo.userVerified)
              throw APIError.from('UNAUTHORIZED', {
                code: 'user_verification_required',
                message: 'User verification is required.',
              });
          },
        },
      }),
      oauthProvider(oauthOptions),
      {
        id: 'utilint-gateway-verifier',
        endpoints: {
          verifyGatewayToken: createAuthEndpoint(
            '/utilint/verify-token',
            { method: 'POST', body: z.object({ token: z.string() }) },
            async (ctx) => {
              const claims = await getOAuthProviderApi(ctx, oauthOptions).requireActiveAccessToken(
                ctx.body.token,
              );
              const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
              if (
                !audiences.includes(resource) ||
                !String(claims.scope ?? '')
                  .split(' ')
                  .includes('ai:invoke') ||
                !claims.sub ||
                !claims.client_id ||
                claims.cnf
              ) {
                throw APIError.from('UNAUTHORIZED', {
                  code: 'invalid_token',
                  message: 'A user access token for the Utilint gateway is required.',
                });
              }
              return { ownerId: String(claims.sub), clientId: String(claims.client_id) };
            },
          ),
        },
      },
    ],
    advanced: { database: { generateId: () => Bun.randomUUIDv7() } },
  });
  return {
    handler: auth.handler,
    api: {
      getSession: auth.api.getSession,
      verifyGatewayToken: auth.api.verifyGatewayToken,
      createOAuthClient: auth.api.createOAuthClient,
      getOAuthClients: auth.api.getOAuthClients,
      rotateClientSecret: auth.api.rotateClientSecret,
      deleteOAuthClient: auth.api.deleteOAuthClient,
      getOAuthClientPublic: auth.api.getOAuthClientPublic,
    },
  };
}
export type Auth = ReturnType<typeof createAuth>;
