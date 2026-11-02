import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || Buffer.byteLength(password) > 1024)
    throw new Error('Password must contain 12–1024 bytes');
  const salt = randomBytes(16).toString('hex');
  return `scrypt-v1$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
// Fixed valid-shaped dummy makes nonexistent accounts perform the same KDF.
export const dummyHash = `scrypt-v1$${'0'.repeat(32)}$${'0'.repeat(128)}`;
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (Buffer.byteLength(password) > 1024) return false;
  const valid = /^scrypt-v1\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(encoded);
  const [, salt, expected] = (valid ? encoded : dummyHash).split('$');
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex')) && valid;
}
