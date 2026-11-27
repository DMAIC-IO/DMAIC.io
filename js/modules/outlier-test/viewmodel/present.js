/**
 * D.Mike — Ausreißertest: die Anzeige aus der Rechnung (viewmodel/present.js).
 *
 * Baut aus den Zahlen von domain/analyze.js, was die Oberfläche zeigt:
 * Übersicht, Diagrammwahl, Karten je Verfahren, Tabelle der markierten Punkte
 * und die Konfiguration des Diagramms. Übersetzte Beschriftungen, formatierte
 * Zahlen („–“ für leer) und Darstellungsklassen. Rechnet nichts.
 */
import { formatNumber } from '../../../core/number-format.js';
import { ALL_METHODS, METRIC_KEYS, methodMetrics, flaggedOf } from '../domain/analyze.js';

/** @typedef {import('../domain/analyze.js').Analysis} Analysis */
/** @typedef {(key: string, params?: Record<string, unknown>) => string} Translate */

/** Verfahren → Eintrag im Algorithm Lab. */
export const ALGO_LAB_IDS = Object.freeze({
  'grubbs': 'grubbs-test',
  'dixon-q': 'dixon-q-test',
  'generalized-esd': 'generalized-esd',
  'tukey-iqr': 'tukey-iqr',
  'hampel': 'hampel-identifier',
  'z-score': 'z-score-outlier',
  'modified-z': 'modified-z-score',
});

/** Verfahren → Textschlüssel seines Namens. */
const LABEL_KEYS = Object.freeze({
  'grubbs': 'mGrubbs',
  'dixon-q': 'mDixon',
  'generalized-esd': 'mESD',
  'tukey-iqr': 'mTukey',
  'hampel': 'mHampel',
  'z-score': 'mZScore',
  'modified-z': 'mModZ',
});

/** Verfahren → Kurzname im Kopf der Tabelle. */
const SHORT_LABELS = Object.freeze({
  'grubbs': 'G',
  'dixon-q': 'Q',
  'generalized-esd': 'ESD',
  'tukey-iqr': 'IQR',
  'hampel': 'Ham',
  'z-score': 'Z',
  'modified-z': 'M-Z',
});

/** Seite → Textschlüssel. */
export const SIDE_LABEL_KEYS = Object.freeze({ 'two-sided': 'sideTwo', upper: 'sideUpper', lower: 'sideLower' });

/** Höchstzahl der Chips je Karte; der Rest steht als „+n“. */
const MAX_CHIPS = 12;

/** Präfix der Typedef-Sätze als Hilfeanker. */
const HELP = 'modules.outlier-test.types.';

/**
 * Zahl mit fester Stellenzahl in der Sprache der Oberfläche; „–“ für leer
 * oder nicht endlich.
 * @param {number|null|undefined} v @param {string} lang @param {number} [d] @returns {string}
 */
export function num(v, lang, d = 4) {
  return typeof v === 'number' && Number.isFinite(v) ? formatNumber(v, lang, { decimals: d }) : '–';
}

/**
 * Name eines Verfahrens in der Sprache der Oberfläche.
 * @param {string} id @param {Translate} t @returns {string}
 */
export function methodLabel(id, t) {
  const key = /** @type {Record<string, string>} */ (LABEL_KEYS)[id];
  return key ? t(key) : id;
}

/**
 * Die Verfahren, die gerechnet wurden (mit Ergebnis oder Fehler), in fester
 * Reihenfolge.
 * @param {Analysis} analysis @returns {string[]}
 */
function ranMethods(analysis) {
  return ALL_METHODS.filter((id) => analysis.results[id] || analysis.errs[id]);
}

/**
 * Je markiertem Punkt die Verfahren, die ihn markiert haben.
 * @param {Analysis} analysis @returns {Map<number, Set<string>>}
 */
function flagsByIndex(analysis) {
  /** @type {Map<number, Set<string>>} */
  const map = new Map();
  for (const id of ALL_METHODS) {
    for (const i of analysis.results[id] ? flaggedOf(analysis, id) : []) {
      if (!map.has(i)) map.set(i, new Set());
      /** @type {Set<string>} */ (map.get(i)).add(id);
    }
  }
  return map;
}

/**
 * Die markierten Punkte aller Verfahren, aufsteigend.
 * @param {Analysis} analysis @returns {number[]}
 */
function unionIdxs(analysis) {
  return [...flagsByIndex(analysis).keys()].sort((a, b) => a - b);
}

/**
 * Kacheln der Übersicht: n, Spalte, markierte Punkte, gelaufene Verfahren.
 * @param {number[]} values @param {Analysis} analysis @param {string} colName @param {Translate} t
 */
export function summaryKpis(values, analysis, colName, t) {
  const total = unionIdxs(analysis).length;
  return [
    { value: String(values.length), label: t('common.sym.n'), help: `${HELP}Result.n`, kpiClass: '', valueClass: '' },
    { value: colName, label: t('column'), help: 'modules.outlier-test.fields.colRef.help', kpiClass: '', valueClass: 'dmike-kpi-value--sm' },
    { value: String(total), label: t('flaggedAny'), help: `${HELP}Result.flaggedIdxs`, kpiClass: total > 0 ? 'dmike-kpi--bad' : 'dmike-kpi--good', valueClass: '' },
    { value: String(Object.keys(analysis.results).length), label: t('methodsRun'), help: `${HELP}Result.methods`, kpiClass: '', valueClass: '' },
  ];
}

