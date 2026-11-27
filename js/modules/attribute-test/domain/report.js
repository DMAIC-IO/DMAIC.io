/**
 * D.Mike — Attributtest: Bericht.
 *
 * Ruft die Engine für eine geprüfte Eingabe auf und baut den Bericht aus
 * Zahlen: je Kennzahl der Wert als Zahl (`num`) und die Art, wie er zu Text
 * wird (`f`, siehe `format.js`). Beschriftungen und Hinweise sind
 * Textschlüssel mit Parametern. Rein: ohne DOM, ohne i18n.
 */
import {
  oneProportionTest, twoProportionTest, chiSquareAssociation,
  onePoissonRateTest, twoPoissonRateTest, mcNemarTest,
  equivalenceOneProportion, equivalenceTwoProportions,
} from '../../../engines/attribute-test-engine.js';
import { finiteOrNull, warning } from '../../../core/agent/agent-results.js';

/**
 * Wie eine Kennzahl zu Text wird.
 * - `fix`: feste Stellen `d`; `p`: p-Wert, vier Stellen, sehr kleine als „< 0.0001“;
 * - `rate`: mindestens vier Stellen, vier gültige Ziffern, Exponent unter 1e-5;
 * - `pp`: Anteil als Prozentpunkte mit zwei Stellen;
 * - `counts`: „a / b“ (b als freie Zahl bei `exposure`);
 * - `ci`: Intervall `[lo, hi]` in der Art `of`; `ppci`: Intervall in Prozentpunkten.
 * @typedef {{ t: 'fix', v: number|null, d: number }
 *   | { t: 'p', v: number|null }
 *   | { t: 'rate', v: number|null }
 *   | { t: 'pp', v: number }
 *   | { t: 'counts', a: number, b: number, exposure?: boolean }
 *   | { t: 'ci', lo: number|null, hi: number|null, of: 'fix'|'rate', d?: number }
 *   | { t: 'ppci', lo: number, hi: number }} Fmt
 */

/**
 * Eine Kennzahlzeile des Berichts.
 * @typedef {object} RawStat
 * @property {string} key
 * @property {string} labelKey
 * @property {Record<string, string|number>} [params]
 * @property {Fmt} f
 * @property {number|null} num
 */

/**
 * Der Bericht als Zahlen (Grundlage für `read().result` und die Anzeige).
 * @typedef {object} RawReport
 * @property {'one'|'two'|'equiv'|'mcnemar'|'rate1'|'rate2'|'assoc'} kind
 * @property {RawStat[]} stats
 * @property {Array<{ key: string, params?: Record<string, string|number> }>} notes
 * @property {Warning[]} noteDetails
 * @property {number|null} pValue
 * @property {number[]|null} ci
 * @property {'reject'|'keep'|'equivalent'|'notEquivalent'} decision
 * @property {{ lower: number, upper: number, unit: string, alpha: number }} [decisionRaw]
 * @property {string} basisKey
 * @property {{ cols: string[], rows: Array<{ name: string, cells: Array<{ obs: number, exp: number, contrib: number }> }> }|null} table
 * @property {Array<{ key: string }>} [actions]
 */

/**
 * Das Ergebnis, wie `read().result` es liefert: ein Bericht mit
 * `status: 'ok'`; die Werte der Kennzahlen sind Texte wie in der Altform
 * (Punkt als Dezimalzeichen). Ohne Ergebnis `status: 'insufficient'` mit
 * dem Grund.
 *
 * @typedef {object} Result
 * @property {'ok'|'insufficient'} status  ob es ein Ergebnis gibt
 * @property {string} [reason]  Grund ohne Ergebnis (Textschlüssel)
 * @property {boolean} [hint]  der Grund ist ein Eingabehinweis, kein Fehler
 * @property {string} [message]  der Grund als Text in der App-Sprache
 * @property {'one'|'two'|'equiv'|'mcnemar'|'rate1'|'rate2'|'assoc'} [kind]  Testart
 * @property {Stat[]} [stats]  Kennzahlen
 * @property {Note[]} [notes]  Hinweise
 * @property {Warning[]} [noteDetails]  die Hinweise als Codes mit ungerundeten Zahlen
 * @property {number|null} [pValue]  p-Wert der Entscheidung als Zahl
 * @property {number[]|null} [ci]  Konfidenzintervall [unten, oben], null ohne Intervall
 * @property {'reject'|'keep'|'equivalent'|'notEquivalent'} [decision]  Entscheidung gegen α
 * @property {object} [decisionParams]  Platzhalter der Entscheidung, nur Äquivalenz
 * @property {string} [basisKey]  Grundlage der Entscheidung
 * @property {CrossTable|null} [table]  Kreuztabelle, nur Zusammenhangstest
 * @property {Action[]} [actions]  angebotene Folgeschritte
 */

