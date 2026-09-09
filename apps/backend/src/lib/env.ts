import { resolve } from 'node:path';

export function loadEnv(environment = process.env) {
  const secret = environment.BETTER_AUTH_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32 || secret.trim() !== secret)
    throw new Error(
      'Set BETTER_AUTH_SECRET to a cryptographically random secret of at least 32 characters.',
    );
  const baseUrl = new URL(
    environment.BASE_URL ||
      (environment.NIBRUN_HOSTNAME
        ? `https://${environment.NIBRUN_HOSTNAME}`
        : 'http://localhost:5173'),
  );
  if (
    baseUrl.protocol !== 'https:' &&
    !(baseUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(baseUrl.hostname))
  )
    throw new Error('BASE_URL must use HTTPS, except on localhost.');
  const port = Number(environment.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  return {
    secret,
    baseUrl,
    port,
    dataFolder: resolve(
      environment.NIBRUN_DATA_DIR ||
        (environment.NIBRUN_HOSTNAME ? '/app/data' : environment.DATA_FOLDER || './data'),
    ),
  };
}
