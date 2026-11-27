/**
 * D.Mike — MSA Typ 6: Darstellung des Ergebnisses als reine Funktionen —
 * Zahlen im Format der App-Sprache, Urteil, Kennzahlen, Verletzungstabelle,
 * Deutungssatz, Fehler- und Warntexte, Beschriftung der Typ-1-Auswahl und die
 * Konfiguration der drei Diagramm-Widgets.
 */
import { formatNumber } from '../../../core/number-format.js';
import { driftAxis } from '../domain/analyze.js';

/** @typedef {(key: string, params?: object) => string} Translate */

/** Präfix des Deutungsschlüssels der Engine; der Übersetzer des Moduls hängt ihn selbst an. */
const OWN_PREFIX = 'modules.msa-typ6.';

/** Statusklasse je Urteil (die globalen Ampelklassen aus css/components.css). */
const LEVEL_CLASS = { stable: 'dmike-kpi--good', marginal: 'dmike-kpi--warn', unstable: 'dmike-kpi--bad' };

/**
 * Zahl mit fester Stellenzahl; Gedankenstrich für nicht endliche Werte.
 * @param {number|null|undefined} v @param {number} d Nachkommastellen @param {string} lang
 * @returns {string}
 */
export function fmt(v, d, lang) {
  return v != null && Number.isFinite(v) ? formatNumber(v, lang, { decimals: d }) : '—';
}

/**
 * Das Ergebnis, oder null bei fehlenden oder abgelehnten Eingaben.
 * @param {any} derived Wert der Ableitung `result`
 * @returns {any}
 */
export function resultOf(derived) {
  return derived && !derived.invalid && !derived.error ? derived : null;
}

/**
 * Der Fehlertext einer abgelehnten Rechnung, sonst leer.
 * @param {any} derived Wert der Ableitung `result`
 * @param {Translate} t
 * @returns {string}
 */
export function errorText(derived, t) {
  const inv = derived?.invalid;
  return inv ? t(`errors.${inv.code}`, inv.params ?? undefined) : '';
}

/**
 * Ampelklasse des Urteils.
 * @param {string} level @returns {string}
 */
export function levelClass(level) {
  return LEVEL_CLASS[/** @type {keyof typeof LEVEL_CLASS} */ (level)] ?? 'dmike-kpi--bad';
}

/**
 * Ampelklasse der Kachel „Regel-Verletzungen“: ab 3 rot, ab 1 gelb, sonst grün.
 * @param {number} count @returns {string}
 */
export function violationsClass(count) {
  if (count >= 3) return 'dmike-kpi--bad';
  return count > 0 ? 'dmike-kpi--warn' : 'dmike-kpi--good';
}

/**
 * Mittelwert der endlichen Werte; NaN ohne Werte.
 * @param {Array<number|null>} arr @returns {number}
 */
export function meanOf(arr) {
  if (!Array.isArray(arr)) return NaN;
  const valid = arr.filter((v) => typeof v === 'number' && Number.isFinite(v));
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : NaN;
}

/**
 * Der Deutungssatz; p-Wert und Steigung im Zahlformat der Sprache.
 * @param {any} result @param {Translate} t @param {string} lang
 * @returns {string}
 */
export function interpretationText(result, t, lang) {
  const key = String(result.interpretation.textKey).replace(OWN_PREFIX, '');
  return t(key, {
    nelsonCount: result.verdict.nelsonCount,
    driftP: fmt(result.verdict.driftP, 4, lang),
    slope: fmt(result.drift.slope, 4, lang),
  });
}

/**
 * Die Warnungen samt Text, die Werte eingesetzt.
 * @param {any} result @param {Translate} t
 * @returns {{ code: string, text: string }[]}
 */
export function warningItems(result, t) {
  return result.meta.warnings.map((/** @type {any} */ w) => ({ code: w.code, text: t(`warnings.${w.code}`, w.params ?? undefined) }));
}