/**
 * @typedef {object} Action
 * @property {string} key  Kennung des Folgeschritts
 */

/**
 * @typedef {object} Stat
 * @property {string} key  Kennung der Kennzahl
 * @property {string} labelKey  Beschriftung
 * @property {object} [params]  Platzhalter der Beschriftung
 * @property {string} value  Wert
 * @property {number|null} num  die Kennzahl als Zahl, null bei Zählern und Intervallen
 */

/**
 * @typedef {object} Note
 * @property {string} key  Kennung des Hinweises
 * @property {object} [params]  Platzhalter
 */

/**
 * @typedef {object} Warning
 * @property {string} code  Kennung des Hinweises, gleich dem Textschlüssel
 * @property {Record<string, number|null>} values  eingesetzte Zahlen
 */

/**
 * @typedef {object} CrossTable
 * @property {string[]} cols  Spaltenstufen
 * @property {CrossRow[]} rows  Zeilen
 */

/**
 * @typedef {object} CrossRow
 * @property {string} name  Zeilenstufe
 * @property {CrossCell[]} cells  Zellen
 */

/**
 * @typedef {object} CrossCell
 * @property {string} obs  beobachtet
 * @property {string} exp  erwartet
 * @property {string} contrib  Beitrag zu χ²
 */

/** Konfidenzniveau in Prozent zu α, eine Stelle. @param {number} alpha */
const pct = (alpha) => Math.round((1 - alpha) * 1000) / 10;

/** @param {number|null} v @param {number} [d] @returns {Fmt} */
const fix = (v, d = 4) => ({ t: 'fix', v, d });
/** @param {number|null} v @returns {Fmt} */
const pv = (v) => ({ t: 'p', v });
/** @param {number|null} v @returns {Fmt} */
const rate = (v) => ({ t: 'rate', v });
/** @param {number} a @param {number} b @param {boolean} [exposure] @returns {Fmt} */
const counts = (a, b, exposure = false) => (exposure ? { t: 'counts', a, b, exposure } : { t: 'counts', a, b });
/** @param {number|null} lo @param {number|null} hi @param {'fix'|'rate'} [of] @returns {Fmt} */
const ci = (lo, hi, of = 'fix') => ({ t: 'ci', lo, hi, of });

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
 * Eine Zeile der Statistiktabelle; bei `one`, `two`, `assoc` muss der
 * Schlüssel in `STAT_ROWS[kind]` stehen.
 * @param {string} kind @param {string} key @param {string} labelKey @param {Fmt} f
 * @param {Record<string, string|number>} [params]
 * @param {number|null} [num] die Kennzahl ungerundet; null bei Zählern und Intervallen
 * @returns {RawStat}
 */
function stat(kind, key, labelKey, f, params, num = null) {
  if (kind in STAT_ROWS && !STAT_ROWS[kind].includes(key)) throw new Error(`STAT_ROWS.${kind} kennt „${key}“ nicht`);
  return params ? { key, labelKey, params, f, num: finiteOrNull(num) } : { key, labelKey, f, num: finiteOrNull(num) };
}

/** Das Konfidenzintervall `[unten, oben]` eines Engine-Ergebnisses als Zahlen. */
const ciOf = (r, lo = 'ciLower', hi = 'ciUpper') => [finiteOrNull(r[lo]), finiteOrNull(r[hi])];

