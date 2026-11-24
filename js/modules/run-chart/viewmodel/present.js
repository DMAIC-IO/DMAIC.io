/**
 * D.Mike — Verlaufsdiagramm: die Anzeige aus der Rechnung (viewmodel/present.js).
 *
 * Baut aus dem Rohergebnis (domain/analyze.js) die KPI-Leiste, die Zeilen der
 * Testtafel und die Konfiguration des Diagramms: übersetzte Texte, Zahlen in
 * der Sprache der Oberfläche mit vier Nachkommastellen („–“ für nicht
 * endlich) und Darstellungsklassen. Die Bewertung gegen α kommt aus der
 * Domain. Rechnet nichts.
 */
import { formatNumber } from '../../../core/number-format.js';
import { flaggedCount, isFlagged } from '../domain/analyze.js';

/** @typedef {import('../domain/analyze.js').Analysis} Analysis */
/** @typedef {(key: string, params?: Record<string, unknown>) => string} Translate */

/**
 * Zahl mit vier Nachkommastellen, „–“ für leer oder nicht endlich.
 * @param {unknown} v @param {string} lang @returns {string}
 */
export function fmt(v, lang) {
  return typeof v === 'number' && Number.isFinite(v) ? formatNumber(v, lang, { decimals: 4 }) : '–';
}

/**
 * p-Wert: unter 0,0001 als „< 0,0001“, sonst mit vier Nachkommastellen.
 * @param {number} p @param {string} lang @returns {string}
 */
export function pText(p, lang) {
  return p < 0.0001 ? `< ${formatNumber(0.0001, lang, { decimals: 4 })}` : fmt(p, lang);
}

/**
 * Die drei Kacheln der KPI-Leiste.
 * @param {Analysis} a @param {number} alpha @param {Translate} t @param {string} lang
 * @returns {{ medianText: string, nText: string, runsAbout: number, runsUpDownText: string, flagged: number, flaggedClass: string, alphaText: string }}
 */
export function kpiOf(a, alpha, t, lang) {
  const flagged = flaggedCount(a, alpha);
  return {
    medianText: fmt(a.median, lang),
    nText: t('statN', { n: a.n }),
    runsAbout: a.runsAboutMedian,
    runsUpDownText: t('statRunsUpDown', { count: a.runsUpDown }),
    flagged,
    flaggedClass: flagged === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad',
    alphaText: t('statAlpha', { a: formatNumber(alpha, lang) }),
  };
}

/**
 * Je Lauftest eine Zeile der Testtafel.
 * @param {Analysis} a @param {number} alpha @param {Translate} t @param {string} lang
 * @returns {{ id: string, name: string, desc: string, pText: string, statusClass: string, statusText: string, flagged: boolean }[]}
 */
export function testRowsOf(a, alpha, t, lang) {
  return a.tests.map((test) => {
    const flagged = isFlagged(test.p, alpha);
    return {
      id: test.id,
      name: t(`test_${test.id}`),
      desc: t(`testDesc_${test.id}`),
      pText: pText(test.p, lang),
      statusClass: flagged ? 'run-chart__test-status--bad' : 'run-chart__test-status--ok',
      statusText: t(flagged ? 'flagFail' : 'flagPass'),
      flagged,
    };
  });
}

/**
 * Konfiguration des Diagramm-Widgets `run-chart`. Farben und die Färbung nach
 * Seite des Medians sind Vorgaben des Typs.
 * @param {Analysis} a @param {string} yLabel Spaltenname @param {Translate} t
 * @returns {{ title: string, showTitle: boolean, showLegend: boolean, xLabel: string, yLabel: string, values: number[], median: number }}
 */
export function chartConfig(a, yLabel, t) {
  return {
    title: '',
    showTitle: false,
    showLegend: false,
    xLabel: t('xLabelSample'),
    yLabel,
    values: a.values,
    median: a.median,
  };
}
