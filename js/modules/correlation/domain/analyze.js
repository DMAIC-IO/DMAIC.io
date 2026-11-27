/**
 * D.Mike — Korrelation: die Rechnung als Zahlen (domain/analyze.js). Rein.
 *
 * Wie die Altform (`computePairwise`/`computeMatrix`): bei zwei Spalten die
 * paarweise Auswertung der Engine, ab drei die Matrizen aller drei
 * Koeffizienten. Nicht berechenbare Matrixzellen sind `null` (Altform `NaN`).
 * Fehler sind Gründe (i18n-Schlüssel), keine Texte. `analyze` merkt sich je
 * Model die letzte Eingabe, damit alle Ableitungen und die Ansicht die Engine
 * einmal je Änderung rufen.
 */
import {
  runCorrelationAnalysis, pearsonR, spearmanR, kendallTau,
  fisherCI, spearmanCI, kendallCI, pFromT, kendallPValue,
} from '../../../engines/correlation-engine.js';
import { numericColumn, pairedValues, countValues } from './values.js';

/** Die Koeffizienten der Matrix (gleich dem Literal im Schema). */
export const METHODS = Object.freeze(/** @type {const} */ (['pearson', 'spearman', 'kendall']));

/** Unter so vielen Paaren rechnet das Modul nicht. */
export const MIN_PAIRS = 4;

/**
 * Das paarweise Ergebnis (genau zwei Spalten).
 *
 * @typedef {object} PairResult
 * @property {number} n  Paare
 * @property {number} df  Freiheitsgrade n − 2
 * @property {number} confidenceLevel  Konfidenzniveau
 * @property {LinearStat} pearson  Pearson
 * @property {LinearStat} spearman  Spearman
 * @property {KendallStat} kendall  Kendall
 * @property {Descriptive} descriptive  Lage und Streuung
 * @property {Diagnostics} diagnostics  Voraussetzungen
 * @property {Recommendation} recommendation  empfohlener Koeffizient
 * @property {string} _nameX  Name X
 * @property {string} _nameY  Name Y
 */

/**
 * @typedef {object} LinearStat
 * @property {number|null} r  Koeffizient
 * @property {number|null} t  t-Wert
 * @property {number|null} p  p-Wert
 * @property {number|null} r2  Bestimmtheitsmaß
 * @property {Array<number|null>} ci  Konfidenzintervall
 */

/**
 * @typedef {object} KendallStat
 * @property {number|null} tau  Kendalls τ
 * @property {number|null} z  z-Wert
 * @property {number|null} p  p-Wert
 * @property {number} concordant  konkordante Paare
 * @property {number} discordant  diskordante Paare
 * @property {Array<number|null>} ci  Konfidenzintervall
 */

/**
 * @typedef {object} Descriptive
 * @property {number|null} meanX  Mittelwert X
 * @property {number|null} meanY  Mittelwert Y
 * @property {number|null} stdX  Standardabweichung X
 * @property {number|null} stdY  Standardabweichung Y
 * @property {number|null} cov  Kovarianz
 */

/**
 * @typedef {object} Diagnostics
 * @property {Normality} normX  Normalität X
 * @property {Normality} normY  Normalität Y
 * @property {number|null} skewX  Schiefe X
 * @property {number|null} skewY  Schiefe Y
 * @property {number|null} kurtX  Wölbung X
 * @property {number|null} kurtY  Wölbung Y
 * @property {number|null} mono  Monotonie-Index
 * @property {number} outliers  Ausreißer
 */

/**
 * @typedef {object} Normality
 * @property {boolean} normal  normalverteilt
 * @property {number|null} jb  Jarque-Bera
 * @property {string} label  Urteil
 */

/**
 * @typedef {object} Recommendation
 * @property {'pearson'|'spearman'|'kendall'} best  empfohlen
 * @property {Reason[]} reasons  Gründe
 * @property {MethodScores} scores  Punkte je Koeffizient
 */

/**
 * @typedef {object} Reason
 * @property {boolean} ok  spricht für Pearson
 * @property {string} key  Kennung des Grunds
 * @property {object} [params]  Platzhalter
 */

