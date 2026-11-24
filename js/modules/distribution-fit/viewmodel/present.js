/**
 * D.Mike — Verteilungstest: die Anzeige aus der Rechnung (viewmodel/present.js).
 *
 * Baut aus dem Rohergebnis der Engine (domain/analyze.js), was die
 * Oberfläche zeigt: KPI-Streifen, Rangliste, Detailkacheln,
 * Normalitätskarten mit Konsens und die Konfiguration des Histogramms.
 * Übersetzte Beschriftungen, formatierte Zahlen („–“ für leer) und
 * Darstellungsklassen. Rechnet nichts.
 */
import { formatNumber, decimalSeparator } from '../../../core/number-format.js';
import { ALGO_LAB_IDS } from '../domain/analyze.js';

/** @typedef {(key: string, params?: Record<string, unknown>) => string} Translate */
/** @typedef {'good'|'moderate'|'poor'} Quality */

/**
 * Zahl mit fester Stellenzahl in der Sprache der Oberfläche: im Bereich
 * |v| ≥ 10⁶ oder 0 < |v| < 10⁻⁴ in Exponentialform (Dezimalzeichen der
 * Sprache), „–“ für leer oder nicht endlich.
 * @param {unknown} v @param {string} lang @param {number} [d] @returns {string}
 */
export function fmt(v, lang, d = 4) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '–';
  const abs = Math.abs(v);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) return v.toExponential(d).replace('.', decimalSeparator(lang));
  return formatNumber(v, lang, { decimals: d });
}

/**
 * p-Wert: unter 10⁻⁴ als 0 mit vier Stellen, sonst wie `fmt`.
 * @param {unknown} p @param {string} lang @returns {string}
 */
export function pText(p, lang) {
  return typeof p === 'number' && p < 0.0001 ? formatNumber(0, lang, { decimals: 4 }) : fmt(p, lang);
}

/**
 * Güte eines p-Werts: ab 0,10 gut, ab 0,05 mäßig, sonst schlecht.
 * @param {number} p @returns {Quality}
 */
export function quality(p) {
  return p >= 0.1 ? 'good' : p >= 0.05 ? 'moderate' : 'poor';
}

/** @param {string} s @returns {string} erster Buchstabe groß */
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** @param {number} rank @returns {string} Klasse der Rangmarke */
const rankClass = (rank) => `distfit__rank--${rank <= 3 ? String(rank) : 'other'}`;

/**
 * Die Parameter einer Verteilung als „k=Wert“.
 * @param {Record<string, unknown>} params @param {string} lang
 * @returns {{ key: string, val: string }[]}
 */
function paramRows(params, lang) {
  return Object.entries(params ?? {}).map(([key, v]) => ({ key, val: typeof v === 'number' ? fmt(v, lang) : String(v) }));
}

/**
 * Die acht Kacheln der Kennwerte.
 * @param {any} stats Kennwerte der Engine
 * @param {Translate} t @param {string} lang
 * @returns {{ value: string, label: string, help: string }[]}
 */
export function kpiCells(stats, t, lang) {
  return [
    { value: String(stats.n), label: t('common.sym.n'), help: 'modules.distribution-fit.types.DescStats.n' },
    { value: fmt(stats.mean, lang), label: t('mean'), help: 'modules.distribution-fit.types.DescStats.mean' },
    { value: fmt(stats.stdDev, lang), label: t('stdDev'), help: 'modules.distribution-fit.types.DescStats.stdDev' },
    { value: fmt(stats.median, lang), label: t('median'), help: 'modules.distribution-fit.types.DescStats.median' },
    { value: fmt(stats.skewness, lang), label: t('skewness'), help: 'modules.distribution-fit.types.DescStats.skewness' },
    { value: fmt(stats.kurtosis, lang), label: t('kurtosisExcess'), help: 'modules.distribution-fit.types.DescStats.kurtosis' },
    { value: fmt(stats.min, lang), label: t('min'), help: 'modules.distribution-fit.types.DescStats.min' },
    { value: fmt(stats.max, lang), label: t('max'), help: 'modules.distribution-fit.types.DescStats.max' },
  ];
}

/**
 * Die Zeilen der Rangliste, beste Anpassung zuerst. Die Parameter trennt
 * „; “, weil das Dezimalkomma sonst mehrdeutig wäre.
 * @param {any[]} results angepasste Verteilungen der Engine
 * @param {Translate} t @param {string} lang
 */
export function rankRows(results, t, lang) {
  return results.map((r, i) => {
    const rank = i + 1;
    const isDisc = r.type === 'disc';
    const q = quality(r.score);
    return {
      rank,
      rankClass: rankClass(rank),
      name: r.name,
      nameText: `${r.name} `,
      typeTagText: isDisc ? t('tagDisc') : t('tagCont'),
      typeTagClass: isDisc ? 'distfit__tag--disc' : 'distfit__tag--cont',
      isBest: i === 0,
      params: paramRows(r.params, lang).map((p) => `${p.key}=${p.val}`).join('; '),
      testName: isDisc ? t('symChi2') : t('symKs'),
      statVal: isDisc ? fmt(r.chi2?.chi2, lang) : fmt(r.ks?.D, lang),
      q,
      pCellClass: `distfit__p-cell--${q}`,
      pS: pText(r.score, lang),
      barClass: `distfit__fit-bar-inner--${q}`,
      barStyle: `width:${Math.max(5, Math.min(100, r.score * 500))}%`,
      qL: t(`fit${cap(q)}`),
    };
  });
}

