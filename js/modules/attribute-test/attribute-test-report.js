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

/**
 * Rate-scale value: at least four decimals (as `fmt`), more for small values so
 * that four significant digits survive; exponent notation below 1e-5.
 * @param {number|null} v @returns {string}
 */
export function fmtRate(v) {
  if (v == null || !Number.isFinite(v)) return '–';
  if (v === 0) return v.toFixed(4);
  const mag = Math.floor(Math.log10(Math.abs(v)));
  if (mag < -5) return v.toExponential(3);
  return v.toFixed(Math.max(4, 3 - mag));
}

/** Exposure or other free number: no floating-point noise (0.30000000000000004 → 0.3). */
const fmtNum = v => String(Number(v.toPrecision(10)));

const pct = (alpha) => Math.round((1 - alpha) * 1000) / 10;
const bound = (v, f) => (v === Infinity ? '∞' : v === -Infinity ? '−∞' : f(v));
const ci = (lo, hi, f = fmt) => `[${bound(lo, f)}, ${bound(hi, f)}]`;

/** Proportion as percentage points with two decimals (no "-0.00"). */
function fmtPp(v) {
  const out = (v * 100).toFixed(2);
  return out === '-0.00' ? '0.00' : out;
}

const MCNEMAR_NOTE = { key: 'notePairedUseMcNemar' };

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
  // Non-significant z-test (two-sided only): "no difference" is not "equivalent".
  const offerEquivalence = state.direction === 'two-sided' && !r.reject;
  if (offerEquivalence) notes.push({ key: 'noteNotEquivalentIsNotEqual' });
  notes.push(MCNEMAR_NOTE);
  const g = norm.groups || ['1', '2'];
  const report = {
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
      { key: 'counts', labelKey: 'statRateCounts', value: `${norm.x} / ${fmtNum(norm.t)}` },
      { key: 'rate', labelKey: 'statRate', value: fmtRate(r.rate) },
      { key: 'ci', labelKey: 'statCiRate', params: { level: pct(state.alpha) }, value: ci(r.ciLower, r.ciUpper, fmtRate) },
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
  if (!r.testable) return { error: 'noteRateNotTestable', hint: true };
  const notes = [];
  // The pooled variance only exists for H₀: Δ = 0; with a shifted H₀ the setting has no effect.
  if (state.ratePooled && norm.diff0 !== 0) notes.push({ key: 'noteRatePooledIgnored' });
  missingNote(norm, notes);
  const g = norm.groups || ['1', '2'];
  const level = pct(state.alpha);
  const stats = [
    { key: 'rate1', labelKey: 'statRateGroup', params: { group: g[0] }, value: fmtRate(r.rate1) },
    { key: 'rate2', labelKey: 'statRateGroup', params: { group: g[1] }, value: fmtRate(r.rate2) },
    { key: 'diff', labelKey: 'statRateDiff', value: fmtRate(r.diff) },
    { key: 'ci', labelKey: 'statCiRateDiff', params: { level }, value: ci(r.ciLower, r.ciUpper, fmtRate) },
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
  const lb = String((norm.labels && norm.labels.before) || '').trim();
  const la = String((norm.labels && norm.labels.after) || '').trim();
  const stats = [
    { key: 'discordant', labelKey: 'statDiscordant', value: `${r.b} / ${r.c}` },
    lb ? { key: 'pBefore', labelKey: 'statPBeforeLabeled', params: { label: lb }, value: fmt(r.pBefore) }
      : { key: 'pBefore', labelKey: 'statPBefore', value: fmt(r.pBefore) },
    la ? { key: 'pAfter', labelKey: 'statPAfterLabeled', params: { label: la }, value: fmt(r.pAfter) }
      : { key: 'pAfter', labelKey: 'statPAfter', value: fmt(r.pAfter) },
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
  // 1 sample: absolute proportions in %; 2 samples: a difference in percentage points.
  const unit = one ? '%' : 'pp';
  const g = norm.groups || ['1', '2'];
  const counts = one
    ? [{ key: 'counts', labelKey: 'statCounts', value: `${norm.x} / ${norm.n}` }]
    : [
      { key: 'counts1', labelKey: 'statCountsGroup', params: { group: g[0] }, value: `${norm.x1} / ${norm.n1}` },
      { key: 'counts2', labelKey: 'statCountsGroup', params: { group: g[1] }, value: `${norm.x2} / ${norm.n2}` },
    ];
  const notes = [{ key: 'noteEquivBoundsPractical' }];
  if (!r.equivalent) notes.push({ key: 'noteEquivCiOutside' });
  missingNote(norm, notes);
  return {
    kind: 'equiv',
    stats: [
      ...counts,
      { key: 'estimate', labelKey: one ? 'statEquivEstimate1' : 'statEquivEstimate2', value: fmtPp(one ? r.pHat : r.diff) },
      { key: 'ci', labelKey: 'statEquivCi', params: { level: pct(2 * state.alpha), unit }, value: `[${fmtPp(r.ciLower)}; ${fmtPp(r.ciUpper)}]` },
      { key: 'bounds', labelKey: 'statEquivBounds', params: { unit }, value: bounds },
      { key: 'pLower', labelKey: 'statPLower', value: fmtP(r.pLower) },
      { key: 'pUpper', labelKey: 'statPUpper', value: fmtP(r.pUpper) },
      { key: 'pValue', labelKey: 'statPTost', value: fmtP(r.pValue) },
    ],
    notes,
    decision: r.equivalent ? 'equivalent' : 'notEquivalent',
    decisionParams: { lower: fmtPp(lo), upper: fmtPp(up), unit, alpha: state.alpha },
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
