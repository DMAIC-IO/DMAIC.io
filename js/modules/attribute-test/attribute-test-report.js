/**
 * D.Mike — Attribute Test Module — Report (attribute-test-report.js)
 *
 * Calls the engine for a normalized input and turns the result into display
 * rows. Pure: labels and notes are i18n keys (with params), values are
 * formatted strings.
 */

import {
  oneProportionTest, twoProportionTest, chiSquareAssociation,
  onePoissonRateTest, twoPoissonRateTest, mcNemarTest,
  equivalenceOneProportion, equivalenceTwoProportions,
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
const bound = v => (v === Infinity ? '∞' : fmt(v));
const ci = (lo, hi) => `[${bound(lo)}, ${bound(hi)}]`;

/** Proportion as percentage points with two decimals (no "-0.00"). */
function fmtPp(v) {
  const out = (v * 100).toFixed(2);
  return out === '-0.00' ? '0.00' : out;
}

const MCNEMAR_NOTE = { key: 'notePairedUseMcNemar' };

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
  // Non-significant z-test (two-sided only): "no difference" is not "equivalent".
  const offerEquivalence = state.direction === 'two-sided' && !r.reject;
  if (offerEquivalence) notes.push({ key: 'noteNotEquivalentIsNotEqual' });
  notes.push(MCNEMAR_NOTE);
  const g = norm.groups || ['1', '2'];
  const report = {
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
  if (offerEquivalence) report.actions = [{ key: 'actionCheckEquivalence' }];
  return report;
}

function reportRate1(state, norm) {
  const r = onePoissonRateTest(norm.x, norm.t, norm.lambda0, state.direction, state.alpha);
  const notes = [];
  if (!r.normalApproxOk) notes.push({ key: 'noteRateNormalApprox' });
  missingNote(norm, notes);
  return {
    kind: 'rate1',
    stats: [
      { key: 'counts', labelKey: 'statRateCounts', value: `${norm.x} / ${norm.t}` },
      { key: 'rate', labelKey: 'statRate', value: fmt(r.rate) },
      { key: 'ci', labelKey: 'statCiRate', params: { level: pct(state.alpha) }, value: ci(r.ciLower, r.ciUpper) },
      { key: 'pExact', labelKey: 'statPExactPoisson', value: fmtP(r.pExact) },
      { key: 'z', labelKey: 'statZ', value: fmt(r.z) },
      { key: 'pNormal', labelKey: 'statPNormal', value: fmtP(r.pNormal) },
    ],
    notes,
    decision: r.reject ? 'reject' : 'keep',
    basisKey: 'basisExactPoisson',
    table: null,
  };
}

function reportRate2(state, norm) {
  const r = twoPoissonRateTest(norm.x1, norm.t1, norm.x2, norm.t2, {
    direction: state.direction, alpha: state.alpha, pooled: state.ratePooled, diff0: norm.diff0,
  });
  const notes = [];
  missingNote(norm, notes);
  const g = norm.groups || ['1', '2'];
  const level = pct(state.alpha);
  const stats = [
    { key: 'rate1', labelKey: 'statRateGroup', params: { group: g[0] }, value: fmt(r.rate1) },
    { key: 'rate2', labelKey: 'statRateGroup', params: { group: g[1] }, value: fmt(r.rate2) },
    { key: 'diff', labelKey: 'statRateDiff', value: fmt(r.diff) },
    { key: 'ci', labelKey: 'statCiRateDiff', params: { level }, value: ci(r.ciLower, r.ciUpper) },
    { key: 'z', labelKey: 'statZ', value: fmt(r.z) },
    { key: 'pValue', labelKey: 'statPValue', value: fmtP(r.pValue) },
  ];
  if (r.pExactCond != null) stats.push({ key: 'pExactCond', labelKey: 'statPExactCond', value: fmtP(r.pExactCond) });
  if (r.ratio != null) {
    stats.push(
      { key: 'ratio', labelKey: 'statRateRatio', value: fmt(r.ratio) },
      { key: 'ratioCi', labelKey: 'statCiRatio', params: { level }, value: ci(r.ratioLower, r.ratioUpper) },
    );
  }
  return {
    kind: 'rate2',
    stats,
    notes,
    decision: r.reject ? 'reject' : 'keep',
    basisKey: 'basisZRate',
    table: null,
  };
}

function reportMcNemar(state, norm) {
  const r = mcNemarTest(norm.table, state.direction, state.alpha);
  if (!r.testable) return { error: 'noteNoDiscordant', hint: true };
  const notes = [];
  if (r.smallDiscordant) notes.push({ key: 'noteSmallDiscordant' });
  missingNote(norm, notes);
  const stats = [
    { key: 'discordant', labelKey: 'statDiscordant', value: `${r.b} / ${r.c}` },
    { key: 'pBefore', labelKey: 'statPBefore', value: fmt(r.pBefore) },
    { key: 'pAfter', labelKey: 'statPAfter', value: fmt(r.pAfter) },
    { key: 'diff', labelKey: 'statPairedDiff', value: fmt(r.diff) },
    { key: 'ci', labelKey: 'statCiPairedDiff', params: { level: pct(state.alpha) }, value: ci(r.ciLower, r.ciUpper) },
    { key: 'pExact', labelKey: 'statPExactMcNemar', value: fmtP(r.pExact) },
  ];
  if (r.pChi2 != null) {
    stats.push(
      { key: 'chi2', labelKey: 'statChi2McNemar', value: fmt(r.chi2, 3) },
      { key: 'pChi2', labelKey: 'statPChi2', value: fmtP(r.pChi2) },
      { key: 'chi2Cc', labelKey: 'statChi2McNemarCc', value: fmt(r.chi2Cc, 3) },
      { key: 'pChi2Cc', labelKey: 'statPChi2Cc', value: fmtP(r.pChi2Cc) },
    );
  }
  return {
    kind: 'mcnemar',
    stats,
    notes,
    decision: r.reject ? 'reject' : 'keep',
    basisKey: 'basisExactMcNemar',
    table: null,
  };
}

function reportEquiv(state, norm) {
  const one = norm.samples === 1;
  let r;
  if (one) {
    r = equivalenceOneProportion(norm.x, norm.n, norm.p0, norm.lower, norm.upper, state.alpha);
  } else {
    r = equivalenceTwoProportions(norm.x1, norm.n1, norm.x2, norm.n2, norm.lower, norm.upper, state.alpha);
    if (!r.testable) return { error: 'noteEquivDegenerate', hint: true };
  }
  // 1 sample: absolute proportions (bounds relative to p0, clipped to [0; 1]); 2 samples: the difference.
  const clip = v => Math.min(1, Math.max(0, v));
  const lo = one ? clip(norm.p0 + norm.lower) : norm.lower;
  const up = one ? clip(norm.p0 + norm.upper) : norm.upper;
  const bounds = `[${fmtPp(lo)}; ${fmtPp(up)}]`;
  const notes = [{ key: 'noteEquivBoundsPractical' }];
  if (!r.equivalent) notes.push({ key: 'noteEquivCiOutside' });
  missingNote(norm, notes);
  return {
    kind: 'equiv',
    stats: [
      { key: 'estimate', labelKey: one ? 'statEquivEstimate1' : 'statEquivEstimate2', value: fmtPp(one ? r.pHat : r.diff) },
      { key: 'ci', labelKey: 'statEquivCi', params: { level: pct(2 * state.alpha) }, value: `[${fmtPp(r.ciLower)}; ${fmtPp(r.ciUpper)}]` },
      { key: 'bounds', labelKey: 'statEquivBounds', value: bounds },
      { key: 'pLower', labelKey: 'statPLower', value: fmtP(r.pLower) },
      { key: 'pUpper', labelKey: 'statPUpper', value: fmtP(r.pUpper) },
      { key: 'pValue', labelKey: 'statPTost', value: fmtP(r.pValue) },
    ],
    notes,
    decision: r.equivalent ? 'equivalent' : 'notEquivalent',
    decisionParams: { lower: fmtPp(lo), upper: fmtPp(up), alpha: state.alpha },
    basisKey: 'basisTost',
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
 * @param {{ direction: string, alpha: number, pooled: boolean, ratePooled?: boolean }} state
 * @param {object} norm — result of normalizeSummary / normalizeColumns
 * @returns {object} Report
 */
export function buildReport(state, norm) {
  if (!norm.ok) return norm.hint ? { error: norm.error, hint: true } : { error: norm.error };
  if (norm.kind === 'one') return reportOne(state, norm);
  if (norm.kind === 'two') return reportTwo(state, norm);
  if (norm.kind === 'rate1') return reportRate1(state, norm);
  if (norm.kind === 'rate2') return reportRate2(state, norm);
  if (norm.kind === 'mcnemar') return reportMcNemar(state, norm);
  if (norm.kind === 'equiv') return reportEquiv(state, norm);
  return reportAssoc(state, norm);
}
