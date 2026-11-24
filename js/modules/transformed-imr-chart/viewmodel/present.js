/**
 * D.Mike — Transformierte I-MR-Karte: Lauf und Anzeige (viewmodel/present.js).
 *
 * `analysisRun` ist der Lauf des auto-Tasks `analysis`: Stand lesen,
 * abbrechbar warten, rechnen (domain/analyze.js). Die übrigen Funktionen
 * machen aus dem Ergebnis KPI-Leiste, Abzeichen, Grenzentabelle und die
 * Konfiguration des Regelkarten-Widgets: übersetzte Texte, Zahlen in der
 * Sprache der Oberfläche mit drei Nachkommastellen („–“ für nicht endlich)
 * und Darstellungsklassen. Rechnet nichts.
 */
import { formatNumber } from '../../../core/number-format.js';
import { analyze, resultOf, pointsOf } from '../domain/analyze.js';

/** @typedef {import('../domain/analyze.js').Result} Result */
/** @typedef {import('../domain/analyze.js').Point} Point */
/** @typedef {import('../domain/analyze.js').AnalysisValue} AnalysisValue */
/** @typedef {(key: string, params?: Record<string, unknown>) => string} Translate */

/** Wartezeit vor dem Rechnen: eine schnelle Folge von Änderungen rechnet einmal. */
export const RERUN_DELAY = 120;

/**
 * Abbrechbare Pause.
 * @param {number} ms @param {AbortSignal} signal @returns {Promise<void>}
 */
export function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    function onAbort() { clearTimeout(timer); reject(signal.reason); }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Der Wert des Tasks aus dem Ergebnis von `analyze`.
 * @param {ReturnType<typeof analyze>} a
 * @param {Record<'errPositiveOnly'|'errCompute', string>} texts Fehlertexte in der aktiven Sprache
 * @returns {AnalysisValue}
 */
export function analysisValueOf(a, texts) {
  if (!a) return { result: null, points: [], error: null, message: null };
  const error = a.status === 'error' ? a.reason : null;
  return { result: resultOf(a), points: pointsOf(a), error, message: error ? texts[error] : null };
}

/**
 * Der Lauf des auto-Tasks `analysis`. `this` ist das Viewmodel; es liefert
 * Zahlen und λ über `this.inputs()` (dahinter `ctx.source`). Alles, was vor
 * dem ersten `await` gelesen wird, startet den Lauf bei einer Änderung neu.
 * @param {typeof analyze} [compute] die Rechnung
 * @returns {(this: any, args: object, ctl: { signal: AbortSignal }) => Promise<AnalysisValue>}
 */
export function analysisRun(compute = analyze) {
  return async function run(_args, { signal }) {
    const { values, lambda } = this.inputs();
    const texts = { errPositiveOnly: this.t('errPositiveOnly'), errCompute: this.t('errCompute') };
    await pause(RERUN_DELAY, signal);
    signal.throwIfAborted();
    return analysisValueOf(compute(values, lambda), texts);
  };
}

/**
 * Zahl mit drei Nachkommastellen, „–“ für leer oder nicht endlich.
 * @param {unknown} v @param {string} lang @returns {string}
 */
export function fmt(v, lang) {
  return typeof v === 'number' && Number.isFinite(v) ? formatNumber(v, lang, { decimals: 3 }) : '–';
}

/**
 * Die drei Kacheln der KPI-Leiste.
 * @param {Result} r @param {Translate} t @param {string} lang
 * @returns {{ lambdaText: string, lambdaLabel: string, clText: string, sigmaText: string, signals: number, signalsSub: string, signalsClass: string }}
 */
export function kpiOf(r, t, lang) {
  const signals = r.signals.length;
  return {
    lambdaText: fmt(r.lambda, lang),
    lambdaLabel: `${t('lambdaLabel')} ${t(r.lambdaAuto ? 'lambdaAutoTag' : 'lambdaManualTag')}`,
    clText: fmt(r.i.cl, lang),
    sigmaText: `σ̂ = ${fmt(r.i.sigma, lang)}`,
    signals,
    signalsSub: t('statOf', { total: r.n }),
    signalsClass: signals === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad',
  };
}

/**
 * Das Abzeichen in der Kopfzeile: stabil ohne Signal, sonst die Zahl der Signale.
 * @param {Result} r @param {Translate} t
 * @returns {{ text: string, cls: string, stable: boolean, unstable: boolean }}
 */
export function badgeOf(r, t) {
  const count = r.signals.length;
  const stable = count === 0;
  return {
    text: stable ? t('stable') : t('unstable', { count }),
    cls: stable ? 'timr__badge--stable' : 'timr__badge--unstable',
    stable,
    unstable: !stable,
  };
}

/**
 * Die drei Zeilen der Grenzentabelle (UCL, CL, LCL) auf beiden Skalen.
 * @param {Result} r @param {Translate} t @param {string} lang
 * @returns {{ label: string, transformed: string, original: string }[]}
 */
export function limitRowsOf(r, t, lang) {
  return [
    ['limitUcl', 'ucl'], ['limitCl', 'cl'], ['limitLcl', 'lcl'],
  ].map(([label, k]) => ({ label: t(label), transformed: fmt(r.i[k], lang), original: fmt(r.iOriginal[k], lang) }));
}

/**
 * Kopfzeile des Diagrammabschnitts: Spaltenname und λ in der Sprache der
 * Oberfläche, ohne feste Stellen.
 * @param {Result} r @param {string} col @param {Translate} t @param {string} lang
 * @returns {string}
 */
export function chartTitleOf(r, col, t, lang) {
  return t('chartTitle', { col, lambda: formatNumber(r.lambda, lang) });
}

/**
 * Konfiguration des Regelkarten-Widgets auf der transformierten Skala. Die
 * Grenzen gehen als einelementige Liste („ein Wert gilt für alle Punkte“),
 * die Signale sortiert und ohne Doppelte. Farben sind Vorgaben des Typs.
 * @param {Result} r @param {Point[]} points @param {Translate} t
 * @returns {object}
 */
export function chartConfig(r, points, t) {
  return {
    title: '',
    showTitle: false,
    showLegend: false,
    xLabel: t('xLabelSample'),
    yLabel: t('yLabel'),
    values: points.map((p) => p.transformed),
    cl: [r.i.cl],
    ucl: [r.i.ucl],
    lcl: [r.i.lcl],
    sigma: [r.i.sigma],
    violationIndices: [...new Set(r.signals)].sort((a, b) => a - b),
    usl: null,
    lsl: null,
    showZones: true,
  };
}
