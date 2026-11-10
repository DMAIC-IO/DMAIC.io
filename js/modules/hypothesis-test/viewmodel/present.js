/**
 * D.Mike — Hypothesentest: die Anzeige aus der Analyse (viewmodel/present.js).
 * Baut aus den Zahlen von domain/analyze.js das Anzeigemodell, das die
 * Oberfläche zeigt: übersetzte Beschriftungen,
 * formatierte Zahlen, Darstellungsklassen und Tooltips. Rechnet nichts.
 */
import { formatNumber, roundTo } from '../../../core/number-format.js';
import { algoIdOf } from '../domain/analyze.js';

/** @typedef {import('../domain/analyze.js').AnalysisOk} AnalysisOk */
/** @typedef {import('../domain/analyze.js').Analysis} Analysis */
/** @typedef {import('../domain/analyze.js').Numeric} Numeric */
/** @typedef {import('../domain/analyze.js').SampleStats} SampleStats */
/** @typedef {import('../domain/analyze.js').TestOutcome} TestOutcome */
/** @typedef {(key: string, params?: Record<string, unknown>) => string} Translate */
/** @typedef {{ category: string, testType: string, direction: string, targetType?: string }} PresentModel */

/**
 * Das Anzeigemodell des Ergebnisses (`display` des Viewmodels). Alle
 * Werte sind formatierte Texte: Beschriftungen in der Sprache der
 * Oberfläche, Zahlen mit Dezimalpunkt (meist vier Nachkommastellen, „–“ für
 * nicht endliche Werte); die Klassenfelder sind
 * Darstellungsklassen der Oberfläche.
 *
 * @typedef {object} Result
 * @property {boolean} isK  k-Stichproben-Vergleich
 * @property {boolean} allNormal  alle Stichproben normalverteilt
 * @property {NormCard[]} normCards  Normalitätsprüfung je Stichprobe
 * @property {Route} route  gewähltes Verfahren
 * @property {VarEquality|null} varEquality  Varianzgleichheit
 * @property {MainResult} main  Haupttest
 * @property {Numeric} numeric  das Ergebnis des Haupttests als Zahlen
 * @property {SecondaryResult|null} secondary  Vergleichstest, nur großer Stichprobenweg und Bonett bei zwei Varianzen
 * @property {PowerInfo|null} power  Teststärke, nicht bei k
 * @property {PairwiseSection|null} pairwise  Paarvergleiche, nur bei k ≥ 3
 * @property {ResidualPlot|null} residualPlot  Residuen der einfaktoriellen ANOVA, nur Fisher- und Welch-Weg
 * @property {{ n: number, dropped: number }} [pairInfo]  nur gepaart: Paare und verworfene Zeilen
 */

/**
 * @typedef {object} ResidualPlot
 * @property {number[]} residuals  Residuen je Beobachtung
 * @property {number[]} fitted  angepasste Werte je Beobachtung
 */

/**
 * @typedef {object} Route
 * @property {string} name  Name des Verfahrens
 * @property {string} algoId  Kennung im Algorithm Lab
 */

/**
 * @typedef {object} NormCard
 * @property {string} label  Stichprobe
 * @property {string} badgeClass  Darstellungsklasse des Urteils
 * @property {string} badgeText  Urteil normal oder nicht
 * @property {NormRow[]} rows  Shapiro-Wilk und Anderson-Darling
 * @property {Metric[]} metrics  n, x̄, s, s²
 */

/**
 * @typedef {object} NormRow
 * @property {string} name  Test
 * @property {string} algoId  Kennung im Algorithm Lab
 * @property {string} stat  Statistik
 * @property {string} p  p-Wert
 * @property {string} pClass  Darstellungsklasse des p-Werts
 * @property {string} decisionIcon  Symbol der Entscheidung
 * @property {string} decisionText  Entscheidung
 */

/**
 * Eine Kennzahl. In den Normalitätskarten fehlt `valueClass`, `ci` steht
 * nur dort (leer, wo kein Intervall berechenbar ist); `algoId` nur an der
 * Testmethode und am Hodges-Lehmann-Schätzer.
 *
 * @typedef {object} Metric
 * @property {string} label  Beschriftung
 * @property {string} value  Wert
 * @property {string} [valueClass]  Darstellungsklasse
 * @property {string} title  Tooltip
 * @property {string} [algoId]  Kennung im Algorithm Lab
 * @property {string|null} [ci]  Konfidenzintervall
 */

/**
 * @typedef {object} VarEquality
 * @property {boolean} varsEqual  Varianzen gleich
 * @property {Metric[]|null} metrics  Kennzahlen der Varianzprüfung, nur bei k
 * @property {string} trailLabelKey  Text des Wegschritts
 * @property {boolean} trailYes  Wegschritt mit ja beantwortet
 */

