/**
 * D.Mike — Hypothesentest: die Analyse als Zahlen (domain/analyze.js).
 * Normalität, Weg, Haupttest, Vergleichstest, Teststärke und Paarvergleiche
 * aus den Stichproben. Reine Rechnung auf den Engines: keine Übersetzung,
 * keine Formatierung, keine Darstellungsklassen — wo die Anzeige einen Text
 * braucht, steht hier der Schlüssel. Den Text baut viewmodel/present.js.
 */
import { finiteOrNull, warning } from '../../../core/agent/agent-results.js';
import {
  chiSquareVarianceTest, fTest, leveneTest,
  oneSampleTTest, twoSampleTTest, welchTTest,
  wilcoxonSignedRank, mannWhitneyU, hodgesLehmann,
  bonettVarianceTest, bonettRatioTest,
  oneWayANOVA, welchANOVA, leveneTestK, kruskalWallis, bartlettTest,
  pairDifferences, pairedTTest,
} from '../../../engines/hypothesis-test-engine.js';
import { shapiroWilk, andersonDarling, descriptiveStats } from '../../../engines/normality-test-engine.js';
import { tInv, chi2Inv } from '../../../engines/math-utils.js';
import { isNormalByAD, meanRoute, kMeanRoute, varianceRoute, isConstant, ciContains } from './routing.js';
import { computePower } from './power.js';
import { simultaneousPairwise, bonferroniPairwise } from './posthoc.js';

/**
 * Die Eingabe der Analyse: Konfiguration plus Stichproben. Das Ziel ist
 * schon aufgelöst (σ₀ → σ²₀ macht der Aufrufer).
 *
 * @typedef {object} AnalysisInput
 * @property {'variance'|'mean'} category
 * @property {'one'|'two'|'paired'|'k'} testType
 * @property {'two-sided'|'greater'|'less'} direction
 * @property {number} alpha
 * @property {number} powerGoal
 * @property {number|null} target
 * @property {'variance'|'stddev'} targetType
 * @property {boolean} equalVariances
 * @property {{ name: string, values: Array<number|null>|null }[]} samples  bei `one` ein Eintrag,
 *   bei `two`/`paired` zwei, bei `k` alle gewählten. `values: null` heißt: keine Spalte gewählt.
 *   Gepaart kommen die Spalten ungefiltert (mit Lücken), weil die Paarbildung sie selbst ausdünnt;
 *   sonst nur endliche Zahlen.
 */

/**
 * Unvollständige oder nicht rechenbare Eingaben. Gründe:
 * `columns` (Spalte fehlt; k: weniger als zwei Gruppen), `min3` (eine
 * Stichprobe hat weniger als drei Werte), `target` (Zielwert fehlt),
 * `paired` (weniger als drei vollständige Paare, `count` = Anzahl Paare),
 * `noVariation` (die Paardifferenzen streuen nicht), `notComputable`
 * (eine Engine lehnt die Daten ab).
 *
 * @typedef {object} AnalysisInsufficient
 * @property {'insufficient'} status
 * @property {'columns'|'min3'|'target'|'paired'|'noVariation'|'notComputable'} reason
 * @property {number} [count]  nur bei `paired`
 */

/**
 * Der Haupttest als Zahlen, sprachunabhängig und ungerundet.
 *
 * @typedef {object} Numeric
 * @property {number|null} statistic  Prüfgröße
 * @property {number|null} df  Freiheitsgrade, bei F-Test und ANOVA der Zählerfreiheitsgrad
 * @property {number|null} df2  Nennerfreiheitsgrad, null bei nur einem Freiheitsgrad
 * @property {number|null} p  p-Wert
 * @property {Array<number|null>|null} ci  Konfidenzintervall [unten, oben], null ohne Intervall
 * @property {'reject'|'keep'} decision  Entscheidung gegen α
 * @property {number|null} power  Teststärke als Anteil, nicht bei k
 * @property {boolean} powerApprox  Teststärke ist eine Normalapproximation (Bonett)
 * @property {Warning[]} notes  Hinweise zum Intervall als Codes mit Zahlen
 */

/**
 * @typedef {object} Warning
 * @property {string} code  Kennung des Hinweises, gleich dem Textschlüssel
 * @property {Record<string, number|null>} values  eingesetzte Zahlen
 */