/**
 * Die Hinweise als Codes mit Zahlen: die Zahlenparameter der Hinweise,
 * `raw` überschreibt sie mit ungerundeten Werten (`{ [code]: values }`).
 * @param {Array<{ key: string, params?: object }>} notes
 * @param {Record<string, object>} [raw]
 * @returns {Warning[]}
 */
function noteDetailsOf(notes, raw = {}) {
  return notes.map((n) => {
    const nums = {};
    for (const [k, v] of Object.entries(n.params ?? {})) if (typeof v === 'number') nums[k] = v;
    return warning(n.key, { ...nums, ...(raw[n.key] ?? {}) });
  });
}

function missingNote(norm, notes) {
  if (norm.missing > 0) notes.push({ key: 'noteMissing', params: { count: norm.missing } });
}

function reportOne(s, norm) {
  const r = oneProportionTest(norm.x, norm.n, norm.p0, s.direction, s.alpha);
  const notes = [];
  if (!r.normalApproxOk) notes.push({ key: 'noteNormalApprox' });
  missingNote(norm, notes);
  return {
    kind: 'one',
    stats: [
      stat('one', 'counts', 'statCounts', counts(norm.x, norm.n)),
      stat('one', 'pHat', 'statPHat', fix(r.pHat), undefined, r.pHat),
      stat('one', 'ci', 'statCi', ci(r.ciLower, r.ciUpper), { level: pct(s.alpha) }),
      stat('one', 'pExact', 'statPExact', pv(r.pExact), undefined, r.pExact),
      stat('one', 'z', 'statZ', fix(r.z), undefined, r.z),
      stat('one', 'pNormal', 'statPNormal', pv(r.pNormal), undefined, r.pNormal),
    ],
    notes,
    pValue: finiteOrNull(r.pExact),
    ci: ciOf(r),
    decision: r.reject ? 'reject' : 'keep',
    basisKey: 'basisExact',
    table: null,
  };
}

function reportTwo(s, norm) {
  const r = twoProportionTest(norm.x1, norm.n1, norm.x2, norm.n2, s.direction, s.alpha, s.pooled);
  const notes = [];
  if (s.pooled) notes.push({ key: 'notePooled' });
  missingNote(norm, notes);
  // Nicht signifikant (nur zweiseitig): „kein Unterschied“ heißt nicht „gleichwertig“.
  const offerEquivalence = s.direction === 'two-sided' && !r.reject;
  if (offerEquivalence) notes.push({ key: 'noteNotEquivalentIsNotEqual' });
  notes.push(MCNEMAR_NOTE);
  const g = norm.groups || ['1', '2'];
  const report = {
    kind: 'two',
    stats: [
      stat('two', 'counts1', 'statCountsGroup', counts(norm.x1, norm.n1), { group: g[0] }),
      stat('two', 'counts2', 'statCountsGroup', counts(norm.x2, norm.n2), { group: g[1] }),
      stat('two', 'p1', 'statPGroup', fix(r.p1), { group: g[0] }, r.p1),
      stat('two', 'p2', 'statPGroup', fix(r.p2), { group: g[1] }, r.p2),
      stat('two', 'diff', 'statDiff', fix(r.diff), undefined, r.diff),
      stat('two', 'ci', 'statCiDiff', ci(r.ciLower, r.ciUpper), { level: pct(s.alpha) }),
      stat('two', 'z', 'statZ', fix(r.z), undefined, r.z),
      stat('two', 'pValue', 'statPValue', pv(r.pValue), undefined, r.pValue),
      stat('two', 'pFisher', 'statPFisher', pv(r.pFisher), undefined, r.pFisher),
    ],
    notes,
    pValue: finiteOrNull(r.pValue),
    ci: ciOf(r),
    decision: r.reject ? 'reject' : 'keep',
    basisKey: 'basisZ',
    table: null,
  };
  if (offerEquivalence) report.actions = [{ key: 'actionCheckEquivalence' }];
  return report;
}