/**
 * Je Verteilung eine Detailkachel: Parameter, Gütetest, Deutung.
 * @param {any[]} results angepasste Verteilungen der Engine
 * @param {Translate} t @param {string} lang
 */
export function detailTiles(results, t, lang) {
  return results.map((r, i) => {
    const rank = i + 1;
    const isDisc = r.type === 'disc';
    const q = quality(r.score);
    const pill = q === 'good' ? 'pass' : q === 'moderate' ? 'warn' : 'fail';
    return {
      rank,
      rankClass: rankClass(rank),
      titleText: ` ${r.name} `,
      typeTagText: isDisc ? t('tagDisc') : t('tagCont'),
      typeTagClass: isDisc ? 'distfit__tag--disc' : 'distfit__tag--cont',
      isBest: i === 0,
      pillClass: `distfit__ndd-pill--${pill}`,
      qL: t(`fit${cap(q)}`),
      paramsLabel: t('colParams'),
      paramRows: paramRows(r.params, lang),
      gofLabel: `${t('detailGofTest')} (${isDisc ? t('symChi2') : t('symKs')})`,
      statRowLabel: `${t('nddStatistic')} (${isDisc ? t('symChi2') : t('symKsD')})`,
      statVal: fmt(isDisc ? r.chi2?.chi2 : r.ks?.D, lang),
      isDisc,
      df: isDisc ? String(r.chi2?.df) : '',
      pRowLabel: t('colP'),
      pClass: `distfit__p-cell--${q}`,
      pS: pText(r.score, lang),
      interpClass: `distfit__interpret--${q}`,
      interpText: t(`interp${cap(q)}`),
    };
  });
}

/** Je Test: Statistikname, Feld der Statistik, Beschreibung. */
const TEST_INFO = Object.freeze({
  'Shapiro-Wilk': { statL: 'W', key: 'W', desc: 'nddSWDesc', tooSmall: 'nddTooSmall' },
  'Anderson-Darling': { statL: 'A²', key: 'A2', desc: 'nddADDesc', tooSmall: 'nddTooSmall' },
  'Jarque-Bera': { statL: 'JB', key: 'JB', desc: 'nddJBDesc', tooSmall: 'nddTooSmallJB' },
});
/** Alle übrigen Tests (D'Agostino-Pearson). */
const OTHER_TEST = Object.freeze({ statL: 'K²', key: 'K2', desc: 'nddDPDesc', tooSmall: 'nddTooSmallDP' });

/**
 * Die Normalitäts-Tiefenanalyse: je Test eine Karte, Konsens und Punkte.
 * Ohne Tests ist sie nicht zu zeigen.
 * @param {any[]} tests Normalitätstests der Engine
 * @param {Translate} t @param {string} lang
 */
export function normality(tests, t, lang) {
  if (!tests || tests.length === 0) {
    return { show: false, cards: [], dots: [], consensus: { cls: '', title: '', text: '', scoreLabel: '' } };
  }
  const valid = tests.filter((tt) => !tt.tooSmall && typeof tt.p === 'number' && !Number.isNaN(tt.p));
  const pass = valid.filter((tt) => tt.p >= 0.1).length;
  const fail = valid.filter((tt) => tt.p < 0.05).length;
  const total = valid.length;
  /** @type {[string, string]} */
  const [cls, key] = pass === total ? ['good', 'nddConfirmed']
    : fail === 0 ? ['moderate', 'nddBorderline']
      : pass >= fail ? ['moderate', 'nddMixed']
        : ['poor', 'nddRejected'];

  const cards = tests.map((tt, i) => {
    const info = /** @type {Record<string, typeof OTHER_TEST>} */ (TEST_INFO)[tt.name] ?? OTHER_TEST;
    const base = {
      numText: `${i + 1}/${tests.length}`,
      name: tt.name,
      algoId: /** @type {Record<string, string>} */ (ALGO_LAB_IDS)[tt.name] ?? null,
      desc: t(info.desc),
    };
    if (tt.tooSmall) return { ...base, tooSmall: true, tooSmallText: t(info.tooSmall) };
    const v = tt.p >= 0.1 ? 'pass' : tt.p >= 0.05 ? 'warn' : 'fail';
    return {
      ...base,
      tooSmall: false,
      pillClass: `distfit__ndd-pill--${v}`,
      pillIcon: v === 'pass' ? 'status.ok' : v === 'warn' ? 'status.warning' : 'status.error',
      pillText: t(`nddVerdict${cap(v)}`),
      statRowLabel: `${t('nddStatistic')} (${info.statL})`,
      statVal: fmt(tt[info.key], lang),
      pRowLabel: t('colP'),
      pClass: `distfit__p-cell--${v === 'pass' ? 'good' : v === 'warn' ? 'moderate' : 'poor'}`,
      pS: pText(tt.p, lang),
    };
  });

  return {
    show: true,
    cards,
    dots: valid.map((tt) => ({ cls: `distfit__ndd-dot--${quality(tt.p)}` })),
    consensus: { cls: `distfit__ndd-consensus--${cls}`, title: t(key), text: t(`${key}Text`), scoreLabel: `${pass}/${total}` },
  };
}

/**
 * Konfiguration des Histogramms mit Normalkurve.
 * @param {number[]} values @param {Translate} t
 */
export function histogramConfig(values, t) {
  return {
    title: t('histogram'),
    data: values,
    showNormalCurve: true,
    barColor: 'var(--color-chart-1)',
    normalCurveColor: 'var(--color-chart-2)',
    showLegend: false,
  };
}