/**
 * @typedef {object} SampleStats
 * @property {string} name  Spaltenname
 * @property {number} n @property {number} mean @property {number} sd @property {number} variance
 * @property {{ w: number, p: number }} sw  Shapiro-Wilk
 * @property {{ a2: number, p: number }} ad  Anderson-Darling
 * @property {boolean} normal  Urteil (Anderson-Darling gegen α)
 * @property {[number, number]|null} ciMean  Intervall des Mittelwerts
 * @property {[number, number]|null} ciVariance  Intervall der Varianz
 *
 * @typedef {object} TestOutcome
 * @property {string} name  Verfahrensname (Eigenname, wie heute) @property {string|null} algoId
 * @property {number|null} statistic @property {number|null} df @property {number|null} df2
 * @property {number|null} p @property {Array<number|null>|null} ci
 * @property {boolean} reject  Urteil der Engine
 * @property {'exact'|'normal'|null} pMethod  wie der p-Wert entstand (Rangtests)
 * @property {boolean} ciUndefined  Bonett: das Konfidenzgebiet zerfällt, kein Intervall
 * @property {[number, number]|null} ciSigma  Intervall der Standardabweichung
 * @property {{ estimate: number, lower: number, upper: number, achievedConfidence: number,
 *   method: 'exact'|'normal', K: number }|null} hl  Hodges-Lehmann-Schätzer mit Intervall
 * @property {Record<string, number|null>} [extra]  weitere Kennzahlen des Verfahrens unter ihren
 *   Engine-Namen (df1, ratio, mean, mean1, mean2, meanDiff, sampleVariance, variance1, variance2,
 *   pooledVariance, k, N); nur die, die das Verfahren liefert
 *
 * @typedef {object} AnalysisOk
 * @property {'ok'} status
 * @property {boolean} isK @property {boolean} allNormal
 * @property {number} alpha  Signifikanzniveau der Rechnung
 * @property {number|null} target  aufgelöster Zielwert, null ohne
 * @property {SampleStats[]} samples  gepaart: eine Stichprobe, die Differenzen
 * @property {{ name: string, algoId: string|null, reasonKeys: string[] }} route  gewähltes Verfahren und die Wegschritte als Schlüssel
 * @property {{ varsEqual: boolean, test: TestOutcome|null, trailLabelKey: string, trailYes: boolean }|null} varEquality
 * @property {TestOutcome & { decision: 'reject'|'keep' }} main
 * @property {{ rows: { source: 'factor'|'error'|'total', ss: number, df: number, ms: number|null, f: number|null, p: number|null }[]|null,
 *   summary: { s: number, r2: number, r2adj: number, r2pred: number|null }|null,
 *   groups: { name: string, n: number, mean: number, variance: number, ci: [number, number]|null, letters: string }[] }|null} anova
 *   nur k; `rows` nur bei der einfaktoriellen ANOVA (Fisher), `summary` nur Fisher- und Welch-Weg
 * @property {Numeric} numeric  wie heute
 * @property {{ test: TestOutcome, titleKey: string, noteKey: string, twoSidedSuffix: boolean }|null} secondary
 * @property {{ power: number, effect: number, effectKind: string, requiredN: number, goal: number, n: number[], approx: boolean }|null} power
 * @property {{ methodName: string, algoId: string|null, simultaneous: boolean, isRank: boolean, m: number,
 *   comparisons: { i: number, j: number, p: number|null, pAdj: number, ci: [number, number]|null, equal: boolean }[],
 *   letters: string[] }|null} pairwise
 * @property {{ residuals: number[], fitted: number[] }|null} residualPlot
 * @property {Warning[]} notes  Hinweise zum Intervall, gleich `numeric.notes`
 * @property {{ n: number, dropped: number }} [pairInfo]  nur gepaart: Paare und verworfene Zeilen
 */

/** @typedef {AnalysisOk|AnalysisInsufficient} Analysis */

