import assert from 'node:assert/strict';
import test from 'node:test';
import { clearHackMDToken, getHackMDToken, hasHackMDToken, setHackMDToken } from '../src/shared/hackmd.ts';

test('HackMD API token is encrypted in storage and can be decrypted', async () => {
  const localStore = new Map<string, any>();
  const sessionStore = new Map<string, any>();

  const chrome = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: localStore.get(key) }),
        set: async (obj: Record<string, any>) => {
          for (const [k, v] of Object.entries(obj)) localStore.set(k, v);
        },
        remove: async (key: string) => { localStore.delete(key); },
      },
      session: {
        get: async (key: string) => ({ [key]: sessionStore.get(key) }),
        set: async (obj: Record<string, any>) => {
          for (const [k, v] of Object.entries(obj)) sessionStore.set(k, v);
        },
      }
    }
  };

  const { webcrypto } = await import('node:crypto');

  Object.defineProperty(global, 'crypto', { value: webcrypto, configurable: true });
  (global as any).chrome = chrome;
  const btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
  const atob = (b64: string) => Buffer.from(b64, 'base64').toString('binary');
  (global as any).btoa = btoa;
  (global as any).atob = atob;

  await setHackMDToken('test-token-123');

  const encryptedPayload = localStore.get('hackmd_token');

  // Verify the plaintext is NOT in storage
  assert.notEqual(encryptedPayload, 'test-token-123');
  assert.ok(typeof encryptedPayload === 'object');
  assert.ok(encryptedPayload.iv);
  assert.ok(encryptedPayload.ciphertext);

  // Verify we can retrieve it
  const retrievedToken = await getHackMDToken();
  assert.equal(retrievedToken, 'test-token-123');

  // Verify hasHackMDToken works
  const hasToken = await hasHackMDToken();
  assert.equal(hasToken, true);

  // Verify clear works
  await clearHackMDToken();
  assert.equal(localStore.get('hackmd_token'), undefined);
  assert.equal(await hasHackMDToken(), false);
  assert.equal(await getHackMDToken(), null);
});