function reportRate1(s, norm) {
  const r = onePoissonRateTest(norm.x, norm.t, norm.lambda0, s.direction, s.alpha);
  const notes = [];
  if (!r.normalApproxOk) notes.push({ key: 'noteRateNormalApprox' });
  missingNote(norm, notes);
  return {
    kind: 'rate1',
    stats: [
      stat('rate1', 'counts', 'statRateCounts', counts(norm.x, norm.t, true)),
      stat('rate1', 'rate', 'statRate', rate(r.rate), undefined, r.rate),
      stat('rate1', 'ci', 'statCiRate', ci(r.ciLower, r.ciUpper, 'rate'), { level: pct(s.alpha) }),
      stat('rate1', 'pExact', 'statPExactPoisson', pv(r.pExact), undefined, r.pExact),
      stat('rate1', 'z', 'statZ', fix(r.z), undefined, r.z),
      stat('rate1', 'pNormal', 'statPNormal', pv(r.pNormal), undefined, r.pNormal),
    ],
    notes,
    pValue: finiteOrNull(r.pExact),
    ci: ciOf(r),
    decision: r.reject ? 'reject' : 'keep',
    basisKey: 'basisExactPoisson',
    table: null,
  };
}

function reportRate2(s, norm) {
  const r = twoPoissonRateTest(norm.x1, norm.t1, norm.x2, norm.t2, {
    direction: s.direction, alpha: s.alpha, pooled: s.ratePooled, diff0: norm.diff0,
  });
  if (!r.testable) return { error: 'noteRateNotTestable', hint: true };
  const notes = [];
  // Die gemeinsame Varianz gibt es nur für H₀: Δ = 0; bei verschobener H₀ wirkt die Einstellung nicht.
  if (s.ratePooled && norm.diff0 !== 0) notes.push({ key: 'noteRatePooledIgnored' });
  missingNote(norm, notes);
  const g = norm.groups || ['1', '2'];
  const level = pct(s.alpha);
  const stats = [
    stat('rate2', 'rate1', 'statRateGroup', rate(r.rate1), { group: g[0] }, r.rate1),
    stat('rate2', 'rate2', 'statRateGroup', rate(r.rate2), { group: g[1] }, r.rate2),
    stat('rate2', 'diff', 'statRateDiff', rate(r.diff), undefined, r.diff),
    stat('rate2', 'ci', 'statCiRateDiff', ci(r.ciLower, r.ciUpper, 'rate'), { level }),
    stat('rate2', 'z', 'statZ', fix(r.z), undefined, r.z),
    stat('rate2', 'pValue', 'statPValue', pv(r.pValue), undefined, r.pValue),
  ];
  if (r.pExactCond != null) stats.push(stat('rate2', 'pExactCond', 'statPExactCond', pv(r.pExactCond), undefined, r.pExactCond));
  if (r.ratio != null) {
    stats.push(
      stat('rate2', 'ratio', 'statRateRatio', fix(r.ratio), undefined, r.ratio),
      stat('rate2', 'ratioCi', 'statCiRatio', ci(r.ratioLower, r.ratioUpper), { level }),
    );
  }
  return {
    kind: 'rate2',
    stats,
    notes,
    pValue: finiteOrNull(r.pValue),
    ci: ciOf(r),
    decision: r.reject ? 'reject' : 'keep',
    basisKey: 'basisZRate',
    table: null,
  };
}