/**
 * Knöpfe der Diagrammwahl; aktiv ist der wirksame Wert.
 * @param {string[]} options Ziele (`chartMethodOptions`) @param {string} shown wirksames Ziel @param {Translate} t
 */
export function chartSegs(options, shown, t) {
  return options.map((val) => ({
    val,
    label: val === 'all' ? t('chartMethodAll') : methodLabel(val, t),
    activeClass: val === shown ? 'btn--active' : '',
  }));
}

/**
 * Eine Kennzahl der Karte.
 * @param {string} value @param {string} label @param {string} key Schlüssel in `MethodMetrics` oder leer
 * @param {string} [kpiClass] @param {string} [valueClass]
 */
function metric(value, label, key, kpiClass = '', valueClass = '') {
  if (key && !METRIC_KEYS.includes(key)) throw new Error(`METRIC_KEYS kennt „${key}“ nicht`);
  return { value, label, help: key ? `${HELP}MethodMetrics.${key}` : '', kpiClass, valueClass };
}

/**
 * Karte eines gerechneten Verfahrens.
 * @param {string} id @param {any} r Rohergebnis der Engine @param {Translate} t @param {string} lang
 */
function resultCard(id, r, t, lang) {
  const k = r.outliers ? r.outliers.length : 0;
  const M = /** @type {Record<string, number|null>} */ (methodMetrics(id, r) || {});
  const f = (/** @type {number|null|undefined} */ v, d = 4) => num(v, lang, d);
  /** @type {ReturnType<typeof metric>[]} */
  let metrics = [];
  /** @type {object[]} */
  let steps = [];
  let stepsHeader = '';
  let hint = '';
  if (id === 'grubbs') {
    const pBad = r.pValue < r.parameters.alpha;
    metrics = [
      metric(f(M.statistic), t('symG'), 'statistic'),
      metric(f(M.critical), t('symGcrit'), 'critical'),
      metric(f(M.pValue), t('common.sym.p'), 'pValue', pBad ? 'dmike-kpi--bad' : 'dmike-kpi--good'),
      metric(f(M.mean), t('common.sym.xbar'), 'mean'),
      metric(f(M.sd), t('symS'), 'sd'),
    ];
  } else if (id === 'dixon-q') {
    const sideKey = /** @type {Record<string, string>} */ (SIDE_LABEL_KEYS)[r.side];
    metrics = [
      metric(f(M.statistic), t('symQ'), 'statistic'),
      metric(f(M.critical), t('symQcrit'), 'critical'),
      metric(String(r.parameters.variant), t('variant'), '', '', 'dmike-kpi-value--sm'),
      metric(sideKey ? t(sideKey) : String(r.side), t('side'), '', '', 'dmike-kpi-value--sm'),
    ];
  } else if (id === 'generalized-esd') {
    metrics = [
      metric(f(M.detected, 0), t('detected'), 'detected', (M.detected ?? 0) > 0 ? 'dmike-kpi--bad' : 'dmike-kpi--good'),
      metric(f(M.maxOutliers, 0), t('esdMax'), 'maxOutliers'),
    ];
    stepsHeader = t('stepsReject');
    steps = r.steps.map((/** @type {any} */ s) => ({
      i: String(s.i),
      value: f(s.value),
      R: f(s.R),
      lambda: f(s.lambda),
      markIcon: s.R > s.lambda ? 'status.error' : 'status.ok',
      rejectClass: s.R > s.lambda ? 'outliertest__step--reject' : '',
    }));
  } else if (id === 'tukey-iqr') {
    metrics = [
      metric(f(M.q1), t('symQ1'), 'q1'),
      metric(f(M.median), t('median'), 'median'),
      metric(f(M.q3), t('symQ3'), 'q3'),
      metric(f(M.iqr), t('symIqr'), 'iqr'),
      metric(f(M.fenceLower), t('fenceLower'), 'fenceLower'),
      metric(f(M.fenceUpper), t('fenceUpper'), 'fenceUpper'),
    ];
  } else if (id === 'hampel') {
    metrics = [
      metric(f(M.median), t('median'), 'median'),
      metric(f(M.mad), t('symMad'), 'mad'),
      metric(f(M.madScaled), t('symMadScaled'), 'madScaled'),
      metric(f(M.k, 2), t('symK'), 'k'),
      metric(f(M.threshold), t('threshold'), 'threshold'),
    ];
    if (r.degenerate) hint = t('hintDegenerateMad');
  } else if (id === 'z-score') {
    metrics = [
      metric(f(M.mean), t('common.sym.xbar'), 'mean'),
      metric(f(M.sd), t('symS'), 'sd'),
      metric(f(M.threshold, 2), t('threshold'), 'threshold'),
    ];
    if (r.degenerate) hint = t('hintDegenerateSd');
  } else if (id === 'modified-z') {
    metrics = [
      metric(f(M.median), t('median'), 'median'),
      metric(f(M.mad), t('symMad'), 'mad'),
      metric(f(M.threshold, 2), t('threshold'), 'threshold'),
    ];
    if (r.degenerate) hint = t('hintDegenerateMad');
  }

  const chips = [];
  if (k > 0) {
    for (const o of r.outliers.slice(0, MAX_CHIPS)) {
      chips.push({
        text: `#${o.index + 1}: ${f(o.value)}`,
        stat: o.statistic != null ? ` (${f(o.statistic, 3)})` : '',
        cls: 'chip--danger',
      });
    }
    if (k > MAX_CHIPS) chips.push({ text: `+${k - MAX_CHIPS}`, stat: '', cls: 'outliertest__chip--more' });
  }

  return {
    isError: false,
    cardClass: '',
    label: methodLabel(id, t),
    algoId: /** @type {Record<string, string>} */ (ALGO_LAB_IDS)[id] || '',
    verdictIcon: k === 0 ? 'status.ok' : 'status.warning',
    verdictText: k === 0 ? t('verdictClean') : t('verdictFlagged', { count: k }),
    verdictClass: k === 0 ? 'outliertest__verdict--clean' : 'outliertest__verdict--flag',
    errorText: '',
    metrics,
    chips,
    steps,
    stepsHeader,
    hint,
  };
}