/**
 * @typedef {object} MainResult
 * @property {string} h0  Nullhypothese
 * @property {string} h1  Alternativhypothese
 * @property {string} [ciNote]  Hinweis zum Intervall, nicht bei k
 * @property {string} h0Class  Darstellungsklasse H₀
 * @property {string} h1Class  Darstellungsklasse H₁
 * @property {string} h0Tip  Tooltip H₀
 * @property {string} h1Tip  Tooltip H₁
 * @property {Metric[]} metrics  Testmethode, Statistik, p und mehr
 * @property {AnovaRow[]|null} [anovaRows]  ANOVA-Tabelle, nur k
 * @property {Metric[]|null} [modelSummary]  Modellzusammenfassung S, R², R²(kor), R²(prog), nur Fisher- und Welch-Weg
 * @property {GroupRow[]} [groupRows]  Gruppenübersicht, nur k
 * @property {boolean} [showCi]  Konfidenzintervalle je Gruppe zeigen, nur k
 * @property {string} [ciHeader]  Spaltenkopf der Konfidenzintervalle, nur k
 * @property {boolean} [showCld]  Buchstaben zeigen, nur k
 */

/**
 * @typedef {object} AnovaRow
 * @property {string} src  Quelle
 * @property {string} ss  Quadratsumme
 * @property {string} df  Freiheitsgrade
 * @property {string} ms  mittlere Quadratsumme
 * @property {string} f  F-Wert
 * @property {string} p  p-Wert
 * @property {string} pClass  Darstellungsklasse des p-Werts
 * @property {boolean} bold  hervorgehoben
 */

/**
 * @typedef {object} GroupRow
 * @property {string} name  Gruppe
 * @property {string} n  Anzahl
 * @property {string} mean  Mittelwert
 * @property {string} variance  Varianz
 * @property {string} ci  Konfidenzintervall des Mittelwerts
 * @property {string} letters  Gruppierungsbuchstaben
 */

/**
 * @typedef {object} SecondaryResult
 * @property {Metric[]} metrics  Testmethode, Statistik, p
 * @property {string} title  Abschnittstitel
 * @property {string} note  Hinweis zum Vergleichstest
 */

/**
 * @typedef {object} PowerInfo
 * @property {string} goalPct  Ziel-Teststärke in Prozent
 * @property {string} goalBoxClass  Darstellungsklasse
 * @property {string} requiredLine  benötigter Stichprobenumfang
 * @property {Metric[]} metrics  Power, n, Effekt, α
 * @property {string} note  Hinweis zur Näherung, sonst leer
 */

/**
 * @typedef {object} PairwiseSection
 * @property {string} methodName  Verfahren
 * @property {string} methodAlgoId  Kennung im Algorithm Lab
 * @property {string} hint  Hinweis zur Korrektur
 * @property {string[]} headers  Spaltenköpfe
 * @property {PairwiseRow[]} rows  Zeilen der Matrix
 * @property {string} lettersJoined  Buchstaben je Gruppe
 */

/**
 * @typedef {object} PairwiseRow
 * @property {string} head  Zeilenkopf
 * @property {PairwiseCell[]} cells  Zellen
 */

/**
 * @typedef {object} PairwiseCell
 * @property {string} cls  Darstellungsklasse
 * @property {string} title  Tooltip
 * @property {string} text  angepasster p-Wert
 * @property {string} ci  Konfidenzintervall der Differenz
 * @property {string} key  Zellkennung
 */

/**
 * Eine Zahl als Text mit festen Nachkommastellen, „–“ für nicht endliche Werte.
 * @param {number|null|undefined} v
 * @param {number} [d]
 * @param {string} [lang]  App-Sprache (`de` | `en`)
 * @returns {string}
 */
export function fmt(v, d = 4, lang = 'en') { return v != null && isFinite(v) ? formatNumber(v, lang, { decimals: d }) : '–'; }

/**
 * Formatierer für eine Sprache: Zahl mit festen Nachkommastellen (`f`) und
 * Intervall als Text `[unten; oben]` (`fCi`), in beiden Sprachen gleich.
 * @param {string} lang
 */
function formatters(lang) {
  const f = (v, d) => fmt(v, d, lang);
  return { f, fCi: (ci) => `[${f(ci[0])}; ${f(ci[1])}]` };
}

/** Lab-Kennung oder leer. */
const labId = (name) => algoIdOf(name) ?? '';

/** Vergleichszeichen der Nullhypothese. */
function sym0(direction) {
  return direction === 'two-sided' ? '=' : direction === 'greater' ? '≤' : '≥';
}

/** Vergleichszeichen der Alternativhypothese. */
function sym1(direction) {
  return direction === 'two-sided' ? '≠' : direction === 'greater' ? '>' : '<';
}

