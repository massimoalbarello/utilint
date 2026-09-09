import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export function createVault(secret: string) {
  if (Buffer.byteLength(secret) < 32) throw new Error('A strong deployment secret is required.');
  // Domain separation: Better Auth's signing secret is never used directly as an AES key.
  const key = Buffer.from(hkdfSync('sha256', secret, 'utilint', 'provider-vault-v1', 32));
  const aad = (ownerId: string) => Buffer.from(`utilint:chatgpt:v1:${ownerId}`);
  return {
    seal(ownerId: string, plaintext: string) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      cipher.setAAD(aad(ownerId));
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return [
        'v1',
        nonce.toString('base64'),
        cipher.getAuthTag().toString('base64'),
        encrypted.toString('base64'),
      ].join('.');
    },
    open(ownerId: string, encrypted: string) {
      const [version, nonce, tag, data, extra] = encrypted.split('.');
      if (version !== 'v1' || !nonce || !tag || !data || extra !== undefined)
        throw new Error('Invalid encrypted credential.');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64'));
      decipher.setAAD(aad(ownerId));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}
export type Vault = ReturnType<typeof createVault>;
