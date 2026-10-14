// No look-alike characters (0/o, 1/l/i) so codes are easy to read out loud.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export const ROOM_ID_PATTERN = /^[a-z0-9]{4,16}$/;

export function newRoomId(length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Secret that proves a browser owns a seat. */
export function newToken(): string {
  return crypto.randomUUID();
}