/**
 * Tooltip-Nachschlag: Beschriftung → Tooltip. Je `presentResult`-Aufruf
 * einmal gebaut, weil `t` dieselbe Funktion bleibt, während die Sprache
 * zur Laufzeit wechselt.
 * @param {Translate} t
 * @returns {(label: string) => string}
 */
function tipper(t) {
  const ci = t('tipConfidenceInterval');
  const map = new Map([
    [t('testMethod'), t('tipTestMethod')],
    [t('statistic'), t('tipStatistic')],
    [t('currentPower'), t('tipCurrentPower')],
    [t('powerGoal'), t('tipPowerGoal')],
    [t('requiredN'), t('tipRequiredN')],
    [t('varianceRatio'), t('tipVarianceRatio')],
    ['p', t('tipPValue')],
    ['df', t('tipDf')],
    ['n', t('tipN')],
    ['N', t('tipBigN')],
    ['k', t('tipK')],
    ['x̄', t('tipMean')],
    ['x̄₁', t('tipMean1')],
    ['x̄₂', t('tipMean2')],
    ['s', t('tipStdDev')],
    ['s²', t('tipVariance')],
    ['s²₁', t('tipVariance1')],
    ['s²₂', t('tipVariance2')],
    ['s²ₚ', t('tipPooledVar')],
    ['α', t('tipAlpha')],
    ['d̄', t('tipMeanDiff')],
    ["Cohen's d", t('tipCohensD')],
    ["Cohen's d_z", t('tipCohensD')],
    ['S', t('tipModelS')],
    ['R²', t('tipR2')],
    [t('labelR2adj'), t('tipR2adj')],
    [t('labelR2pred'), t('tipR2pred')],
  ]);
  return (label) => {
    if (label.endsWith('KI') || label.endsWith('CI')) return ci;
    return map.get(label) || '';
  };
}

// ── Normalitätskarte ─────────────────────────────────────────

/** @param {SampleStats} s @returns {NormCard} */
function normCard(label, s, alpha, t, tip, lang) {
  const { f, fCi } = formatters(lang);
  const ciSd = s.ciVariance ? [Math.sqrt(s.ciVariance[0]), Math.sqrt(s.ciVariance[1])] : null;
  // Normalitätsannahme je Test: Ablehnen von H₀ (✗) heißt, die Annahme
  // ist verletzt, Nicht-Ablehnen (✓), sie hält — status.warning/status.ok,
  // nicht status.error: eine verletzte Annahme ist ein Befund, kein
  // Rechenfehler.
  const decisionIcon = (p) => p < alpha ? 'status.warning' : 'status.ok';
  const decisionText = (p) => p < alpha ? t('reject') : t('notReject');
  const pCls = (p) => p < alpha ? 'hyptest__text-danger' : 'hyptest__text-success';
  return {
    label: String(label),
    badgeClass: s.normal ? 'hyptest__badge--pass' : 'hyptest__badge--fail',
    badgeText: s.normal ? t('normal') : t('notNormal'),
    rows: [
      { name: 'Shapiro-Wilk', algoId: labId('Shapiro-Wilk'), stat: f(s.sw.w), p: f(s.sw.p), pClass: pCls(s.sw.p), decisionIcon: decisionIcon(s.sw.p), decisionText: decisionText(s.sw.p) },
      { name: 'Anderson-Darling', algoId: labId('Anderson-Darling'), stat: f(s.ad.a2), p: f(s.ad.p), pClass: pCls(s.ad.p), decisionIcon: decisionIcon(s.ad.p), decisionText: decisionText(s.ad.p) },
    ],
    metrics: [
      { label: t('common.sym.n'), value: String(s.n), title: tip('n') },
      { label: t('common.sym.xbar'), value: f(s.mean), ci: s.ciMean ? fCi(s.ciMean) : null, title: tip('x̄') },
      { label: t('symS'), value: f(s.sd), ci: ciSd ? fCi(ciSd) : null, title: tip('s') },
      { label: t('common.sym.s2'), value: f(s.variance), ci: s.ciVariance ? fCi(s.ciVariance) : null, title: tip('s²') },
    ],
  };
}

// ── Haupttest (eine, zwei, gepaarte Stichproben) ─────────────

