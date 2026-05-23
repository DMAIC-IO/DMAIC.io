/**
 * DMAIC.io — Makigami duration helpers (makigami-duration.js)
 *
 * Free-text duration parser and canonical formatter for the Makigami module.
 * Time units are configurable per instance — each unit has a label (used as
 * its parser alias) and a factor in seconds.
 *
 * Accepted syntax: zero or more `<number><unit>` tokens separated by
 * whitespace. Numbers accept comma or dot as decimal separator. Unit labels
 * match case-insensitively. Empty input is valid and yields 0.
 *
 * Examples (with defaults s/min/h/d=28800):
 *   ""              → { seconds: 0, valid: true }
 *   "45min"         → { seconds: 2700, valid: true }
 *   "1d 5h 30min"   → { seconds: 48600, valid: true }
 *   "1,5h"          → { seconds: 5400, valid: true }
 *   "1h 1h"         → { seconds: 7200, valid: true }   // additive
 *   "5"             → { seconds: 0, valid: false }     // no unit
 *   "5x"            → { seconds: 0, valid: false }     // unknown unit
 *   "-1h"           → { seconds: 0, valid: false }     // negative
 */

const ERROR_NO_UNITS      = 'no-units';
const ERROR_INVALID_TOKEN = 'invalid-token';
const ERROR_INVALID_NUM   = 'invalid-number';

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeUnits(timeUnits) {
  return (Array.isArray(timeUnits) ? timeUnits : [])
    .filter(u => u
      && typeof u.label === 'string'
      && u.label.length > 0
      && Number.isFinite(Number(u.factorSeconds))
      && Number(u.factorSeconds) > 0);
}

/**
 * Parse a free-text duration string into seconds.
 * @param {string} text - User input, e.g. "1d 5h 30min".
 * @param {Array<{label:string,factorSeconds:number}>} timeUnits - Configured units.
 * @returns {{ seconds: number, valid: boolean, error?: string }}
 */
export function parseDuration(text, timeUnits) {
  if (text == null) return { seconds: 0, valid: true };
  const raw = String(text);
  const s = raw.trim();
  if (s === '') return { seconds: 0, valid: true };

  const units = sanitizeUnits(timeUnits);
  if (units.length === 0) return { seconds: 0, valid: false, error: ERROR_NO_UNITS };

  // Sort by label length desc so "min" wins over "m" when both are defined.
  const sorted = [...units].sort((a, b) => b.label.length - a.label.length);
  const labelPattern = sorted.map(u => escapeRegex(u.label)).join('|');
  // Number: integer or decimal (comma or dot), no sign.
  // Optional whitespace between number and unit label.
  const tokenRe = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${labelPattern})`, 'iy');

  let pos = 0;
  let total = 0;
  const n = s.length;

  while (pos < n) {
    while (pos < n && /\s/.test(s[pos])) pos++;
    if (pos >= n) break;

    tokenRe.lastIndex = pos;
    const m = tokenRe.exec(s);
    if (!m || m.index !== pos) {
      return { seconds: 0, valid: false, error: ERROR_INVALID_TOKEN };
    }

    const num = parseFloat(m[1].replace(',', '.'));
    if (!Number.isFinite(num) || num < 0) {
      return { seconds: 0, valid: false, error: ERROR_INVALID_NUM };
    }

    const label = m[2].toLowerCase();
    const unit = sorted.find(u => u.label.toLowerCase() === label);
    // Cannot happen — pattern is built from `sorted` — but stay defensive.
    if (!unit) return { seconds: 0, valid: false, error: ERROR_INVALID_TOKEN };

    total += num * unit.factorSeconds;
    pos += m[0].length;
  }

  return { seconds: Math.round(total), valid: true };
}

/**
 * Format a duration in seconds back into canonical free-text using the
 * largest available units greedily.
 * @param {number} seconds
 * @param {Array<{label:string,factorSeconds:number}>} timeUnits
 * @returns {string} e.g. "1d 5h 30min". Returns "0" when input is zero/empty.
 */
export function formatDuration(seconds, timeUnits) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const units = sanitizeUnits(timeUnits);

  if (units.length === 0) return `${total}`;
  if (total === 0) {
    const smallest = [...units].sort((a, b) => a.factorSeconds - b.factorSeconds)[0];
    return `0${smallest.label}`;
  }

  const sorted = [...units].sort((a, b) => b.factorSeconds - a.factorSeconds);
  const parts = [];
  let rem = total;

  for (let i = 0; i < sorted.length; i++) {
    const u = sorted[i];
    if (rem >= u.factorSeconds) {
      const isLast = i === sorted.length - 1;
      if (isLast && u.factorSeconds > 1) {
        // No finer-grained unit available — emit fractional value (max 2 decimals).
        const val = rem / u.factorSeconds;
        parts.push(`${Number(val.toFixed(2))}${u.label}`);
        rem = 0;
      } else {
        const k = Math.floor(rem / u.factorSeconds);
        rem -= k * u.factorSeconds;
        parts.push(`${k}${u.label}`);
      }
    }
  }

  if (rem > 0) {
    // Leftover smaller than every unit — emit as fractional smallest.
    const smallest = sorted[sorted.length - 1];
    const val = rem / smallest.factorSeconds;
    parts.push(`${Number(val.toFixed(2))}${smallest.label}`);
  }

  return parts.join(' ');
}

/**
 * Parse then format — useful on blur to normalize user input.
 * Returns the original text unchanged when parsing fails.
 * @param {string} text
 * @param {Array<{label:string,factorSeconds:number}>} timeUnits
 * @returns {{ text: string, seconds: number, valid: boolean }}
 */
export function canonicalize(text, timeUnits) {
  const r = parseDuration(text, timeUnits);
  if (!r.valid) return { text: String(text ?? ''), seconds: 0, valid: false };
  return { text: formatDuration(r.seconds, timeUnits), seconds: r.seconds, valid: true };
}
