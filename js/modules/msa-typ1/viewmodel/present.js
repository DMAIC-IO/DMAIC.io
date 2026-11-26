/**
 * D.Mike — MSA Typ 1: Darstellung des Ergebnisses als reine Funktionen —
 * Zahlen im Format der App-Sprache, Statuszeile, Statistiktabelle,
 * Formelzeilen und die Konfiguration der beiden Diagramm-Widgets.
 */
import { formatNumber } from '../../../core/number-format.js';

/** Präfix der Kontexthilfe je Kennzahl der Statistiktabelle (`types.<Typedef>.<property>`). */
const HELP = 'modules.msa-typ1.types.';

/** Statusklasse je Urteil. */
const KPI_CLASS = { pass: 'dmike-kpi--good', warn: 'dmike-kpi--warn', fail: 'dmike-kpi--bad' };

/**
 * Füllfarbe der k₁·T-Zone im Verlaufsdiagramm: Erfolgsfarbe mit 6 % Deckung.
 * Der Diagrammtyp löst Farben am Dokument auf, nicht am Modulcontainer; darum
 * eine Mischung aus der globalen Variable statt einer Modulvariable.
 */
export const ZONE_FILL = 'color-mix(in srgb, var(--color-success) 6%, transparent)';

/** Schwellen der Urteile (Cg, Cgk). */
export const THRESHOLD_PASS = 1.33;
export const THRESHOLD_WARN = 1;

/**
 * Zahl mit fester Stellenzahl.
 * @param {number} v @param {number} d Nachkommastellen @param {string} lang
 * @returns {string}
 */
export function fmt(v, d, lang) {
  return formatNumber(v, lang, { decimals: d });
}

/**
 * Zahl mit fester Stellenzahl; Strich für fehlende oder nicht endliche Werte.
 * @param {number|null|undefined} v @param {number} d @param {string} lang
 * @returns {string}
 */
export function fmtOpt(v, d, lang) {
  return v != null && Number.isFinite(v) ? formatNumber(v, lang, { decimals: d }) : '–';
}

/**
 * p-Wert wie die Altform: „< 0,001“ oder „= 0,478“; Strich ohne Wert.
 * @param {number|null|undefined} p @param {string} lang
 * @returns {string}
 */
export function fmtP(p, lang) {
  if (p == null || !Number.isFinite(p)) return '–';
  return p < 0.001 ? `< ${formatNumber(0.001, lang, { decimals: 3 })}` : `= ${formatNumber(p, lang, { decimals: 3 })}`;
}

/**
 * Das Ergebnis, oder null bei fehlenden oder abgelehnten Eingaben.
 * @param {any} analysis
 * @returns {any}
 */
export function resultOf(analysis) {
  return analysis && !analysis.invalid && !analysis.error ? analysis : null;
}

/**
 * Statusklasse eines Urteils.
 * @param {string|null|undefined} s
 * @returns {string}
 */
export function kpiClass(s) {
  return KPI_CLASS[s] ?? '';
}

/**
 * Urteil der Statuszeile als Text.
 * @param {any} r @param {(k: string, p?: object) => string} t
 * @returns {string}
 */
export function statusLabel(r, t) {
  if (r?.noSpread) return t('statusNoSpread');
  return t({ pass: 'statusPass', fail: 'statusFail', warn: 'statusWarn', none: 'statusOneSided' }[r?.overall] || 'statusWarn');
}

/**
 * Urteil einer Kennzahl als Text; Strich ohne Urteil.
 * @param {string|null} s @param {(k: string) => string} t
 * @returns {string}
 */
export function badgeLabel(s, t) {
  return s == null ? '–' : t({ pass: 'capable', fail: 'notCapable', warn: 'condCapable' }[s] || 'condCapable');
}

/**
 * Zeile des t-Tests auf Bias; Strich ohne Prüfgröße.
 * @param {any} r @param {(k: string, p?: object) => string} t @param {string} lang
 * @returns {string}
 */
export function biasTestText(r, t, lang) {
  const bt = r?.biasTest;
  if (!bt || bt.t == null) return '–';
  const sig = bt.p < 0.05 ? t('biasSignificant') : t('biasNotSignificant');
  const line = t('biasTestLine', { t: fmt(bt.t, 2, lang), df: bt.df, p: fmtP(bt.p, lang) });
  return `${line} · ${sig}`;
}

/**
 * Spalten der waagerechten Statistiktabelle: Beschriftung, Hilfeschlüssel, Wert.
 * @param {any} r @param {string} unit @param {(k: string) => string} t @param {string} lang
 * @returns {{ label: string, help: string|null, value: string }[]}
 */