/** @param {AnalysisOk} a @param {PresentModel} model @returns {MainResult} */
function mainResult(a, model, t, tip, lang) {
  const { f, fCi } = formatters(lang);
  const { main: r, alpha, target } = a;
  const x = r.extra || {};
  const s0 = sym0(model.direction);
  const s1 = sym1(model.direction);
  const isVariance = model.category === 'variance';
  const isTwo = model.testType === 'two';
  const isPaired = model.testType === 'paired';
  let h0, h1;
  if (isVariance) {
    h0 = isTwo ? `σ²₁ ${s0} σ²₂` : `σ² ${s0} ${f(target)}`;
    h1 = isTwo ? `σ²₁ ${s1} σ²₂` : `σ² ${s1} ${f(target)}`;
  } else if (isPaired) {
    h0 = `μ_d ${s0} ${f(target)}`;
    h1 = `μ_d ${s1} ${f(target)}`;
  } else {
    h0 = isTwo ? `μ₁ ${s0} μ₂` : `μ ${s0} ${f(target)}`;
    h1 = isTwo ? `μ₁ ${s1} μ₂` : `μ ${s1} ${f(target)}`;
  }

  const pCls = r.p < alpha ? 'hyptest__metric-value--danger' : 'hyptest__metric-value--success';
  const metrics = [
    { label: t('testMethod'), value: r.name, algoId: labId(r.name), valueClass: 'hyptest__metric-value--sm', title: tip(t('testMethod')) },
    { label: t('statistic'), value: f(r.statistic), valueClass: '', title: tip(t('statistic')) },
    { label: t('common.sym.p'), value: f(r.p), valueClass: pCls, title: r.pMethod ? `${tip('p')} (${r.pMethod === 'exact' ? t('pMethodExact') : t('pMethodNormal')})` : tip('p') },
  ];
  if (r.df != null) {
    metrics.push({ label: t('common.sym.df'), value: (typeof r.df === 'number' && r.df % 1) ? f(r.df, 1) : String(r.df), valueClass: '', title: tip('df') });
  }
  const level = Math.round((1 - alpha) * 100);
  const isMeanDiff = !isVariance && isTwo && r.ci != null;
  if (isVariance && isTwo && x.ratio != null) {
    metrics.push({ label: t('varianceRatio'), value: f(x.ratio), valueClass: '', title: tip(t('varianceRatio')) });
  }
  if (r.ci) {
    const ciLabel = isPaired ? t('ciPairedDiffLabel', { level })
      : isMeanDiff ? t('ciDiffLabel', { level })
      : isVariance && isTwo ? t('ciRatioLabel', { level })
      : t('ciLabel', { level });
    // Bonett: ein in Stücke zerfallenes Konfidenzgebiet hat kein Intervall (Minitab: „(*; *)“)
    metrics.push({ label: ciLabel, value: r.ciUndefined ? '–' : fCi(r.ci), valueClass: 'hyptest__metric-value--sm', title: tip('KI') });
  }
  if (r.ciSigma) {
    metrics.push({ label: t('ciSigmaLabel', { level }), value: fCi(r.ciSigma), valueClass: 'hyptest__metric-value--sm', title: tip('KI') });
  }
  if (r.hl) {
    const achieved = f(r.hl.achievedConfidence * 100, 1);
    const methodText = r.hl.method === 'exact' ? t('pMethodExact') : t('pMethodNormal');
    metrics.push({ label: t('hlEstimateLabel'), value: f(r.hl.estimate), valueClass: '', title: t('tipHlEstimate'), algoId: labId('Hodges-Lehmann') });
    metrics.push({
      label: t('ciShiftLabel', { level: achieved }),
      value: fCi([r.hl.lower, r.hl.upper]),
      valueClass: 'hyptest__metric-value--sm',
      title: t('ciShiftTip', { level, achieved, method: methodText }),
    });
  }
  if (x.meanDiff != null) {
    metrics.push({ label: t('symXbar1'), value: f(x.mean1), valueClass: '', title: tip('x̄₁') });
    metrics.push({ label: t('symXbar2'), value: f(x.mean2), valueClass: '', title: tip('x̄₂') });
    metrics.push({ label: t('symDbar'), value: f(x.meanDiff), valueClass: '', title: tip('d̄') });
  } else if (x.mean != null) {
    metrics.push({ label: t('common.sym.xbar'), value: f(x.mean), valueClass: '', title: tip('x̄') });
  }
  if (x.meanDiff == null && x.mean1 != null) {
    metrics.push({ label: t('symXbar1'), value: f(x.mean1), valueClass: '', title: tip('x̄₁') });
    metrics.push({ label: t('symXbar2'), value: f(x.mean2), valueClass: '', title: tip('x̄₂') });
  }
  if (x.sampleVariance != null) {
    metrics.push({ label: t('common.sym.s2'), value: f(x.sampleVariance), valueClass: '', title: tip('s²') });
  }
  if (x.variance1 != null && !x.pooledVariance) {
    metrics.push({ label: t('symS21'), value: f(x.variance1), valueClass: '', title: tip('s²₁') });
    metrics.push({ label: t('symS22'), value: f(x.variance2), valueClass: '', title: tip('s²₂') });
  }

  const h0Tip = r.reject
    ? `${t('h0Rejected')}: p (${f(r.p)}) < α (${formatNumber(alpha, lang)})`
    : `${t('h0NotRejected')}: p (${f(r.p)}) ≥ α (${formatNumber(alpha, lang)})`;
  const h1Tip = r.reject
    ? `${t('significant')}: ${t('h0Rejected')}`
    : `${t('notSignificant')}: ${t('h0NotRejected')}`;

  const ciNote = a.notes.map((w) => {
    if (w.code === 'ciRatioUndefinedNote') return t(w.code);
    if (w.code === 'ciShiftTooSmall') {
      // Wie bisher: gefordert ganzzahlig, erreicht mit einer Nachkommastelle. Nur
      // bei numerischem Gleichstand (sehr kleines α: „100 % – erreicht 100,0 %“)
      // beide gemeinsam genauer, so wenig wie nötig.
      const got = w.values.achieved * 100;
      if (level !== roundTo(got, 1)) return t(w.code, { level, achieved: f(got, 1) });
      const want = (1 - alpha) * 100;
      let d = 1;
      while (d < 6 && roundTo(want, d) === roundTo(got, d)) d++;
      return t(w.code, { level: f(want, d), achieved: f(got, d) });
    }
    return t(w.code, { lo: f(w.values.lo), hi: f(w.values.hi) });
  }).join(' ');

  return {
    h0, h1, ciNote,
    h0Class: r.reject ? 'hyptest__h-box--rejected' : 'hyptest__h-box--accepted',
    h1Class: r.reject ? 'hyptest__h-box--accepted' : 'hyptest__h-box--rejected',
    h0Tip, h1Tip,
    metrics,
  };
}

