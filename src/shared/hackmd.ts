const TOKEN_KEY = 'hackmd_token';
const CRYPTO_KEY = 'hackmd_crypto_key';

async function getCryptoKey(): Promise<CryptoKey> {
  const stored = await chrome.storage.local.get(CRYPTO_KEY);
  let exportedKey = stored[CRYPTO_KEY] as JsonWebKey | undefined;

  if (!exportedKey) {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    exportedKey = await crypto.subtle.exportKey('jwk', key);
    await chrome.storage.local.set({ [CRYPTO_KEY]: exportedKey });
  }

  return await crypto.subtle.importKey(
    'jwk',
    exportedKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function getHackMDToken(): Promise<string | null> {
  const result = await chrome.storage.local.get(TOKEN_KEY);
  const encrypted = result[TOKEN_KEY] as { iv: string; ciphertext: string } | undefined;
  if (!encrypted || !encrypted.iv || !encrypted.ciphertext) return null;

  try {
    const key = await getCryptoKey();
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBuffer(encrypted.iv) },
      key,
      base64ToBuffer(encrypted.ciphertext)
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

export async function hasHackMDToken(): Promise<boolean> {
  return (await getHackMDToken()) !== null;
}

export async function setHackMDToken(token: string): Promise<void> {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedToken = new TextEncoder().encode(token);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodedToken
  );

  await chrome.storage.local.set({
    [TOKEN_KEY]: {
      iv: bufferToBase64(iv),
      ciphertext: bufferToBase64(ciphertext),
    },
  });
}

export async function clearHackMDToken(): Promise<void> {
  await chrome.storage.local.remove(TOKEN_KEY);
}

export interface HackMDPublishResult {
  publishLink: string;
  editLink: string;
}

// Routes the actual HTTP request through the service worker because Chrome
// MV3 extension pages (sidepanel/popup) still hit CORS preflight even with
// host_permissions, but service workers bypass it.
export async function publishToHackMD(
  title: string,
  content: string,
): Promise<HackMDPublishResult> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'PUBLISH_HACKMD', payload: { title, content } },
      (response: { ok: boolean; result?: HackMDPublishResult; error?: string } | undefined) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response) {
          reject(new Error('No response from background'));
          return;
        }
        if (!response.ok) {
          reject(new Error(response.error || 'Unknown HackMD error'));
          return;
        }
        if (!response.result) {
          reject(new Error('HackMD response missing result'));
          return;
        }
        resolve(response.result);
      },
    );
  });
}
