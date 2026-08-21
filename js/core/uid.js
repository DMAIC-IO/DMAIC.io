/**
 * D.Mike — unique id helper (uid.js)
 *
 * `crypto.randomUUID` is gated behind a **secure context**: over plain http on
 * anything but localhost the browser does not expose it at all, and calling it
 * throws `TypeError: crypto.randomUUID is not a function`. The app is served
 * over https in production, but a dev or nightly host reached over http is an
 * ordinary situation — and there the throw took down every code path that
 * creates something, starting with opening a module.
 *
 * `crypto.getRandomValues` carries no such gate, so the fallback below is a
 * real v4 UUID from real random bytes, not a weaker id. `Math.random` is the
 * last resort for an environment that has no `crypto` object whatsoever.
 */

/** Format 16 random bytes as a v4 UUID. */
function _format(bytes) {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;   // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80;   // variant 10xx
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Generate a v4 UUID — in every context, secure or not.
 * @returns {string}
 */
export function uid() {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    if (typeof crypto.getRandomValues === 'function') {
      return _format(crypto.getRandomValues(new Uint8Array(16)));
    }
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return _format(bytes);
}