// ── Haupttest (k Stichproben) ────────────────────────────────

/**
 * Modellzusammenfassung der einfaktoriellen Anpassung im Stil von Minitab
 * (C1-020): S mit vier Nachkommastellen, R²-Werte in Prozent mit zwei,
 * bei 0 % abgeschnitten; R²(prog) fehlt, wenn eine Gruppe nur einen Wert hat.
 * @returns {Metric[]}
 */
function modelSummary(summary, t, tip, lang) {
  const { f } = formatters(lang);
  const pct = (v) => (v != null && isFinite(v) ? `${f(Math.max(0, v) * 100, 2)} %` : '–');
  const row = (label, value) => ({ label, value, title: tip(label) });
  return [
    row('S', f(summary.s)),
    row('R²', pct(summary.r2)),
    row(t('labelR2adj'), pct(summary.r2adj)),
    row(t('labelR2pred'), pct(summary.r2pred)),
  ];
}

/** @param {AnalysisOk} a @param {PresentModel} model @returns {MainResult} */
function kMainResult(a, model, t, tip, lang) {
  const { f, fCi } = formatters(lang);
  const { main: r, alpha, anova } = a;
  const x = r.extra || {};
  const isVariance = model.category === 'variance';
  const has2Df = x.df1 != null && r.df2 != null;
  const h0 = isVariance ? 'σ²₁ = σ²₂ = … = σ²ₖ' : 'μ₁ = μ₂ = … = μₖ';
  const h1 = isVariance ? t('kSampleVarH1') : t('kSampleH1');
  // Die df2 der Welch-ANOVA sind gebrochen (Satterthwaite)
  const df2Display = has2Df && r.name === 'Welch ANOVA' ? f(r.df2, 2) : String(r.df2);
  const dfDisplay = has2Df ? `${x.df1} / ${df2Display}` : String(r.df);
  const pCls = r.p < alpha ? 'hyptest__metric-value--danger' : 'hyptest__metric-value--success';

  const metrics = [
    { label: t('testMethod'), value: r.name, algoId: labId(r.name), valueClass: 'hyptest__metric-value--sm', title: tip(t('testMethod')) },
    { label: t('statistic'), value: f(r.statistic), valueClass: '', title: tip(t('statistic')) },
    { label: t('common.sym.df'), value: dfDisplay, valueClass: '', title: tip('df') },
    { label: t('common.sym.p'), value: f(r.p), valueClass: pCls, title: tip('p') },
    { label: t('symK'), value: String(x.k), valueClass: '', title: tip('k') },
  ];
  if (x.N != null) metrics.push({ label: t('symBigN'), value: String(x.N), valueClass: '', title: tip('N') });
  if (x.pooledVariance != null) metrics.push({ label: t('symS2p'), value: f(x.pooledVariance), valueClass: '', title: tip('s²ₚ') });

  let anovaRows = null;
  if (anova.rows) {
    const dCls = r.p < alpha ? 'hyptest__text-danger' : 'hyptest__text-success';
    const SRC = { factor: 'between', error: 'within', total: 'total' };
    const dash = (v) => (v == null ? '—' : f(v));
    anovaRows = anova.rows.map(row => ({
      src: t(SRC[row.source]),
      ss: f(row.ss),
      df: String(row.df),
      ms: dash(row.ms),
      f: dash(row.f),
      p: dash(row.p),
      pClass: row.source === 'factor' ? dCls : '',
      bold: row.source === 'total',
    }));
  }

  const showCld = a.pairwise != null && a.pairwise.letters.length > 0;
  const showCi = anova.groups.some(g => g.ci);
  const groupRows = anova.groups.map(g => ({
    name: g.name, n: String(g.n), mean: f(g.mean), variance: f(g.variance),
    ci: g.ci ? fCi(g.ci) : '', letters: g.letters,
  }));

  return {
    h0, h1,
    h0Class: r.reject ? 'hyptest__h-box--rejected' : 'hyptest__h-box--accepted',
    h1Class: r.reject ? 'hyptest__h-box--accepted' : 'hyptest__h-box--rejected',
    h0Tip: '', h1Tip: '',
    metrics,
    anovaRows,
    modelSummary: anova.summary ? modelSummary(anova.summary, t, tip, lang) : null,
    groupRows,
    showCi,
    ciHeader: t('groupCi', { level: Math.round((1 - alpha) * 100) }),
    showCld,
  };
}

