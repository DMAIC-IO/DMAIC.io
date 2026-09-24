/**
 * D.Mike — FMEA Action Priority (fmea-ap.js)
 *
 * AIAG & VDA FMEA Handbook (2019) Action Priority table for DFMEA and PFMEA.
 * Pure lookup: no DOM, no i18n. Verified cell by cell against
 * tests/fixtures/fmea/fmea-ap-table.fixtures.json (source noted there).
 */

/** Severity bands, highest first. Index = first dimension of AP_TABLE. */
export const S_BANDS = [[9, 10], [7, 8], [4, 6], [2, 3], [1, 1]];
/** Occurrence bands, highest first. Index = second dimension of AP_TABLE. */
export const O_BANDS = [[8, 10], [6, 7], [4, 5], [2, 3], [1, 1]];
/** Detection bands, highest first. Index = character position in an AP_TABLE cell. */
export const D_BANDS = [[7, 10], [5, 6], [2, 4], [1, 1]];

/** AP_TABLE[sBand][oBand] → one character per D band (7–10, 5–6, 2–4, 1). */
export const AP_TABLE = [
  ['HHHH', 'HHHH', 'HHHM', 'HMLL', 'LLLL'], // S 9–10
  ['HHHH', 'HHHM', 'HMMM', 'MMLL', 'LLLL'], // S 7–8
  ['HHMM', 'MMML', 'MLLL', 'LLLL', 'LLLL'], // S 4–6
  ['MMLL', 'LLLL', 'LLLL', 'LLLL', 'LLLL'], // S 2–3
  ['LLLL', 'LLLL', 'LLLL', 'LLLL', 'LLLL'], // S 1
];

/** Sort rank per AP level (higher = more urgent). */
export const AP_RANK = { H: 3, M: 2, L: 1 };

/** AP level → category key shared with the RPN CSS variants. */
export const AP_CATEGORY = { H: 'high', M: 'medium', L: 'low' };

/**
 * @param {*} v number or numeric string
 * @returns {number|null} integer 1–10, else null
 */
function toRating(v) {
  let n = NaN;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

/** @param {number[][]} bands @param {number} v @returns {number} band index */
function bandIndex(bands, v) {
  return bands.findIndex(([lo, hi]) => v >= lo && v <= hi);
}

/**
 * Action Priority for one S/O/D combination.
 * @param {number|string} s Severity 1–10
 * @param {number|string} o Occurrence 1–10
 * @param {number|string} d Detection 1–10
 * @returns {'H'|'M'|'L'|null} null if any value is missing or out of range
 */
export function actionPriority(s, o, d) {
  const S = toRating(s), O = toRating(o), D = toRating(d);
  if (S == null || O == null || D == null) return null;
  return AP_TABLE[bandIndex(S_BANDS, S)][bandIndex(O_BANDS, O)][bandIndex(D_BANDS, D)];
}

/**
 * @param {number[]} band [lo, hi]
 * @returns {string} '1' or '7–10'
 */
export function bandLabel([lo, hi]) {
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}
