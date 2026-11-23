/**
 * D.Mike — Shared Chart Data Prep (chart-data-prep.js)
 *
 * Reusable, byte-faithful building blocks shared by the chart models and
 * engines. Pure functions — NO view logic, NO i18n, NO chartManager / DOM
 * access:
 *
 *   - PALETTE        — the 12-color series palette (mirrors the legacy palette 1:1)
 *   - cleanCat       — category coercion (null/'' → '' else String)
 *   - toNum          — strict numeric coercion (NaN for empty/invalid)
 *   - columnRefFromJSON — strict {instanceId,sheetId,columnId} validator shared
 *                      by the scatter-style plot models (Probability-Plot, XY-Plot)
 */

import { coerceNumeric } from '../worksheet-columns.js';

/** Bar / stack colors — mirrors the legacy PALETTE 1:1. */
export const PALETTE = [
  'rgba(44,95,138,1)', 'rgba(39,174,96,1)', 'rgba(231,76,60,1)',
  'rgba(243,156,18,1)', 'rgba(142,68,173,1)', 'rgba(52,152,219,1)',
  'rgba(230,126,34,1)', 'rgba(26,188,156,1)', 'rgba(241,196,15,1)',
  'rgba(192,57,43,1)', 'rgba(44,62,80,1)', 'rgba(127,140,141,1)',
];

/** Mirror legacy `cleanCat`: null/'' → '' else String(v). */
export function cleanCat(v) {
  return v == null || v === '' ? '' : String(v);
}

/**
 * Strict cell-value coercion (via `coerceNumeric`): NaN for empty or invalid
 * input — a typo'd cell such as "20abc" is invalid, not 20.
 * @param {*} v
 * @returns {number}
 */
export function toNum(v) {
  const n = coerceNumeric(v);
  return n === null ? NaN : n;
}

/**
 * Validate and coerce a strict column reference object.
 * @param {*} d
 * @returns {{ instanceId: string, sheetId: string, columnId: string }|null}
 */
export function columnRefFromJSON(d) {
  if (!d || typeof d !== 'object') return null;
  if (d.instanceId == null || d.sheetId == null || d.columnId == null) return null;
  return {
    instanceId: String(d.instanceId),
    sheetId: String(d.sheetId),
    columnId: String(d.columnId),
  };
}
