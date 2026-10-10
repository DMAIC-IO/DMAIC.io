/**
 * D.Mike — local calendar dates (local-date.js)
 *
 * ISO `YYYY-MM-DD` strings in the user's local time zone. Unlike
 * `toISOString().slice(0, 10)` these never jump to yesterday's UTC date
 * shortly after midnight.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, '0');

/**
 * Local date of `now` as `YYYY-MM-DD`.
 * @param {Date} [now]
 * @returns {string}
 */
export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Add whole days to an ISO date (negative values go back).
 * @param {string} iso `YYYY-MM-DD`
 * @param {number} days
 * @returns {string}
 */
export function addDaysISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return todayISO(new Date(y, m - 1, d + days));
}

/**
 * True for a `YYYY-MM-DD` string.
 * @param {unknown} s
 * @returns {boolean}
 */
export function isIsoDate(s) {
  return typeof s === 'string' && ISO_DATE.test(s);
}