// ── Vergleichstest, Varianzgleichheit, Teststärke ────────────

/** @returns {SecondaryResult} */
function secondaryResult(sec, alpha, t, tip, lang) {
  const { f } = formatters(lang);
  const r = sec.test;
  const pCls = r.p < alpha ? 'hyptest__metric-value--danger' : 'hyptest__metric-value--success';
  const methodLabel = sec.twoSidedSuffix ? `${t('testMethod')} (${t('twoSidedSuffix')})` : t('testMethod');
  return {
    metrics: [
      { label: methodLabel, value: r.name, algoId: labId(r.name), valueClass: 'hyptest__metric-value--sm', title: tip(t('testMethod')) },
      { label: t('statistic'), value: f(r.statistic), valueClass: '', title: tip(t('statistic')) },
      { label: t('common.sym.p'), value: f(r.p), valueClass: pCls, title: tip('p') },
    ],
    title: t(sec.titleKey),
    note: t(sec.noteKey),
  };
}

/**
 * Kennzahlen der Varianzprüfung (Levene bei k Mittelwerten).
 * @param {TestOutcome} ve
 * @returns {Metric[]}
 */
function varEqualityMetrics(ve, alpha, t, tip, lang) {
  const { f } = formatters(lang);
  const x = ve.extra || {};
  const pCls = ve.p < alpha ? 'hyptest__metric-value--danger' : 'hyptest__metric-value--success';
  return [
    { label: t('testMethod'), value: ve.name, algoId: labId(ve.name), valueClass: 'hyptest__metric-value--sm', title: tip(t('testMethod')) },
    { label: t('statistic'), value: f(ve.statistic), valueClass: '', title: tip(t('statistic')) },
    { label: t('common.sym.df'), value: `${x.df1} / ${ve.df2}`, valueClass: '', title: tip('df') },
    { label: t('common.sym.p'), value: f(ve.p), valueClass: pCls, title: tip('p') },
  ];
}

/** @param {AnalysisOk} a @returns {VarEquality|null} */
function varEqualityOf(a, t, tip, lang) {
  const ve = a.varEquality;
  if (!ve) return null;
  if (ve.test) {
    return {
      metrics: varEqualityMetrics(ve.test, a.alpha, t, tip, lang),
      varsEqual: ve.varsEqual,
      trailLabelKey: ve.trailLabelKey, trailYes: ve.trailYes,
    };
  }
  return { varsEqual: ve.varsEqual, metrics: null, trailLabelKey: ve.trailLabelKey, trailYes: ve.trailYes };
}

/** @param {NonNullable<AnalysisOk['power']>} pw @returns {PowerInfo} */
function powerInfo(pw, alpha, t, tip, lang) {
  const { f } = formatters(lang);
  const effLabel = pw.effectKind === 'varianceRatio' ? t('varianceRatio')
    : pw.effectKind === 'cohenDz' ? "Cohen's d_z" : "Cohen's d";
  const two = pw.n.length > 1;
  const goalPct = f(pw.goal * 100, 0);
  const goalReached = pw.power >= pw.goal;
  const nDisplay = pw.requiredN >= 5000 ? '> 5000' : String(pw.requiredN);
  const requiredLine = `${t('requiredN')}${two ? ` (${t('perGroup')})` : ''}: ${nDisplay}`
    + ` — ${goalReached ? `✓ ${t('achieved')}` : `✗ ${t('notAchieved')}`}`;

  return {
    goalPct,
    goalBoxClass: goalReached ? 'hyptest__decision--accept' : 'hyptest__decision--warn',
    requiredLine,
    note: pw.approx ? t('powerNormalApprox') : '',
    metrics: [
      { label: t('currentPower'), value: `${f(pw.power * 100, 1)}%`, valueClass: goalReached ? 'hyptest__metric-value--success' : 'hyptest__metric-value--warning', title: tip(t('currentPower')) },
      { label: t('common.sym.n'), value: pw.n.join(' / '), valueClass: '', title: tip('n') },
      { label: effLabel, value: f(pw.effect, 3), valueClass: '', title: tip(effLabel) },
      { label: t('symAlpha'), value: formatNumber(alpha, lang), valueClass: '', title: tip('α') },
    ],
  };
}

