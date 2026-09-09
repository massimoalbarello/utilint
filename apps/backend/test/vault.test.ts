import { expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { loadEnv } from '../src/lib/env';
import { createVault } from '../src/lib/vault';

test('deployment secret is required and ciphertext is authenticated and owner-bound', () => {
  expect(() => loadEnv({})).toThrow('BETTER_AUTH_SECRET');
  expect(() => loadEnv({ BETTER_AUTH_SECRET: 'short' })).toThrow();
  const vault = createVault(randomBytes(32).toString('hex'));
  const sealed = vault.seal('alice', 'private-provider-token');
  expect(sealed).not.toContain('private-provider-token');
  expect(vault.seal('alice', 'private-provider-token')).not.toBe(sealed);
  expect(vault.open('alice', sealed)).toBe('private-provider-token');
  expect(() => vault.open('bob', sealed)).toThrow();
  expect(() => createVault(randomBytes(32).toString('hex')).open('alice', sealed)).toThrow();
  const parts = sealed.split('.');
  const bytes = Buffer.from(parts[3] ?? '', 'base64');
  bytes[0] = (bytes[0] ?? 0) ^ 1;
  parts[3] = bytes.toString('base64');
  expect(() => vault.open('alice', parts.join('.'))).toThrow();
});
