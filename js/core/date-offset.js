/**
 * Shared helper for resolving relative date offsets in catalog example data
 * so examples stay evergreen (no hard-coded calendar years that go stale).
 *
 * Supported formats — all relative to today:
 *   "+Nd" / "-Nd"  → N days from today
 *   "+NM" / "-NM"  → N months from today, snapped to the LAST day of the
 *                    resulting month (so project-goal targetDates like "+4M"
 *                    land on a clean end-of-month milestone)
 *
 * Any other value (absolute YYYY-MM-DD dates, empty strings, undefined, null,
 * non-string types) passes through unchanged. This means a JSON file may mix
 * absolute and relative dates freely.
 *
 * @param {*} value
 * @returns {*} resolved YYYY-MM-DD string, or the original value if not an offset
 */
export function resolveDateOffset(value) {
  if (typeof value !== 'string') return value;
  const m = value.match(/^([+-])(\d+)([dM])$/);
  if (!m) return value;
  const sign = m[1] === '-' ? -1 : 1;
  const n = sign * parseInt(m[2], 10);
  const now = new Date();
  let d;
  if (m[3] === 'd') {
    d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
  } else { // 'M' — last day of (current month + n)
    d = new Date(now.getFullYear(), now.getMonth() + n + 1, 0);
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Same offset grammar as resolveDateOffset, but returns a Unix epoch (ms)
 * instead of an ISO string — for fields like `createdAt` that store epochs.
 * Non-matching values (including pre-existing numeric epochs) pass through.
 *
 * @param {*} value
 * @returns {*} epoch milliseconds, or the original value if not an offset
 */
export function resolveEpochOffset(value) {
  if (typeof value !== 'string') return value;
  const m = value.match(/^([+-])(\d+)([dM])$/);
  if (!m) return value;
  const sign = m[1] === '-' ? -1 : 1;
  const n = sign * parseInt(m[2], 10);
  const now = new Date();
  if (m[3] === 'd') now.setDate(now.getDate() + n);
  else now.setMonth(now.getMonth() + n);
  return now.getTime();
}
