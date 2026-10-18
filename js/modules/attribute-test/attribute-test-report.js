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

/**
 * Die Zeilenschlüssel der Statistiktabelle je Art des Tests. Die Vorlage
 * hängt an jede Zeile den Hilfeschlüssel `modules.attribute-test.stats.<art>.<schlüssel>`
 * erst zur Laufzeit an; das Tor in `agent-data.test.mjs` zählt ihn hier ab.
 * Bei `assoc` erscheinen die drei Yates-/Fisher-Zeilen nur bei 2×2-Tabellen.
 */
export const STAT_ROWS = Object.freeze({
  one: Object.freeze(['counts', 'pHat', 'ci', 'pExact', 'z', 'pNormal']),
  two: Object.freeze(['counts1', 'counts2', 'p1', 'p2', 'diff', 'ci', 'z', 'pValue', 'pFisher']),
  assoc: Object.freeze(['pearson', 'pPearson', 'lr', 'pLR', 'yates', 'pYates', 'pFisher']),
});

/**
 * Eine Zeile der Statistiktabelle; der Schlüssel muss in `STAT_ROWS[kind]` stehen.
 * @param {'one'|'two'|'assoc'} kind
 * @param {string} key
 * @param {string} labelKey
 * @param {string} value
 * @param {object} [params]
 * @returns {{ key: string, labelKey: string, params?: object, value: string }}
 */
function statRow(kind, key, labelKey, value, params) {
  if (!STAT_ROWS[kind].includes(key)) throw new Error(`STAT_ROWS.${kind} kennt „${key}“ nicht`);
  return params ? { key, labelKey, params, value } : { key, labelKey, value };
}

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
      statRow('one', 'counts', 'statCounts', `${norm.x} / ${norm.n}`),
      statRow('one', 'pHat', 'statPHat', fmt(r.pHat)),
      statRow('one', 'ci', 'statCi', ci(r.ciLower, r.ciUpper), { level: pct(state.alpha) }),
      statRow('one', 'pExact', 'statPExact', fmtP(r.pExact)),
      statRow('one', 'z', 'statZ', fmt(r.z)),
      statRow('one', 'pNormal', 'statPNormal', fmtP(r.pNormal)),
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
      statRow('two', 'counts1', 'statCountsGroup', `${norm.x1} / ${norm.n1}`, { group: g[0] }),
      statRow('two', 'counts2', 'statCountsGroup', `${norm.x2} / ${norm.n2}`, { group: g[1] }),
      statRow('two', 'p1', 'statPGroup', fmt(r.p1), { group: g[0] }),
      statRow('two', 'p2', 'statPGroup', fmt(r.p2), { group: g[1] }),
      statRow('two', 'diff', 'statDiff', fmt(r.diff)),
      statRow('two', 'ci', 'statCiDiff', ci(r.ciLower, r.ciUpper), { level: pct(state.alpha) }),
      statRow('two', 'z', 'statZ', fmt(r.z)),
      statRow('two', 'pValue', 'statPValue', fmtP(r.pValue)),
      statRow('two', 'pFisher', 'statPFisher', fmtP(r.pFisher)),
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
    statRow('assoc', 'pearson', 'statPearson', fmt(r.pearson, 3), { df: r.df }),
    statRow('assoc', 'pPearson', 'statPValue', fmtP(r.pPearson)),
    statRow('assoc', 'lr', 'statLr', fmt(r.lr, 3), { df: r.df }),
    statRow('assoc', 'pLR', 'statPLr', fmtP(r.pLR)),
  ];
  if (r.yates != null) {
    stats.push(
      statRow('assoc', 'yates', 'statYates', fmt(r.yates, 3)),
      statRow('assoc', 'pYates', 'statPYates', fmtP(r.pYates)),
      statRow('assoc', 'pFisher', fisherLabel(state.direction), fmtP(fisherP(state.direction, r))),
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