/** Mapping: Verfahrensname → Kennung im Algorithm Lab. */
const ALGO_LAB_IDS = {
  'Shapiro-Wilk': 'shapiro-wilk',
  'Anderson-Darling': 'anderson-darling',
  'Chi-Square Variance Test': 'chi-square-variance',
  'F-Test': 'f-test',
  'Levene Test (Brown-Forsythe)': 'levene-test',
  'Bonett Variance Test': 'bonett-variance',
  'Bonett Ratio Test': 'bonett-ratio',
  'One-Sample t-Test': 'one-sample-t-test',
  'Two-Sample t-Test (pooled)': 'two-sample-t-test',
  'Welch t-Test': 'welch-t-test',
  'Paired t-Test': 'paired-t-test',
  'Wilcoxon Signed-Rank Test': 'wilcoxon-signed-rank',
  'Mann-Whitney U Test': 'mann-whitney-u',
  'One-Way ANOVA': 'one-way-anova',
  'Welch ANOVA': 'welch-anova',
  'Tukey HSD': 'tukey-hsd',
  'Games-Howell': 'games-howell',
  'Kruskal-Wallis Test': 'kruskal-wallis',
  "Bartlett's Test": 'bartlett-test',
  'Hodges-Lehmann': 'hodges-lehmann',
};

/**
 * Kennung eines Verfahrens im Algorithm Lab.
 * @param {string} name Verfahrensname
 * @returns {string|null} Lab-Kennung, null für unbekannte Namen
 */
export function algoIdOf(name) {
  return Object.hasOwn(ALGO_LAB_IDS, name) ? ALGO_LAB_IDS[name] : null;
}

/** Felder, die ein Engine-Ergebnis über die Kernzahlen hinaus tragen kann. */
const EXTRA_FIELDS = [
  'df1', 'ratio', 'mean', 'mean1', 'mean2', 'meanDiff', 'sampleVariance',
  'variance1', 'variance2', 'pooledVariance', 'k', 'N',
];

/** @returns {AnalysisInsufficient} */
function insufficient(reason, more = {}) {
  return { status: 'insufficient', reason, ...more };
}

// ── Intervalle (dünne Hüllen über math-utils) ────────────────

function ciMean(mean, sd, n, alpha) {
  if (n < 2 || !isFinite(sd) || sd <= 0) return null;
  const tCrit = tInv(1 - alpha / 2, n - 1);
  const se = sd / Math.sqrt(n);
  return [mean - tCrit * se, mean + tCrit * se];
}

function ciVariance(variance, n, alpha) {
  if (n < 2 || !isFinite(variance) || variance <= 0) return null;
  const lo = (n - 1) * variance / chi2Inv(1 - alpha / 2, n - 1);
  const hi = (n - 1) * variance / chi2Inv(alpha / 2, n - 1);
  return [lo, hi];
}

/** Kennzahlen und Normalitätsurteil einer Stichprobe. @returns {SampleStats} */
function sampleStats(name, data, sw, ad, normal, alpha) {
  const { mean, stdDev: sd, variance } = descriptiveStats(data);
  const n = data.length;
  return {
    name: String(name),
    n, mean, sd, variance,
    sw: { w: sw.statistic, p: sw.pValue },
    ad: { a2: ad.statistic, p: ad.pValue },
    normal,
    ciMean: ciMean(mean, sd, n, alpha),
    ciVariance: ciVariance(variance, n, alpha),
  };
}

/** Ein Engine-Ergebnis als Zahlen. @returns {TestOutcome} */
function outcome(r) {
  const extra = {};
  for (const key of EXTRA_FIELDS) if (r[key] !== undefined) extra[key] = r[key];
  return {
    name: r.testName,
    algoId: algoIdOf(r.testName),
    statistic: r.statistic ?? null,
    df: r.df ?? null,
    df2: r.df2 ?? null,
    p: r.pValue ?? null,
    ci: r.ci ?? null,
    reject: Boolean(r.reject),
    pMethod: r.method ?? null,
    ciUndefined: Boolean(r.ciUndefined),
    ciSigma: r.ciSigma ?? null,
    hl: r.hl ? {
      estimate: r.hl.estimate, lower: r.hl.lower, upper: r.hl.upper,
      achievedConfidence: r.hl.achievedConfidence, method: r.hl.method, K: r.hl.K,
    } : null,
    extra,
  };
}

/** Vergleichstest neben dem Haupttest. */
function secondaryOf(r, { titleKey = 'sectionSecondary', noteKey = 'secondaryNote', twoSidedSuffix = false } = {}) {
  return { test: outcome(r), titleKey, noteKey, twoSidedSuffix };
}