function reportMcNemar(s, norm) {
  const r = mcNemarTest(norm.table, s.direction, s.alpha);
  if (!r.testable) return { error: 'noteNoDiscordant', hint: true };
  const notes = [];
  if (r.smallDiscordant) notes.push({ key: 'noteSmallDiscordant' });
  missingNote(norm, notes);
  const lb = String((norm.labels && norm.labels.before) || '').trim();
  const la = String((norm.labels && norm.labels.after) || '').trim();
  const stats = [
    stat('mcnemar', 'discordant', 'statDiscordant', counts(r.b, r.c)),
    lb ? stat('mcnemar', 'pBefore', 'statPBeforeLabeled', fix(r.pBefore), { label: lb }, r.pBefore)
      : stat('mcnemar', 'pBefore', 'statPBefore', fix(r.pBefore), undefined, r.pBefore),
    la ? stat('mcnemar', 'pAfter', 'statPAfterLabeled', fix(r.pAfter), { label: la }, r.pAfter)
      : stat('mcnemar', 'pAfter', 'statPAfter', fix(r.pAfter), undefined, r.pAfter),
    stat('mcnemar', 'diff', 'statPairedDiff', fix(r.diff), undefined, r.diff),
    stat('mcnemar', 'ci', 'statCiPairedDiff', ci(r.ciLower, r.ciUpper), { level: pct(s.alpha) }),
    stat('mcnemar', 'pExact', 'statPExactMcNemar', pv(r.pExact), undefined, r.pExact),
  ];
  if (r.pChi2 != null) {
    stats.push(
      stat('mcnemar', 'chi2', 'statChi2McNemar', fix(r.chi2, 3), undefined, r.chi2),
      stat('mcnemar', 'pChi2', 'statPChi2', pv(r.pChi2), undefined, r.pChi2),
      stat('mcnemar', 'chi2Cc', 'statChi2McNemarCc', fix(r.chi2Cc, 3), undefined, r.chi2Cc),
      stat('mcnemar', 'pChi2Cc', 'statPChi2Cc', pv(r.pChi2Cc), undefined, r.pChi2Cc),
    );
  }
  return {
    kind: 'mcnemar',
    stats,
    notes,
    pValue: finiteOrNull(r.pExact),
    ci: ciOf(r),
    decision: r.reject ? 'reject' : 'keep',
    basisKey: 'basisExactMcNemar',
    table: null,
  };
}

function reportEquiv(s, norm) {
  const one = norm.samples === 1;
  let r;
  if (one) {
    r = equivalenceOneProportion(norm.x, norm.n, norm.p0, norm.lower, norm.upper, s.alpha);
  } else {
    r = equivalenceTwoProportions(norm.x1, norm.n1, norm.x2, norm.n2, norm.lower, norm.upper, s.alpha);
    if (!r.testable) return { error: 'noteEquivDegenerate', hint: true };
  }
  // 1 Stichprobe: absolute Anteile (Grenzen relativ zu p₀, auf [0; 1] beschnitten); 2: die Differenz.
  const clip = (v) => Math.min(1, Math.max(0, v));
  const lo = one ? clip(norm.p0 + norm.lower) : norm.lower;
  const up = one ? clip(norm.p0 + norm.upper) : norm.upper;
  // 1 Stichprobe: Anteile in %; 2: eine Differenz in Prozentpunkten.
  const unit = one ? '%' : 'pp';
  const g = norm.groups || ['1', '2'];
  const countRows = one
    ? [stat('equiv', 'counts', 'statCounts', counts(norm.x, norm.n))]
    : [
      stat('equiv', 'counts1', 'statCountsGroup', counts(norm.x1, norm.n1), { group: g[0] }),
      stat('equiv', 'counts2', 'statCountsGroup', counts(norm.x2, norm.n2), { group: g[1] }),
    ];
  const notes = [{ key: 'noteEquivBoundsPractical' }];
  if (!r.equivalent) notes.push({ key: 'noteEquivCiOutside' });
  missingNote(norm, notes);
  const estimate = one ? r.pHat : r.diff;
  return {
    kind: 'equiv',
    stats: [
      ...countRows,
      stat('equiv', 'estimate', one ? 'statEquivEstimate1' : 'statEquivEstimate2', { t: 'pp', v: estimate }, undefined, estimate),
      stat('equiv', 'ci', 'statEquivCi', { t: 'ppci', lo: r.ciLower, hi: r.ciUpper }, { level: pct(2 * s.alpha), unit }),
      stat('equiv', 'bounds', 'statEquivBounds', { t: 'ppci', lo, hi: up }, { unit }),
      stat('equiv', 'pLower', 'statPLower', pv(r.pLower), undefined, r.pLower),
      stat('equiv', 'pUpper', 'statPUpper', pv(r.pUpper), undefined, r.pUpper),
      stat('equiv', 'pValue', 'statPTost', pv(r.pValue), undefined, r.pValue),
    ],
    notes,
    pValue: finiteOrNull(r.pValue),
    ci: ciOf(r),
    decision: r.equivalent ? 'equivalent' : 'notEquivalent',
    decisionRaw: { lower: lo, upper: up, unit, alpha: s.alpha },
    basisKey: 'basisTost',
    table: null,
  };
}

