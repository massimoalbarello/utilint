import { createApp } from './app.ts';
import { createSqliteDatabase } from './db/client.ts';
import { runMigrations } from './db/migrate.ts';
import { getPublicAssets } from './lib/assets.ts';
import { createAuth } from './lib/auth/better-auth.ts';
import { createChatGPTProvider } from './lib/chatgpt.ts';
import { createChatGPTAuth } from './lib/chatgpt-auth.ts';
import { loadEnv } from './lib/env.ts';
import { createVault } from './lib/vault.ts';
import { createConnectionRepository } from './repositories/sqlite-connections.ts';
import { createDashboardService } from './services/dashboard.ts';
import { createDeveloperService } from './services/developers.ts';
import { createGatewayService } from './services/gateway.ts';
import { createProviderService } from './services/providers.ts';

const env = loadEnv();
const vault = createVault(env.secret);
const database = await createSqliteDatabase({ dataFolder: env.dataFolder });
await runMigrations({ db: database });
const auth = createAuth({ database, baseUrl: env.baseUrl, secret: env.secret });
const repository = createConnectionRepository(database);
const providers = createProviderService({
  repository,
  vault,
  auth: createChatGPTAuth(),
  chatgpt: createChatGPTProvider(),
});
await providers.verifyVault();
const app = createApp({
  auth,
  providers,
  dashboard: createDashboardService(repository, providers),
  developers: createDeveloperService(auth),
  gateway: createGatewayService(repository, providers),
  assets: getPublicAssets(),
  origin: env.baseUrl.origin,
});
app.listen({ hostname: '0.0.0.0', port: env.port });
console.log(`utilint ready on port ${env.port}`);
