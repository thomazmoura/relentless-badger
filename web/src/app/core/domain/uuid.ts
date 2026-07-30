import { md5 } from './md5';

/**
 * Java's UUID.nameUUIDFromBytes: an MD5 (version 3) name-based UUID.
 *
 * Recurring occurrences derive their id from the series and fire time, so two
 * devices that complete the same occurrence mint the same id and dedupe both
 * locally and through the API's idempotent create. That only works if this
 * agrees with the Android app byte for byte — hence the hand-rolled MD5 and the
 * fixtures in uuid.spec.ts.
 */
export function nameUuidFromBytes(name: string): string {
  const digest = md5(new TextEncoder().encode(name));
  digest[6] = (digest[6] & 0x0f) | 0x30; // version 3
  digest[8] = (digest[8] & 0x3f) | 0x80; // IETF variant
  const hex = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * A random (version 4) UUID. crypto.randomUUID only exists in a secure context,
 * which a plain-http LAN origin is not, so fall back to raw random bytes.
 */
export function randomUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
