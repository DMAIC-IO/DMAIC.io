/**
 * D.Mike — Attribute Test Module — Report (attribute-test-report.js)
 *
 * Calls the engine for a normalized input and turns the result into display
 * rows. Pure: labels and notes are i18n keys (with params), values are
 * formatted strings.
 */

import {
  oneProportionTest, twoProportionTest, chiSquareAssociation,
} from '../../engines/attribute-test-engine.js';

/** @param {number|null} v @param {number} [d] @returns {string} */
export function fmt(v, d = 4) {
  return v != null && Number.isFinite(v) ? v.toFixed(d) : '–';
}

/** p-value: four decimals, tiny values as "< 0.0001". */
export function fmtP(v) {
  if (v == null || !Number.isFinite(v)) return '–';
  return v < 0.0001 ? '< 0.0001' : v.toFixed(4);
}

const pct = (alpha) => Math.round((1 - alpha) * 1000) / 10;
const ci = (lo, hi) => `[${fmt(lo)}, ${fmt(hi)}]`;

function missingNote(norm, notes) {
  if (norm.missing > 0) notes.push({ key: 'noteMissing', params: { count: norm.missing } });
}

function reportOne(state, norm) {
  const r = oneProportionTest(norm.x, norm.n, norm.p0, state.direction, state.alpha);
  const notes = [];
  if (!r.normalApproxOk) notes.push({ key: 'noteNormalApprox' });
  missingNote(norm, notes);
  return {
    kind: 'one',
    stats: [
      { key: 'counts', labelKey: 'statCounts', value: `${norm.x} / ${norm.n}` },
      { key: 'pHat', labelKey: 'statPHat', value: fmt(r.pHat) },
      { key: 'ci', labelKey: 'statCi', params: { level: pct(state.alpha) }, value: ci(r.ciLower, r.ciUpper) },
      { key: 'pExact', labelKey: 'statPExact', value: fmtP(r.pExact) },
      { key: 'z', labelKey: 'statZ', value: fmt(r.z) },
      { key: 'pNormal', labelKey: 'statPNormal', value: fmtP(r.pNormal) },
    ],
    notes,
    decision: r.reject ? 'reject' : 'keep',
    basisKey: 'basisExact',
    table: null,
  };
}

function reportTwo(state, norm) {
  const r = twoProportionTest(norm.x1, norm.n1, norm.x2, norm.n2, state.direction, state.alpha, state.pooled);
  const notes = [];
  if (state.pooled) notes.push({ key: 'notePooled' });
  missingNote(norm, notes);
  const g = norm.groups || ['1', '2'];
  return {
    kind: 'two',
    stats: [
      { key: 'counts1', labelKey: 'statCountsGroup', params: { group: g[0] }, value: `${norm.x1} / ${norm.n1}` },
      { key: 'counts2', labelKey: 'statCountsGroup', params: { group: g[1] }, value: `${norm.x2} / ${norm.n2}` },
      { key: 'p1', labelKey: 'statPGroup', params: { group: g[0] }, value: fmt(r.p1) },
      { key: 'p2', labelKey: 'statPGroup', params: { group: g[1] }, value: fmt(r.p2) },
      { key: 'diff', labelKey: 'statDiff', value: fmt(r.diff) },
      { key: 'ci', labelKey: 'statCiDiff', params: { level: pct(state.alpha) }, value: ci(r.ciLower, r.ciUpper) },
      { key: 'z', labelKey: 'statZ', value: fmt(r.z) },
      { key: 'pValue', labelKey: 'statPValue', value: fmtP(r.pValue) },
      { key: 'pFisher', labelKey: 'statPFisher', value: fmtP(r.pFisher) },
    ],
    notes,
    decision: r.reject ? 'reject' : 'keep',
    basisKey: 'basisZ',
    table: null,
  };
}

/** Fisher p-value for the chosen alternative (2×2 tables only). */
function fisherP(direction, r) {
  if (direction === 'greater') return r.fisherGreater;
  if (direction === 'less') return r.fisherLess;
  return r.fisherTwoSided;
}

/** Label key naming the Fisher alternative. */
function fisherLabel(direction) {
  if (direction === 'greater') return 'statPFisherGreater';
  if (direction === 'less') return 'statPFisherLess';
  return 'statPFisher';
}

function reportAssoc(state, norm) {
  const r = chiSquareAssociation(norm.counts, state.alpha);
  if (!r.testable) return { error: 'errTableTooSmall' };
  const rows = norm.rows.filter((_, i) => !r.droppedRows.includes(i));
  const cols = norm.cols.filter((_, j) => !r.droppedCols.includes(j));
  const notes = [];
  const droppedNames = [
    ...r.droppedRows.map(i => norm.rows[i]),
    ...r.droppedCols.map(j => norm.cols[j]),
  ];
  if (droppedNames.length) notes.push({ key: 'noteDropped', params: { names: droppedNames.join(', ') } });
  if (r.warnExpectedBelow1) notes.push({ key: 'warnExpectedBelow1' });
  if (r.warnShareBelow5) notes.push({ key: 'warnShareBelow5', params: { share: Math.round(r.shareBelow5 * 100) } });
  missingNote(norm, notes);
  const stats = [
    { key: 'pearson', labelKey: 'statPearson', params: { df: r.df }, value: fmt(r.pearson, 3) },
    { key: 'pPearson', labelKey: 'statPValue', value: fmtP(r.pPearson) },
    { key: 'lr', labelKey: 'statLr', params: { df: r.df }, value: fmt(r.lr, 3) },
    { key: 'pLR', labelKey: 'statPLr', value: fmtP(r.pLR) },
  ];
  if (r.yates != null) {
    stats.push(
      { key: 'yates', labelKey: 'statYates', value: fmt(r.yates, 3) },
      { key: 'pYates', labelKey: 'statPYates', value: fmtP(r.pYates) },
      { key: 'pFisher', labelKey: fisherLabel(state.direction), value: fmtP(fisherP(state.direction, r)) },
    );
  }
  return {
    kind: 'assoc',
    stats,
    notes,
    decision: r.reject ? 'reject' : 'keep',
    basisKey: 'basisPearson',
    table: {
      cols,
      rows: rows.map((name, i) => ({
        name,
        cells: r.observed[i].map((o, j) => ({
          obs: String(o),
          exp: fmt(r.expected[i][j], 2),
          contrib: fmt(r.contributions[i][j], 3),
        })),
      })),
    },
  };
}

/**
 * Build the display report for a normalized input.
 * @param {{ direction: string, alpha: number, pooled: boolean }} state
 * @param {object} norm — result of normalizeSummary / normalizeColumns
 * @returns {object} Report
 */
export function buildReport(state, norm) {
  if (!norm.ok) return norm.hint ? { error: norm.error, hint: true } : { error: norm.error };
  if (norm.kind === 'one') return reportOne(state, norm);
  if (norm.kind === 'two') return reportTwo(state, norm);
  return reportAssoc(state, norm);
}