/**
 * @typedef {object} MethodScores
 * @property {number} pearson  Pearson
 * @property {number} spearman  Spearman
 * @property {number} kendall  Kendall
 */

/**
 * Die Korrelationsmatrix (drei und mehr Spalten).
 *
 * @typedef {object} MatrixResult
 * @property {string[]} names  Spaltennamen
 * @property {MatrixByMethod} matrix  Koeffizienten
 * @property {object} ciMatrix  Konfidenzintervalle je Koeffizient
 * @property {object} pMatrix  p-Werte je Koeffizient
 * @property {Array<number[]>} nMatrix  Paare je Zelle
 */

/**
 * @typedef {object} MatrixByMethod
 * @property {Array<Array<number|null>>} pearson  Pearson
 * @property {Array<Array<number|null>>} spearman  Spearman
 * @property {Array<Array<number|null>>} kendall  Kendall
 */

/**
 * Gepaarte Rohwerte eines Spaltenpaars.
 *
 * @typedef {object} MatrixPair
 * @property {number} i  erste Spalte
 * @property {number} j  zweite Spalte
 * @property {number[]} x  Werte der ersten
 * @property {number[]} y  Werte der zweiten
 */

/**
 * Warum es kein Ergebnis gibt.
 *
 * @typedef {object} CorrError
 * @property {'errMin4'|'errZeroVariance'|'errColumnMissing'} reason  Grund als Schlüssel
 * @property {number} [n]  Paare (nur bei zu wenigen Paaren)
 * @property {string} message  Grund als Text
 */

/**
 * Was `analyze` liefert.
 * @typedef {object} Analysis
 * @property {'pairwise'|'matrix'|'none'} mode
 * @property {PairResult|null} result
 * @property {MatrixResult|null} matrixResult
 * @property {MatrixPair[]} pairs
 * @property {{ reason: 'errMin4'|'errZeroVariance'|'errColumnMissing', n?: number }|null} error
 */

/**
 * Der Grund ohne Ergebnis als Text; `derived.error` und das Viewmodel nutzen
 * dieselbe Fassung.
 * @param {{ reason: string, n?: number }} e Grund aus `analyze`
 * @param {(key: string, params?: object) => string} t Übersetzer des Moduls
 * @returns {string}
 */
export function errorMessage(e, t) {
  return e.reason === 'errMin4' ? t(e.reason, { n: e.n }) : t(e.reason);
}

/** @type {Analysis} */
const NONE = Object.freeze({ mode: 'none', result: null, matrixResult: null, pairs: [], error: null });

/** Merker je Model. @type {WeakMap<object, { key: string, value: Analysis }>} */
const memos = new WeakMap();

/** Zahl der Engine-Läufe (für Tests des Merkers). */
let runs = 0;
/** @returns {number} */
export function engineRuns() { return runs; }

/**
 * `NaN` wird `null`, sonst der Wert.
 * @param {number} v
 * @returns {number|null}
 */
const nanToNull = (v) => (Number.isNaN(v) ? null : v);

/**
 * Die paarweise Auswertung.
 * @param {import('./values.js').NumericColumn[]} cols
 * @param {number} conf
 * @returns {Analysis}
 */
function pairwise(cols, conf) {
  const { x, y } = pairedValues(cols[0].values, cols[1].values);
  if (x.length < MIN_PAIRS) return { ...NONE, error: { reason: 'errMin4', n: x.length } };
  const res = /** @type {any} */ (runCorrelationAnalysis(x, y, conf));
  if (Number.isNaN(res.pearson.r)) return { ...NONE, error: { reason: 'errZeroVariance' } };
  return {
    mode: 'pairwise',
    result: { ...res, _nameX: cols[0].name, _nameY: cols[1].name },
    matrixResult: null,
    pairs: [{ i: 0, j: 1, x, y }],
    error: null,
  };
}

/**
 * Die Matrix aller drei Koeffizienten.
 * @param {import('./values.js').NumericColumn[]} cols
 * @param {number} conf
 * @returns {Analysis}
 */