/**
 * Die Hinweise zum Intervall als Codes mit ungerundeten Zahlen — Quelle
 * für den Hinweistext und für `numeric.notes`. `level` und `achieved`
 * sind Anteile (0,95), nicht Prozent.
 */
function ciNoteCodes(r, alpha, target, { category, testType }) {
  const isPaired = testType === 'paired';
  const isMeanDiff = category !== 'variance' && testType === 'two' && r.ci != null;
  // Ein nicht abgelehnter einseitiger Test kann das Ziel außerhalb des KI lassen
  const ciHoldsTarget = ciContains(r.ci, target ?? 0);
  const out = [];
  if (r.ciUndefined) {
    out.push(warning('ciRatioUndefinedNote'));
  } else if (isPaired && r.ci && !r.reject) {
    if (ciHoldsTarget) out.push(warning('ciPairedDiffNote', { lo: r.ci[0], hi: r.ci[1] }));
  } else if (isMeanDiff && !r.reject) {
    if (ciHoldsTarget) out.push(warning('ciDiffNote', { lo: r.ci[0], hi: r.ci[1] }));
  } else if (r.hl) {
    if (!r.reject) out.push(warning('ciShiftNote', { lo: r.hl.lower, hi: r.hl.upper }));
    if (r.hl.K === 1 && r.hl.achievedConfidence > 0 && r.hl.achievedConfidence < 1 - alpha - 1e-9) {
      out.push(warning('ciShiftTooSmall', { level: 1 - alpha, achieved: r.hl.achievedConfidence }));
    }
  }
  return out;
}

/** Das Testergebnis als Zahlen. @returns {Numeric} */
function numericOf(r, alpha, target, power, powerApprox, input) {
  const p = finiteOrNull(r.pValue);
  let ci = null;
  if (Array.isArray(r.ci)) ci = r.ci.map(finiteOrNull);
  else if (r.hl) ci = [finiteOrNull(r.hl.lower), finiteOrNull(r.hl.upper)];
  return {
    statistic: finiteOrNull(r.statistic),
    df: finiteOrNull(r.df ?? r.df1),
    df2: finiteOrNull(r.df2 ?? null),
    p,
    ci,
    decision: (r.reject ?? (p != null && p < alpha)) ? 'reject' : 'keep',
    power: finiteOrNull(power),
    powerApprox,
    notes: ciNoteCodes(r, alpha, target, input),
  };
}

/** Teststärke als Zahlen. */
function powerOf(input, d1, d2, target, approx) {
  const r = computePower({ ...input, d1, d2, target });
  return {
    power: r.power, effect: r.effect, effectKind: r.effectKind, requiredN: r.requiredN,
    goal: input.powerGoal, n: d2 ? [d1.length, d2.length] : [d1.length], approx,
  };
}

/** Haupttest mit Entscheidung; dazu Kennzahlen und Hinweise. */
function mainOf(r, numeric) {
  return { ...outcome(r), decision: numeric.decision };
}

// ── Die drei Wege ────────────────────────────────────────────

function analyzePaired(input) {
  const { alpha, samples } = input;
  if (samples[0]?.values == null || samples[1]?.values == null) return insufficient('columns');
  const { x1, x2, d, dropped } = pairDifferences(samples[0].values, samples[1].values);
  if (d.length < 3) return insufficient('paired', { count: d.length });
  const target = input.target;
  if (target == null) return insufficient('target');
  // Gleiche Spalten (oder eine feste Verschiebung) lassen nichts zu prüfen
  if (isConstant(d)) return insufficient('noVariation');

  const sw = shapiroWilk(d), ad = andersonDarling(d);
  const dNormal = isNormalByAD(ad, alpha);
  const family = meanRoute(dNormal, [d.length]);
  const dir = input.direction;
  const means = { mean1: descriptiveStats(x1).mean, mean2: descriptiveStats(x2).mean };

  let r, algoName;
  if (family === 'rank') {
    algoName = 'Wilcoxon Signed-Rank Test';
    r = { ...wilcoxonSignedRank(d, target, dir, alpha), ...means, meanDiff: descriptiveStats(d).mean };
  } else {
    algoName = 'Paired t-Test';
    r = pairedTTest(x1, x2, target, dir, alpha);
  }

  const secondary = family === 'parametric-large-n'
    ? secondaryOf(wilcoxonSignedRank(d, target, dir, alpha))
    : null;

  const power = powerOf(input, d, null, target, false);
  const numeric = numericOf(r, alpha, target, power.power, false, input);
  return {
    status: 'ok',
    isK: false,
    allNormal: dNormal,
    alpha,
    target,
    samples: [sampleStats('', d, sw, ad, dNormal, alpha)],
    route: { name: algoName, algoId: algoIdOf(algoName), reasonKeys: [] },
    varEquality: null,
    main: mainOf(r, numeric),
    anova: null,
    numeric,
    secondary,
    power,
    pairwise: null,
    residualPlot: null,
    notes: numeric.notes,
    pairInfo: { n: d.length, dropped },
  };
}