/** Fisher-p-Wert der gewählten Alternative (nur 2×2-Tabellen). */
function fisherP(direction, r) {
  if (direction === 'greater') return r.fisherGreater;
  if (direction === 'less') return r.fisherLess;
  return r.fisherTwoSided;
}

/** Beschriftungsschlüssel der Fisher-Alternative. */
function fisherLabel(direction) {
  if (direction === 'greater') return 'statPFisherGreater';
  if (direction === 'less') return 'statPFisherLess';
  return 'statPFisher';
}

function reportAssoc(s, norm) {
  const r = chiSquareAssociation(norm.counts, s.alpha);
  if (!r.testable) return { error: 'errTableTooSmall' };
  const rows = norm.rows.filter((_, i) => !r.droppedRows.includes(i));
  const cols = norm.cols.filter((_, j) => !r.droppedCols.includes(j));
  const notes = [];
  const droppedNames = [
    ...r.droppedRows.map((i) => norm.rows[i]),
    ...r.droppedCols.map((j) => norm.cols[j]),
  ];
  if (droppedNames.length) notes.push({ key: 'noteDropped', params: { names: droppedNames.join(', ') } });
  if (r.warnExpectedBelow1) notes.push({ key: 'warnExpectedBelow1' });
  if (r.warnShareBelow5) notes.push({ key: 'warnShareBelow5', params: { share: Math.round(r.shareBelow5 * 100) } });
  missingNote(norm, notes);
  const stats = [
    stat('assoc', 'pearson', 'statPearson', fix(r.pearson, 3), { df: r.df }, r.pearson),
    stat('assoc', 'pPearson', 'statPValue', pv(r.pPearson), undefined, r.pPearson),
    stat('assoc', 'lr', 'statLr', fix(r.lr, 3), { df: r.df }, r.lr),
    stat('assoc', 'pLR', 'statPLr', pv(r.pLR), undefined, r.pLR),
  ];
  if (r.yates != null) {
    const pF = fisherP(s.direction, r);
    stats.push(
      stat('assoc', 'yates', 'statYates', fix(r.yates, 3), undefined, r.yates),
      stat('assoc', 'pYates', 'statPYates', pv(r.pYates), undefined, r.pYates),
      stat('assoc', 'pFisher', fisherLabel(s.direction), pv(pF), undefined, pF),
    );
  }
  return {
    kind: 'assoc',
    stats,
    notes,
    pValue: finiteOrNull(r.pPearson),
    ci: null,
    noteDetails: noteDetailsOf(notes, { warnShareBelow5: { share: r.shareBelow5 } }),
    decision: r.reject ? 'reject' : 'keep',
    basisKey: 'basisPearson',
    table: {
      cols,
      rows: rows.map((name, i) => ({
        name,
        cells: r.observed[i].map((o, j) => ({ obs: o, exp: r.expected[i][j], contrib: r.contributions[i][j] })),
      })),
    },
  };
}

/**
 * Den Bericht zu einer geprüften Eingabe bauen.
 * @param {{ direction: string, alpha: number, pooled: boolean, ratePooled: boolean }} s Einstellungen
 * @param {object} norm Ergebnis von `normalizeSummary` / `normalizeColumns`
 * @returns {RawReport|{ error: string, hint?: true }}
 */
export function buildReport(s, norm) {
  if (!norm.ok) return norm.hint ? { error: norm.error, hint: true } : { error: norm.error };
  const report = dispatch(s, norm);
  if ('error' in report) return report;
  report.noteDetails ??= noteDetailsOf(report.notes);
  return report;
}

function dispatch(s, norm) {
  if (norm.kind === 'one') return reportOne(s, norm);
  if (norm.kind === 'two') return reportTwo(s, norm);
  if (norm.kind === 'rate1') return reportRate1(s, norm);
  if (norm.kind === 'rate2') return reportRate2(s, norm);
  if (norm.kind === 'mcnemar') return reportMcNemar(s, norm);
  if (norm.kind === 'equiv') return reportEquiv(s, norm);
  return reportAssoc(s, norm);
}
