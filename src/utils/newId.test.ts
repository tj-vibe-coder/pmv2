import { webcrypto } from 'crypto';
import { newId } from './newId';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const realCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
const setCrypto = (value: unknown) => Object.defineProperty(globalThis, 'crypto', { configurable: true, value });
afterEach(() => { if (realCrypto) Object.defineProperty(globalThis, 'crypto', realCrypto); });

it('uses crypto.randomUUID when the page allows it', () => {
  setCrypto({ randomUUID: () => 'from-randomUUID' });
  expect(newId()).toBe('from-randomUUID');
});

it('still works on an insecure page, where randomUUID is missing (the "crypto.randomUUID is not a function" case)', () => {
  setCrypto({ getRandomValues: (a: Uint8Array) => { a.forEach((_, i) => { a[i] = (i * 17 + 3) % 256; }); return a; } });
  const id = newId();
  expect(id).toMatch(UUID_V4);
});

it('gives different ids each time without any crypto at all', () => {
  setCrypto(undefined);
  const ids = new Set(Array.from({ length: 50 }, () => newId()));
  expect(ids.size).toBe(50);
});

it('ids from the fallback are valid v4 UUIDs for real random bytes too', () => {
  setCrypto({ getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
  for (let i = 0; i < 20; i += 1) expect(newId()).toMatch(UUID_V4);
});