const VARIANCE_ALGOS = {
  chi2: { id: 'chi2', name: 'Chi-Square Variance Test' },
  bonett1: { id: 'bonett1', name: 'Bonett Variance Test' },
  ftest: { id: 'ftest', name: 'F-Test' },
  bonett2: { id: 'bonett2', name: 'Bonett Ratio Test' },
};

function analyzeOneTwo(input) {
  const { alpha, category, testType } = input;
  const d1 = input.samples[0]?.values ?? [];
  if (d1.length < 3) return insufficient('min3');

  let d2 = null;
  if (testType === 'two') {
    d2 = input.samples[1]?.values ?? [];
    if (d2.length < 3) return insufficient('min3');
  }

  let target = null;
  if (testType === 'one') {
    target = input.target;
    if (target == null) return insufficient('target');
  }

  // Normalität — die Engines werfen bei einer konstanten Stichprobe
  let sw1, ad1, n1Normal, sw2 = null, ad2 = null, n2Normal = true;
  try {
    sw1 = shapiroWilk(d1); ad1 = andersonDarling(d1);
    n1Normal = isNormalByAD(ad1, alpha);
    if (d2) {
      sw2 = shapiroWilk(d2); ad2 = andersonDarling(d2);
      n2Normal = isNormalByAD(ad2, alpha);
    }
  } catch (err) {
    console.error('[hypothesis-test] normality check failed:', err);
    return insufficient('notComputable');
  }
  const allNormal = n1Normal && n2Normal;

  // Weg
  let algo;
  let meanFamily = null;
  if (category === 'variance') {
    algo = VARIANCE_ALGOS[varianceRoute(testType, allNormal)];
  } else if (testType === 'one') {
    meanFamily = meanRoute(n1Normal, [d1.length]);
    algo = meanFamily === 'rank'
      ? { id: 'wilcoxon', name: 'Wilcoxon Signed-Rank Test' }
      : { id: 'ttest1', name: 'One-Sample t-Test' };
  } else {
    algo = { id: 'pending', name: '' };
  }

  // Zwei Mittelwerte: Welch als Vorgabe, der gepoolte t-Test nur, wenn
  // gleiche Varianzen angenommen werden. Kein Varianz-Vortest entscheidet
  // den Weg (C1-006: sequentielles Vortesten verzerrt den Fehler 1. Art).
  let varEquality = null;
  if (category === 'mean' && testType === 'two') {
    meanFamily = meanRoute(allNormal, [d1.length, d2.length]);
    if (meanFamily !== 'rank') {
      const varsEqual = input.equalVariances === true;
      varEquality = { varsEqual, test: null, trailLabelKey: 'varEqualLabel', trailYes: varsEqual };
      algo = varsEqual
        ? { id: 'ttest2p', name: 'Two-Sample t-Test (pooled)' }
        : { id: 'welch', name: 'Welch t-Test' };
    } else {
      algo = { id: 'mannwhitney', name: 'Mann-Whitney U Test' };
    }
  }

  // Haupttest
  const dir = input.direction;
  let r;
  try {
    if (algo.id === 'chi2') r = chiSquareVarianceTest(d1, target, dir, alpha);
    else if (algo.id === 'ftest') r = fTest(d1, d2, dir, alpha);
    else if (algo.id === 'bonett1') r = bonettVarianceTest(d1, target, dir, alpha);
    else if (algo.id === 'bonett2') r = bonettRatioTest(d1, d2, dir, alpha);
    else if (algo.id === 'ttest1') r = oneSampleTTest(d1, target, dir, alpha);
    else if (algo.id === 'wilcoxon') r = wilcoxonSignedRank(d1, target, dir, alpha);
    else if (algo.id === 'ttest2p') r = twoSampleTTest(d1, d2, dir, alpha);
    else if (algo.id === 'welch') r = welchTTest(d1, d2, dir, alpha);
    else if (algo.id === 'mannwhitney') r = mannWhitneyU(d1, d2, dir, alpha);
  } catch (err) {
    // Bonetts KI ist für entartete Stichproben (keine Streuung, sehr kleines n) undefiniert
    console.error('[hypothesis-test] test computation failed:', err);
    return insufficient('notComputable');
  }
  // Verschiebungsschätzer und KI zum Rangtest (zweiseitig, wie die t-KIs)
  if (algo.id === 'mannwhitney') r = { ...r, hl: hodgesLehmann(d1, d2, alpha) };

  // Großer Stichprobenweg: der Rangtest steht daneben (C1-017)
  let secondary = null;
  if (meanFamily === 'parametric-large-n') {
    secondary = secondaryOf(d2
      ? mannWhitneyU(d1, d2, dir, alpha)
      : wilcoxonSignedRank(d1, target, dir, alpha));
  }
  // Bonett mit zwei Stichproben: Levene daneben, wie Minitabs „2 Variances“ beide zeigt
  if (algo.id === 'bonett2') {
    secondary = secondaryOf(leveneTest(d1, d2, alpha), {
      titleKey: 'sectionSecondaryLevene',
      noteKey: 'secondaryNoteLevene',
      twoSidedSuffix: dir !== 'two-sided',
    });
  }

  const samples = [sampleStats(input.samples[0]?.name ?? '', d1, sw1, ad1, n1Normal, alpha)];
  if (d2) samples.push(sampleStats(input.samples[1]?.name ?? '', d2, sw2, ad2, n2Normal, alpha));

  const powerApprox = algo.id === 'bonett1' || algo.id === 'bonett2';
  const power = powerOf(input, d1, d2, target, powerApprox);
  const numeric = numericOf(r, alpha, target, power.power, powerApprox, input);
  return {
    status: 'ok',
    isK: false,
    allNormal,
    alpha,
    target,
    samples,
    route: { name: algo.name, algoId: algoIdOf(algo.name), reasonKeys: [] },
    varEquality,
    main: mainOf(r, numeric),
    anova: null,
    numeric,
    secondary,
    power,
    pairwise: null,
    residualPlot: null,
    notes: numeric.notes,
  };
}

