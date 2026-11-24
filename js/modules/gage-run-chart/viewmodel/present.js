/**
 * D.Mike — Messverlaufsdiagramm: die Anzeige aus der Rechnung (viewmodel/present.js).
 *
 * Baut aus dem Rohergebnis (domain/analyze.js) die KPI-Leiste, die Hinweise
 * und je Streifen die Konfiguration des Diagramm-Widgets `gage-run-chart`:
 * übersetzte Texte, Zahlen in der Sprache der Oberfläche mit vier
 * Nachkommastellen („–“ für nicht endlich). Rechnet nichts.
 */
import { formatNumber } from '../../../core/number-format.js';
import { resolveRefValue, stripRows } from '../domain/analyze.js';

/** @typedef {import('../domain/analyze.js').Analysis} Analysis */
/** @typedef {(key: string, params?: Record<string, unknown>) => string} Translate */

/**
 * Zahl mit vier Nachkommastellen, „–“ für leer oder nicht endlich.
 * @param {unknown} v @param {string} lang @returns {string}
 */
export function fmt(v, lang) {
  return typeof v === 'number' && Number.isFinite(v) ? formatNumber(v, lang, { decimals: 4 }) : '–';
}

/** @param {unknown} v @returns {number|null} */
const orNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Beschriftung der Bezugslinie: „Mittelwert“ ohne eigenen Wert, sonst „Referenzwert“.
 * @param {number|null} refValue @param {Translate} t @returns {string}
 */
export function refLabelOf(refValue, t) {
  return refValue === null ? t('refMean') : t('refCustom');
}

/**
 * Die drei Kacheln der KPI-Leiste: Messwerte mit Teilen, Prüfer mit Streifen,
 * Bezugswert mit Spanne (ohne eigenen Wert) bzw. Gesamtmittel (mit eigenem).
 * @param {Analysis} a
 * @param {{ refValue: number|null }} model
 * @param {number} rowCount Zahl der Streifen
 * @param {Translate} t @param {string} lang
 * @returns {{ n: number, partsText: string, operatorCount: number, rowsText: string, refText: string, refLabel: string, refSubText: string }}
 */
export function kpiOf(a, model, rowCount, t, lang) {
  const own = model.refValue !== null;
  return {
    n: a.n,
    partsText: t('statParts', { count: a.parts.length }),
    operatorCount: a.hasOperators ? a.operators.length : 0,
    rowsText: t('statRows', { count: rowCount }),
    refText: fmt(resolveRefValue(model.refValue, a.grandMean), lang),
    refLabel: refLabelOf(model.refValue, t),
    refSubText: own
      ? t('statGrandMean', { v: fmt(a.grandMean, lang) })
      : t('statSpan', { min: fmt(a.yMin, lang), max: fmt(a.yMax, lang) }),
  };
}

/**
 * Die Hinweise als Text, in der Reihenfolge der Rechnung.
 * @param {Analysis} a @param {Translate} t @returns {string[]}
 */
export function warningTextsOf(a, t) {
  return a.warnings.map((code) => (code === 'droppedRows'
    ? t('warnDroppedRows', { count: a.droppedRows })
    : t(`warn_${code}`)));
}

/**
 * Je Streifen die Konfiguration des Widgets `gage-run-chart`: gemeinsame
 * y-Domäne und Bezugslinie, Prüfer in fester Reihenfolge, x-Beschriftung nur
 * am letzten Streifen, Legende auf jedem Streifen mit Prüferspalte (sonst
 * fluchten die Felder nicht). Der Altschlüssel der Editor-Einstellungen folgt
 * der Reihenfolge des Anlegens: `gage-run-chart`, dann `gage-run-chart#2`, …
 * Farben sind Vorgaben des Typs.
 * @param {Analysis|null} a
 * @param {{ refValue: number|null, partsPerRow: number, showOperatorMean: boolean, connectWithin: boolean }} model
 * @param {{ part: string, measurement: string }} names Spaltennamen
 * @param {Translate} t
 * @returns {Array<{ key: string, legacyEditKey: string, config: object }>}
 */
export function runStripsOf(a, model, names, t) {
  const rows = stripRows(a, model.partsPerRow);
  if (!a || rows.length === 0) return [];
  const operators = a.operators.map(String);
  const refValue = orNull(resolveRefValue(model.refValue, a.grandMean));
  const refLabel = refLabelOf(model.refValue, t);
  return rows.map((panels, i) => {
    const isLast = i === rows.length - 1;
    return {
      key: `strip-${i}`,
      legacyEditKey: i === 0 ? 'gage-run-chart' : `gage-run-chart#${i + 1}`,
      config: {
        title: '',
        showTitle: false,
        xLabel: isLast ? names.part : '',
        showXLabel: isLast,
        yLabel: names.measurement,
        showLegend: a.hasOperators,
        panels: panels.map((p) => ({
          part: String(p.part),
          series: p.series.map((s) => ({ operator: String(s.operator), values: [...s.values], mean: orNull(s.mean) })),
        })),
        operators,
        refValue,
        refLabel,
        showOperatorMean: model.showOperatorMean,
        connectWithin: model.connectWithin,
        sharedYMin: orNull(a.yMin),
        sharedYMax: orNull(a.yMax),
      },
    };
  });
}