export function statCols(r, unit, t, lang) {
  if (!r) return [];
  const u = unit || '';
  const v = (/** @type {number} */ x) => `${fmt(x, 4, lang)} ${u}`;
  const res = r.resolution > 0
    ? (r.resPercent == null ? v(r.resolution) : `${v(r.resolution)} (${fmt(r.resPercent, 4, lang)} % T)`)
    : '–';
  return [
    { label: t('statN'), help: `${HELP}Result.n`, value: String(r.n) },
    { label: t('statMean'), help: `${HELP}Result.xbar`, value: v(r.xbar) },
    { label: t('statStddev'), help: `${HELP}Result.sg`, value: v(r.sg) },
    { label: t('statMin'), help: `${HELP}Result.xmin`, value: v(r.xmin) },
    { label: t('statMax'), help: `${HELP}Result.xmax`, value: v(r.xmax) },
    { label: t('statRange'), help: `${HELP}Result.range`, value: v(r.range) },
    { label: t('statRef'), help: `${HELP}ResultParams.ref`, value: v(r.params.ref) },
    { label: t('statTol'), help: `${HELP}Result.T`, value: `${fmtOpt(r.T, 4, lang)} ${u}` },
    { label: t('statResolution'), help: `${HELP}Result.resolution`, value: res },
    { label: 'k₁ / k₂', help: null, value: `${formatNumber(r.params.k1, lang)} / ${formatNumber(r.params.k2, lang)}` },
  ];
}

/**
 * Konfiguration des Verlaufsdiagramms: Messwerte mit Verbindungslinie,
 * Ausreißer, Bezugslinien Ref/x̄/OSG/USG und die k₁·T-Zone; null ohne Ergebnis.
 * @param {any} r @param {(k: string) => string} t
 * @returns {object|null}
 */
export function runChart(r, t) {
  if (!r) return null;
  const values = r.details.map((/** @type {any} */ d) => d.value);
  const outliers = r.details.filter((/** @type {any} */ d) => d.isOutlier);
  const refLines = [
    { dir: 'h', value: r.params.ref, label: t('chartRefLabel'), dash: 'dash', width: 1.5, color: 'var(--color-success)' },
    { dir: 'h', value: r.xbar, label: t('common.sym.xbar'), dash: 'dot', width: 1, color: 'var(--color-info)' },
  ];
  if (Number.isFinite(r.params.usl)) refLines.push({ dir: 'h', value: r.params.usl, label: t('common.sym.usl'), dash: 'dash', width: 1, color: 'var(--color-error)' });
  if (Number.isFinite(r.params.lsl)) refLines.push({ dir: 'h', value: r.params.lsl, label: t('common.sym.lsl'), dash: 'dash', width: 1, color: 'var(--color-error)' });
  const refAreas = r.zoneLo != null
    ? [{ dir: 'y', min: r.zoneLo, max: r.zoneHi, label: t('chartZoneLabel'), color: ZONE_FILL }]
    : [];
  return {
    xLabel: t('chartIndex'),
    showLegend: true,
    series: [
      {
        name: t('chartValues'), color: 'var(--color-accent)', markerSize: 5,
        x: values.map((/** @type {number} */ _, /** @type {number} */ i) => i + 1), y: values,
        connectLine: { show: true, color: 'var(--color-text-secondary)', width: 1.5, dash: 'solid' },
      },
      ...(outliers.length > 0 ? [{
        name: t('chartOutliers'), color: 'var(--color-error)', markerSize: 5,
        stroke: 'var(--color-error)', strokeWidth: 2, symbol: 'circle',
        x: outliers.map((/** @type {any} */ d) => d.index), y: outliers.map((/** @type {any} */ d) => d.value),
      }] : []),
    ],
    moduleRefLines: refLines,
    moduleRefAreas: refAreas,
  };
}

/**
 * Konfiguration des Histogramms mit Normalverteilung und den Linien
 * USG/OSG/Sollwert; null ohne Ergebnis.
 * @param {any} r @param {(k: string) => string} t
 * @returns {object|null}
 */
export function histChart(r, t) {
  if (!r) return null;
  const line = (/** @type {number} */ value, /** @type {string} */ label, /** @type {string} */ color) =>
    ({ dir: 'v', value, label, color, dash: 'dash', width: 1.5, showLabel: true });
  const refLines = [];
  if (Number.isFinite(r.params.lsl)) refLines.push(line(r.params.lsl, t('common.sym.lsl'), 'var(--color-error)'));
  if (Number.isFinite(r.params.usl)) refLines.push(line(r.params.usl, t('common.sym.usl'), 'var(--color-error)'));
  if (Number.isFinite(r.params.ref)) refLines.push(line(r.params.ref, t('common.sym.target'), 'var(--color-success)'));
  return {
    data: r.details.map((/** @type {any} */ d) => d.value),
    showNormalCurve: true,
    barColor: 'var(--color-accent)',
    normalCurveColor: 'var(--color-info)',
    showLegend: true,
    moduleRefLines: refLines,
  };
}