function analyzeK(input, deps) {
  const groups = input.samples.map(s => s.values ?? []);
  if (groups.length < 2) return insufficient('columns');
  if (groups.some(g => g.length < 3)) return insufficient('min3');

  const { alpha } = input;
  const isVariance = input.category === 'variance';

  // Die Normalitäts-Engines werfen bei einer konstanten Gruppe, die
  // Welch-ANOVA bei einer Gruppe ohne Streuung oder n_i < 2 — „nicht
  // berechenbar“, wie bei einer und zwei Stichproben.
  let sws, ads, groupNormal, allNormal;
  let algo, r, varEquality = null, secondary = null, parametric, meanTest = null;
  try {
    sws = groups.map(g => shapiroWilk(g));
    ads = groups.map(g => andersonDarling(g));
    groupNormal = ads.map(ad => isNormalByAD(ad, alpha));
    allNormal = groupNormal.every(Boolean);
    parametric = allNormal;

    if (isVariance) {
      if (allNormal) { algo = { name: "Bartlett's Test" }; r = bartlettTest(groups, alpha); }
      else { algo = { name: 'Levene Test (Brown-Forsythe)' }; r = leveneTestK(groups, alpha); }
    } else {
      // Welch als Vorgabe, Fisher nur bei angenommenen gleichen Varianzen.
      // Levene steht zur Information daneben; kein Varianz-Vortest wählt den
      // Weg (C1-006, C1-019). Der Wegschritt meldet die Annahme.
      const equalVariances = input.equalVariances === true;
      const lev = leveneTestK(groups, alpha);
      varEquality = { varsEqual: !lev.reject, test: outcome(lev), trailLabelKey: 'varEqualLabel', trailYes: equalVariances };
      const sizes = groups.map(g => g.length);
      meanTest = kMeanRoute(allNormal, sizes, equalVariances);
      parametric = meanTest !== 'kruskal';
      if (meanTest === 'fisher') { algo = { name: 'One-Way ANOVA' }; r = oneWayANOVA(groups, alpha); }
      else if (meanTest === 'welch') { algo = { name: 'Welch ANOVA' }; r = welchANOVA(groups, alpha); }
      else { algo = { name: 'Kruskal-Wallis Test' }; r = kruskalWallis(groups, alpha); }
      if (meanRoute(allNormal, sizes) === 'parametric-large-n') {
        secondary = secondaryOf(kruskalWallis(groups, alpha));
      }
    }
  } catch (err) {
    console.error('[hypothesis-test] k-group test computation failed:', err);
    return insufficient('notComputable');
  }

  let pairwise = null;
  if (groups.length >= 3) {
    if (meanTest === 'fisher' || meanTest === 'welch') {
      // Ein scheiternder Paarvergleich blendet den Abschnitt aus; der Omnibus bleibt
      try {
        pairwise = deps.simultaneousPairwise(groups, alpha, meanTest);
      } catch (err) {
        console.error('[hypothesis-test] pairwise comparisons failed:', err);
        pairwise = null;
      }
    } else {
      pairwise = bonferroniPairwise(groups, alpha, isVariance, parametric);
    }
  }
  if (pairwise) pairwise = { ...pairwise, algoId: algoIdOf(pairwise.methodName) };

  const letters = pairwise?.letters || [];
  const groupCIs = Array.isArray(r.groupCIs) ? r.groupCIs : null;
  const anova = {
    rows: r.testName === 'One-Way ANOVA' ? [
      { source: 'factor', ss: r.SSB, df: r.df1, ms: r.MSB, f: r.statistic, p: r.pValue },
      { source: 'error', ss: r.SSW, df: r.df2, ms: r.MSW, f: null, p: null },
      { source: 'total', ss: r.SST, df: r.df1 + r.df2, ms: null, f: null, p: null },
    ] : null,
    summary: r.S != null ? { s: r.S, r2: r.R2, r2adj: r.R2adj, r2pred: r.R2pred ?? null } : null,
    groups: groups.map((g, i) => {
      const ds = descriptiveStats(g);
      return {
        name: String(input.samples[i].name), n: g.length, mean: ds.mean, variance: ds.variance,
        ci: groupCIs ? groupCIs[i] : null, letters: letters[i] || '',
      };
    }),
  };

  const hasResiduals = meanTest === 'fisher' || meanTest === 'welch';
  const numeric = numericOf(r, alpha, null, null, false, input);
  return {
    status: 'ok',
    isK: true,
    allNormal,
    alpha,
    target: null,
    samples: groups.map((g, i) => sampleStats(input.samples[i].name, g, sws[i], ads[i], groupNormal[i], alpha)),
    route: { name: algo.name, algoId: algoIdOf(algo.name), reasonKeys: [] },
    varEquality,
    main: mainOf(r, numeric),
    anova,
    numeric,
    secondary,
    power: null,
    pairwise,
    residualPlot: hasResiduals ? { residuals: r.residuals, fitted: r.fitted } : null,
    notes: numeric.notes,
  };
}

/**
 * Die ganze Analyse als Zahlen: Normalität je Stichprobe, Weg, Haupttest,
 * Vergleichstest, Teststärke (nicht bei k) und Paarvergleiche (k ≥ 3).
 * Unvollständige Eingaben liefern `{ status: 'insufficient', reason }`
 * statt zu werfen.
 *
 * @param {AnalysisInput} input
 * @param {{ simultaneousPairwise?: typeof simultaneousPairwise }} [deps]  austauschbare
 *   Teilrechnung, nur für Tests (scheiternder Paarvergleich)
 * @returns {Analysis}
 */
export function analyze(input, deps = {}) {
  if (input.testType === 'k') return analyzeK(input, { simultaneousPairwise, ...deps });
  if (input.testType === 'paired') return analyzePaired(input);
  return analyzeOneTwo(input);
}