// ── Paarvergleiche ───────────────────────────────────────────

/** @param {AnalysisOk} a @returns {PairwiseSection} */
function pairwiseSection(a, t, lang) {
  const { f, fCi } = formatters(lang);
  const { comparisons, m, methodName, letters, isRank, simultaneous } = a.pairwise;
  const names = a.samples.map(s => s.name);
  const k = names.length;
  const find = (i, j) => comparisons.find(c => (c.i === i && c.j === j) || (c.i === j && c.j === i));
  const rows = [];
  for (let i = 0; i < k; i++) {
    const cells = [];
    for (let j = 0; j < k; j++) {
      if (j <= i) {
        cells.push({ cls: 'hyptest__pairwise-empty', title: '', text: '—', ci: '', key: `${i}-${j}` });
      } else {
        const c = find(i, j);
        const cls = c.equal ? 'hyptest__pairwise-equal' : 'hyptest__pairwise-diff';
        const verdict = c.equal ? t('pairwiseEqual') : t('pairwiseDifferent');
        // Tukey / Games-Howell liefern nur angepasste p-Werte
        const title = c.p != null
          ? `p=${f(c.p)}  ·  p_adj=${f(c.pAdj)}  ·  ${verdict}`
          : `p_adj=${f(c.pAdj)}  ·  ${verdict}`;
        const ci = c.ci ? fCi(c.ci) : '';
        cells.push({ cls, title, text: f(c.pAdj), ci, key: `${i}-${j}` });
      }
    }
    rows.push({ head: names[i], cells });
  }
  const methodHint = simultaneous
    ? t('pairwiseSimultaneousHint', { level: Math.round((1 - a.alpha) * 100) })
    : t('pairwiseHint', { m });
  return {
    methodName,
    methodAlgoId: labId(methodName),
    hint: comparisons.some(c => c.ci)
      ? `${methodHint}; ${t(isRank ? 'pairwiseShiftCiHint' : 'pairwiseCiHint')}`
      : methodHint,
    headers: names.slice(),
    rows,
    lettersJoined: letters.join(', '),
  };
}

// ── Einstieg ─────────────────────────────────────────────────

/**
 * Setzt an jeder Kennzahl `algoId` (leer, wo keine Kennung besteht), damit der
 * Pfad für das Lab-Link-Widget immer einen Text liefert.
 * @template {{ metrics?: Metric[]|null }} S
 * @param {S|null} section  Abschnitt mit Kennzahlen
 * @returns {S|null}
 */
function withAlgoIds(section) {
  if (!section?.metrics) return section;
  return { ...section, metrics: section.metrics.map((m) => ({ ...m, algoId: m.algoId ?? '' })) };
}

/**
 * Das Anzeigemodell einer gelungenen Analyse.
 * @param {AnalysisOk} analysis  Ergebnis von `analyze()` mit `status: 'ok'`
 * @param {Translate} t  Übersetzer des Moduls
 * @param {PresentModel} model  Konfiguration (Kategorie, Testart, Richtung)
 * @param {string} [lang]  App-Sprache für die Zahlen (`de` | `en`)
 * @returns {Result}
 */
export function presentResult(analysis, t, model, lang = 'en') {
  const a = analysis;
  const tip = tipper(t);
  const isPaired = model.testType === 'paired';
  const label = (s, i) => a.isK ? s.name : isPaired ? t('differences') : `S${i + 1}`;
  /** @type {Result} */
  const result = {
    isK: a.isK,
    allNormal: a.allNormal,
    normCards: a.samples.map((s, i) => normCard(label(s, i), s, a.alpha, t, tip, lang)),
    route: { name: a.route.name, algoId: a.route.algoId ?? '' },
    varEquality: withAlgoIds(varEqualityOf(a, t, tip, lang)),
    main: withAlgoIds(a.isK ? kMainResult(a, model, t, tip, lang) : mainResult(a, model, t, tip, lang)),
    numeric: a.numeric,
    secondary: a.secondary ? withAlgoIds(secondaryResult(a.secondary, a.alpha, t, tip, lang)) : null,
    power: a.power ? powerInfo(a.power, a.alpha, t, tip, lang) : null,
    pairwise: a.pairwise ? pairwiseSection(a, t, lang) : null,
    residualPlot: a.residualPlot,
  };
  if (a.pairInfo) result.pairInfo = a.pairInfo;
  return result;
}

