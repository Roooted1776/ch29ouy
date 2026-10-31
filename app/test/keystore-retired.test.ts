import { describe, expect, it } from 'vitest';
import { KEYS_KEY, openKeys, sealKeys, type Keys } from '../src/lib/keystore';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

const key = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

describe('retired provider credentials', () => {
  it('does not save retired provider keys beside supported keys', async () => {
    const s = storage();
    const kek = await key();
    await sealKeys(s, kek, 'u', { openai: 'fake-openai', github: 'fake-github', freebuff: 'fake-retired' } as Keys);
    expect(await openKeys(s, kek, 'u')).toEqual({ openai: 'fake-openai', github: 'fake-github' });
  });

  it('drops a retired key when opening an older sealed key set', async () => {
    const s = storage();
    const kek = await key();
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: enc.encode('brain-keys-v1|u') },
        kek,
        enc.encode(JSON.stringify({ openai: 'fake-openai', freebuff: 'fake-retired' })),
      ),
    );
    s.setItem(KEYS_KEY, JSON.stringify({ u: { iv: base64(iv), ct: base64(ct) } }));
    expect(await openKeys(s, kek, 'u')).toEqual({ openai: 'fake-openai' });
  });
});