function matrix(cols, conf) {
  const k = cols.length;
  const alpha = 1 - conf;
  /** @type {any} */ const mat = { pearson: [], spearman: [], kendall: [] };
  /** @type {any} */ const ciMat = { pearson: [], spearman: [], kendall: [] };
  /** @type {any} */ const pMat = { pearson: [], spearman: [], kendall: [] };
  /** @type {number[][]} */ const nMat = [];
  /** @type {MatrixPair[]} */ const pairs = [];
  for (let i = 0; i < k; i++) {
    for (const m of METHODS) { mat[m][i] = []; ciMat[m][i] = []; pMat[m][i] = []; }
    nMat[i] = [];
    for (let j = 0; j < k; j++) {
      if (i === j) {
        for (const m of METHODS) { mat[m][i][j] = 1; ciMat[m][i][j] = null; pMat[m][i][j] = null; }
        nMat[i][j] = countValues(cols[i].values);
        continue;
      }
      if (i > j) {
        for (const m of METHODS) {
          mat[m][i][j] = mat[m][j][i];
          ciMat[m][i][j] = ciMat[m][j][i];
          pMat[m][i][j] = pMat[m][j][i];
        }
        nMat[i][j] = nMat[j][i];
        continue;
      }
      const { x, y } = pairedValues(cols[i].values, cols[j].values);
      const n = x.length;
      nMat[i][j] = n;
      if (n < MIN_PAIRS) {
        for (const m of METHODS) { mat[m][i][j] = null; ciMat[m][i][j] = null; pMat[m][i][j] = null; }
        continue;
      }
      const df = n - 2;
      const pR = Math.max(-1, Math.min(1, pearsonR(x, y)));
      const sR = Math.max(-1, Math.min(1, spearmanR(x, y)));
      const kRes = kendallTau(x, y);
      mat.pearson[i][j] = nanToNull(pR);
      mat.spearman[i][j] = nanToNull(sR);
      mat.kendall[i][j] = nanToNull(kRes.tau);
      const pPerfect = Math.abs(pR) >= 1;
      const sPerfect = Math.abs(sR) >= 1;
      ciMat.pearson[i][j] = pPerfect ? [pR, pR] : fisherCI(pR, n, alpha);
      ciMat.spearman[i][j] = sPerfect ? [sR, sR] : spearmanCI(sR, n, alpha);
      ciMat.kendall[i][j] = kendallCI(kRes.tau, n, alpha);
      const pT = pPerfect ? Infinity : pR * Math.sqrt(df) / Math.sqrt(1 - pR * pR);
      const sT = sPerfect ? Infinity : sR * Math.sqrt(df) / Math.sqrt(1 - sR * sR);
      pMat.pearson[i][j] = pPerfect ? 0 : nanToNull(pFromT(pT, df));
      pMat.spearman[i][j] = sPerfect ? 0 : nanToNull(pFromT(sT, df));
      pMat.kendall[i][j] = nanToNull(kendallPValue(kRes.tau, n).p);
      pairs.push({ i, j, x, y });
    }
  }
  return {
    mode: 'matrix',
    result: null,
    matrixResult: { names: cols.map((c) => c.name), matrix: mat, ciMatrix: ciMat, pMatrix: pMat, nMatrix: nMat },
    pairs,
    error: null,
  };
}

/**
 * Die Rechnung zum Stand: unter zwei Spalten nichts; ist ein Bezug nicht
 * lesbar (Spalte gelöscht), der Grund `errColumnMissing` ohne Rechnung über
 * die übrigen Spalten.
 * @param {{ colRefs: readonly object[], confidenceLevel: number }} m Stand des Models
 * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
 * @returns {Analysis}
 */
export function analyze(m, src) {
  const refs = m.colRefs;
  if (!Array.isArray(refs) || refs.length < 2) return NONE;
  /** @type {import('./values.js').NumericColumn[]} */
  const cols = [];
  for (const ref of refs) {
    const col = numericColumn(src, /** @type {any} */ (ref));
    if (!col) return { ...NONE, error: { reason: 'errColumnMissing' } };
    cols.push(col);
  }
  const conf = m.confidenceLevel;
  const key = JSON.stringify([conf, cols]);
  const memo = memos.get(m);
  if (memo && memo.key === key) return memo.value;
  runs++;
  const value = cols.length === 2 ? pairwise(cols, conf) : matrix(cols, conf);
  memos.set(m, { key, value });
  return value;
}