/**
 * Zeilen der Verletzungstabelle.
 * @param {any} result @param {(key: string) => string} gt globaler Übersetzer
 * @param {string} lang
 * @returns {{ index: number, time: string, value: string, rules: string, description: string }[]}
 */
export function violationRows(result, gt, lang) {
  return result.ruleViolations.map((/** @type {any} */ v) => ({
    index: v.primaryIndex,
    time: v.time == null ? '' : String(v.time),
    value: fmt(v.value, 3, lang),
    rules: v.ruleIds.join(', '),
    description: v.ruleIds.map((/** @type {number} */ id) => gt(`common.nelson.${id}.short`)).join('; '),
  }));
}

/**
 * Beschriftung einer Typ-1-Instanz in der Auswahl: „Name (μ=…, σ=…)“.
 * @param {{ name: string, mean: number, stdDev: number }} o @param {string} lang
 * @returns {string}
 */
export function typ1Label(o, lang) {
  return `${o.name} (μ=${fmt(o.mean, 3, lang)}, σ=${fmt(o.stdDev, 3, lang)})`;
}

/**
 * Laufende Nummern als Beschriftung der Punkte.
 * @param {number} n @returns {string[]}
 */
function indexLabels(n) {
  return Array.from({ length: n }, (_, i) => String(i + 1));
}

/**
 * Die Lagekarte (Einzelwerte bzw. Mittelwerte) mit Zonen und Verletzungen.
 * @param {any} result
 * @returns {object|null}
 */
export function primaryChart(result) {
  if (!result) return null;
  const p = result.primary;
  return {
    values: [...p.series],
    cl: [p.cl], ucl: [p.ucl], lcl: [p.lcl], sigma: [p.sigma],
    violationIndices: [...new Set(result.ruleViolations.map((/** @type {any} */ v) => v.primaryIndex))].sort((a, b) => a - b),
    showZones: true,
    labels: indexLabels(p.series.length),
  };
}

/**
 * Die Streuungskarte (gleitende Spannweite bzw. Spannweite); die MR-Reihe
 * beginnt mit einer Lücke.
 * @param {any} result
 * @returns {object|null}
 */
export function secondaryChart(result) {
  if (!result) return null;
  const s = result.secondary;
  return {
    values: [...s.series],
    cl: [s.cl], ucl: [s.ucl], lcl: [s.lcl], sigma: [0],
    violationIndices: [],
    showZones: false,
    labels: indexLabels(s.series.length),
  };
}

/**
 * Die Driftgrafik: Punkte der Lagekarte über Zeit oder Nummer und die
 * Regressionsgerade als zweite Reihe aus zwei Endpunkten.
 * @param {any} result
 * @param {import('../domain/analyze.js').Inputs|null} inputs die gepaarten Spalten
 * @param {Translate} t
 * @returns {object|null}
 */
export function driftChart(result, inputs, t) {
  if (!result) return null;
  const { primary, drift } = result;
  const axis = driftAxis(inputs, primary.series.length);
  const keep = axis.map((x) => Number.isFinite(x));
  const x = axis.filter((_, i) => keep[i]);
  const y = primary.series.filter((/** @type {number} */ _, /** @type {number} */ i) => keep[i]);
  const tMin = Math.min(...x);
  const tMax = Math.max(...x);
  const ends = x.length ? [tMin, tMax] : [];
  return {
    showLegend: true,
    xLabel: t('drift.xLabel'),
    yLabel: t('drift.yLabel'),
    series: [
      { name: t('drift.seriesLabel'), color: 'var(--color-text-primary)', x, y, symbol: 'circle', strokeWidth: 1.5 },
      {
        name: t('drift.regressionLabel'),
        color: 'var(--color-accent)',
        x: ends,
        y: ends.map((v) => drift.intercept + drift.slope * v),
        markerSize: 0,
        connectLine: { show: true, width: 1.5, dash: 'solid', color: 'var(--color-accent)' },
      },
    ],
  };
}