/**
 * Der Hinweistext zu unvollständigen Eingaben, wie bisher `errorText`:
 * leer, wo die Oberfläche nur auf Eingaben wartet.
 * @param {Analysis} analysis
 * @param {Translate} t
 * @returns {string}
 */
export function insufficientText(analysis, t) {
  if (analysis.status !== 'insufficient') return '';
  if (analysis.reason === 'paired') return t('pairedTooFew', { count: analysis.count, n: analysis.count });
  if (analysis.reason === 'noVariation') return t('pairedNoVariation');
  if (analysis.reason === 'notComputable') return t('testNotComputable');
  return '';
}

// ── Residuendiagramme ────────────────────────────────────────

/** @typedef {{ fitted: object, prob: object, hist: object, order: object }} ResidualCharts */

/** Je Ergebnisobjekt einmal gebaut: vier Getter lesen dasselbe. @type {WeakMap<object, { t: Translate, charts: ResidualCharts }>} */
const residualCache = new WeakMap();

/**
 * Die vier Residuendiagramme (Fisher / Welch). Die Residuen sind durch ihre
 * Stichprobenstandardabweichung standardisiert, wie im Regressionsmodul.
 * @param {{ residualPlot?: { residuals: number[], fitted: number[] }|null }|null|undefined} result  Ergebnis von `analyze()`
 * @param {Translate} t
 * @returns {ResidualCharts|null}  `null`, wenn keine Residuen vorliegen
 */
export function residualCharts(result, t) {
  const plot = result?.residualPlot;
  if (!plot) return null;
  const hit = residualCache.get(result);
  if (hit && hit.t === t) return hit.charts;

  const { residuals, fitted } = plot;
  const n = residuals.length;
  const mean = residuals.reduce((a, v) => a + v, 0) / n;
  const sd = Math.sqrt(residuals.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
  const standardized = residuals.map((v) => (sd > 0 ? (v - mean) / sd : 0));
  const order = residuals.map((_, i) => i + 1);
  const zeroLine = [{ dir: 'h', value: 0, dash: 'dash', width: 1, color: 'var(--color-error)', label: '0' }];
  const dot = (color, x, y) => ({
    name: t('residuals'), color, markerSize: 4, strokeWidth: 0.75, symbol: 'circle', x, y,
  });
  /** @type {ResidualCharts} */
  const charts = {
    fitted: {
      title: t('residualsVsFitted'), xLabel: t('fittedValues'), yLabel: t('residuals'),
      showLegend: false, refLines: zeroLine, series: [dot('var(--color-chart-3)', fitted, residuals)],
    },
    prob: {
      title: t('residualsNormalPlot'), xLabel: t('residuals'), yLabel: t('residualsPercent'),
      showLegend: false,
      series: [{ name: t('residuals'), values: standardized, color: 'var(--color-chart-5)' }],
    },
    hist: {
      title: t('residualsHistogram'), xLabel: t('residuals'), yLabel: t('residualsFrequency'),
      showLegend: false, showNormalCurve: true, data: residuals,
    },
    order: {
      title: t('residualsVsOrder'), xLabel: t('residualsVsOrderByGroup'), yLabel: t('residuals'),
      showLegend: false, refLines: zeroLine, series: [dot('var(--color-chart-4)', order, residuals)],
    },
  };
  residualCache.set(result, { t, charts });
  return charts;
}

// ── Hypothesenvorschau ───────────────────────────────────────

/**
 * H₀ und H₁ als Text, schon vor der ersten Analyse.
 * @param {PresentModel} model
 * @param {Translate} t
 * @returns {{ h0: string, h1: string }}
 */
export function previewHypotheses(model, t) {
  const s0 = sym0(model.direction);
  const s1 = sym1(model.direction);
  const isMean = model.category === 'mean';
  const isTwo = model.testType === 'two';
  if (model.testType === 'k') {
    return {
      h0: isMean ? 'H₀: μ₁ = μ₂ = … = μₖ' : 'H₀: σ²₁ = σ²₂ = … = σ²ₖ',
      h1: isMean ? `H₁: ${t('kSampleH1')}` : `H₁: ${t('kSampleVarH1')}`,
    };
  }
  if (model.testType === 'paired') return { h0: `H₀: μ_d ${s0} μ_d₀`, h1: `H₁: μ_d ${s1} μ_d₀` };
  if (!isMean) {
    return isTwo
      ? { h0: `H₀: σ²₁ ${s0} σ²₂`, h1: `H₁: σ²₁ ${s1} σ²₂` }
      : { h0: `H₀: σ² ${s0} σ²₀`, h1: `H₁: σ² ${s1} σ²₀` };
  }
  return isTwo
    ? { h0: `H₀: μ₁ ${s0} μ₂`, h1: `H₁: μ₁ ${s1} μ₂` }
    : { h0: `H₀: μ ${s0} μ₀`, h1: `H₁: μ ${s1} μ₀` };
}
