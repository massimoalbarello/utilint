import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export function createVault(deploymentSecret: string) {
  if (Buffer.byteLength(deploymentSecret) < 32)
    throw new Error('A strong deployment secret is required.');
  // Intentionally use BETTER_AUTH_SECRET as the root so deployers manage one random secret.
  // HKDF derives a vault-only AES key instead of reusing Better Auth's signing secret as a key
  // for encryption (RFC 5869, section 3.2). The salt and purpose label are public, fixed inputs.
  // They define the v1 key: changing either requires re-encrypting stored credentials.
  // This separates key uses, not compromise or rotation: the root secret affects both systems.
  const encryptionKey = Buffer.from(
    hkdfSync('sha256', deploymentSecret, 'utilint', 'provider-vault-v1', 32),
  );
  const aad = (ownerId: string) => Buffer.from(`utilint:chatgpt:v1:${ownerId}`);
  return {
    seal(ownerId: string, plaintext: string) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', encryptionKey, nonce);
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
      const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(nonce, 'base64'));
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