/**
 * Text zu einem Fehlercode der Engine; ohne eigenen Text der Code selbst.
 * @param {string} code @param {Translate} t @returns {string}
 */
function errText(code, t) {
  const key = `err_${code}`;
  const text = t(key);
  return text && text !== key ? text : code;
}

/**
 * Karten je gerechnetem Verfahren, in fester Reihenfolge; ein nicht
 * anwendbares Verfahren bekommt eine Fehlerkarte.
 * @param {Analysis} analysis @param {Translate} t @param {string} lang
 */
export function methodCards(analysis, t, lang) {
  return ranMethods(analysis).map((id) => {
    const code = analysis.errs[id];
    if (!code) return resultCard(id, analysis.results[id], t, lang);
    return {
      isError: true,
      cardClass: 'outliertest__card--error',
      label: methodLabel(id, t),
      algoId: /** @type {Record<string, string>} */ (ALGO_LAB_IDS)[id] || '',
      errorText: `${t('errInapplicable')}: ${errText(code, t)}`,
      verdictIcon: '', verdictText: '', verdictClass: '',
      metrics: [], chips: [], steps: [], stepsHeader: '', hint: '',
    };
  });
}

/**
 * Tabelle der markierten Punkte: je Verfahren ohne Fehler eine Spalte, je
 * Punkt eine Zeile (Nummer ab 1, Wert, Haken je Verfahren, Anzahl).
 * @param {number[]} values @param {Analysis} analysis @param {Translate} t @param {string} lang
 */
export function flaggedTable(values, analysis, t, lang) {
  const flags = flagsByIndex(analysis);
  const cols = ALL_METHODS.filter((id) => analysis.results[id]);
  const idxs = [...flags.keys()].sort((a, b) => a - b);
  return {
    show: idxs.length > 0,
    headers: cols.map((id) => ({ short: /** @type {Record<string, string>} */ (SHORT_LABELS)[id] || id, title: methodLabel(id, t) })),
    rows: idxs.map((idx) => {
      const set = /** @type {Set<string>} */ (flags.get(idx));
      return {
        idx: String(idx + 1),
        value: num(values[idx], lang),
        count: String(set.size),
        cells: cols.map((id) => (set.has(id)
          ? { flagged: true, cls: 'outliertest__flag' }
          : { flagged: false, cls: 'outliertest__no-flag' })),
      };
    }),
  };
}

/**
 * Konfiguration des Einzelwertdiagramms: reguläre Werte und, wenn das
 * gezeigte Ziel etwas markiert, die Ausreißer als zweite Gruppe.
 * @param {number[]} values @param {Analysis} analysis @param {string} shown wirksames Ziel
 * @param {string} colName @param {Translate} t
 */
export function chartConfig(values, analysis, shown, colName, t) {
  const flagged = new Set(shown === 'all' ? unionIdxs(analysis) : flaggedOf(analysis, shown));
  /** @type {number[]} */
  const inliers = [];
  /** @type {number[]} */
  const outliers = [];
  values.forEach((v, i) => (flagged.has(i) ? outliers : inliers).push(v));
  const method = shown === 'all' ? t('chartMethodAll') : methodLabel(shown, t);
  const groups = [{ name: t('groupInliers'), values: inliers }];
  if (outliers.length > 0) groups.push({ name: `${t('groupOutliers')} — ${method}`, values: outliers });
  return {
    title: t('chartTitle', { col: colName, method }),
    xLabel: '',
    yLabel: colName,
    showLegend: outliers.length > 0,
    showMedian: true,
    groups,
    pointColors: outliers.length > 0 ? ['var(--color-accent)', 'var(--color-error)'] : ['var(--color-accent)'],
  };
}
