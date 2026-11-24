/**
 * D.Mike — Regelkarte für Variablen (I-MR, X̄-R, X̄-S): die Rechnung als
 * Zahlen (domain/analyze.js).
 *
 * Die Werte der gewählten Spalte gehen roh an die unveränderte Engine
 * (`engines/control-chart-engine.js`); diese Datei wählt nur die wirksamen
 * Eingaben (Stufen, Phase I, Ausschlüsse, eingefrorene Grenzen) und prüft
 * das Ergebnis auf Zeichenbares. Rein: keine Übersetzung, keine
 * Formatierung; Fehler sind Gründe (i18n-Schlüssel), keine Texte. Die
 * Altform rechnete jede Eingabe synchron, darum `derived`; `analyze` merkt
 * sich die letzte Eingabe, damit alle Ableitungen und die Ansicht zusammen
 * die Engine einmal je wirksamer Änderung rufen.
 */
import {
  getChartType, evaluateNelsonRules, secondaryChartRules, computeCapability, capabilitySigma,
  DEFAULT_ENABLED_RULES,
} from '../../../engines/control-chart-engine.js';
import { finiteOrNull, zipPoints } from '../../../core/agent/agent-results.js';

/** Unter zwei Werten rechnet das Modul nicht. */
export const MIN_VALUES = 2;

/**
 * Das gerechnete Ergebnis, wie `read().result` es liefert. Die Teilkarten
 * heißen je Kartentyp i/mr, xbar/r oder xbar/s.
 *
 * @typedef {object} Result
 * @property {'i-mr'|'xbar-r'|'xbar-s'} chartType  Kartentyp
 * @property {number} subgroupSize  Werte je Untergruppe
 * @property {number} n  Punkte der ersten Teilkarte
 * @property {number} baselineEnd  Einzelwerte der Basis
 * @property {number[]} stages  Stufengrenzen
 * @property {boolean} frozen  eingefrorene Grenzen gelten
 * @property {Object<string, SubchartLimits>} subcharts  Grenzen je Teilkarte
 * @property {Capability|null} capability  Prozessfähigkeit
 * @property {Violation[]} violations  Regelverletzungen der ersten Teilkarte
 * @property {number[]} signals  verletzende Punkte ohne Doppelte
 */

/**
 * @typedef {object} SubchartLimits
 * @property {number|null} cl  Mittellinie
 * @property {number|null} ucl  obere Eingriffsgrenze
 * @property {number|null} lcl  untere Eingriffsgrenze
 * @property {number|null} sigma  Streuung der Punkte
 */

/**
 * @typedef {object} Capability
 * @property {number|null} [cp]  Cp, nur mit beiden Grenzen
 * @property {number|null} [cpu]  Cpu, nur mit oberer Grenze
 * @property {number|null} [cpl]  Cpl, nur mit unterer Grenze
 * @property {number|null} cpk  Cpk
 */

/**
 * @typedef {object} Violation
 * @property {number} index  Punkt, ab 0
 * @property {number} ruleId  Nelson-Regel
 */

/**
 * @typedef {object} Annotation
 * @property {string} comment  Kommentar zum Punkt
 * @property {boolean} excluded  Punkt aus den Grenzen ausgeschlossen
 */

/**
 * Die für Phase II eingefrorenen Grenzen, Werte aus der Rechnung beim
 * Einfrieren.
 *
 * @typedef {object} FrozenLimits
 * @property {'i-mr'|'xbar-r'|'xbar-s'} chartTypeId  Kartentyp beim Einfrieren
 * @property {number} subgroupSize  Untergruppengröße beim Einfrieren
 * @property {object|null} columnRef  Spalte beim Einfrieren
 * @property {number|null} baselineEnd  Einzelwerte der Basis
 * @property {SubchartLimits} primary  Grenzen der ersten Teilkarte
 * @property {SubchartLimits} secondary  Grenzen der zweiten Teilkarte
 * @property {number[]} excludedIndices  ausgeschlossene Punkte
 */

/**
 * Grund, warum nicht gerechnet wurde (i18n-Schlüssel des Moduls).
 * @typedef {'errCompute'} Reason
 */

/**
 * Grenzen einer Teilkarte für die Rechnung: Zahl oder eine je Punkt.
 * @typedef {number|null|Array<number|null>} LimitValue
 */

/**
 * Eine Teilkarte, wie gezeichnet: Punkte und Grenzen; Grenzlisten haben
 * genau einen Eintrag je Punkt.
 * @typedef {object} Subchart
 * @property {Array<number|null>} values  Punkte; die MR-Reihe hat `null` an Index 0 und an Stufenbeginnen
 * @property {LimitValue} cl  Mittellinie
 * @property {LimitValue} ucl  obere Eingriffsgrenze
 * @property {LimitValue} lcl  untere Eingriffsgrenze
 * @property {LimitValue} sigma  Streuung der Punkte
 */

/**
 * Eine Stufe in Punkten der Teilkarten (Ende ausschließlich).
 * @typedef {{ start: number, end: number }} Segment
 */

/**
 * Das Rohergebnis, auf die gezeichneten Punkte gekürzt.
 * @typedef {object} Fit
 * @property {Object<string, Subchart>} subcharts  je Teilkarten-Id
 * @property {Segment[]|undefined} segments  Stufen, nur mit Stufen
 */

/**
 * Grenzen einer Teilkarte beim Einfrieren (`null` für eine nicht endliche).
 * @typedef {{ cl: number|null, ucl: number|null, lcl: number|null, sigma: number|null }} Limits
 */

/**
 * Was an die Engine geht: die wirksamen Eingaben.
 * @typedef {object} Inputs
 * @property {number[]} values  Werte der Spalte (nur echte Zahlen)
 * @property {'i-mr'|'xbar-r'|'xbar-s'} chartTypeId  Kartentyp
 * @property {number} n  Untergruppengröße
 * @property {number|null} baselineCount  Werte der Phase I, `null` für alle
 * @property {number[]} stages  wirksame Stufengrenzen, innerhalb `(0, N)`
 * @property {number[]} enabledRules  angehakte Nelson-Regeln
 * @property {number[]} excluded  ausgeschlossene Indizes, sortiert
 * @property {{ primary: Limits, secondary: Limits }|null} frozen  eingefrorene Grenzen, nur wenn sie gelten
 * @property {number|null} usl  obere Spezifikationsgrenze
 * @property {number|null} lsl  untere Spezifikationsgrenze
 */

/**
 * Was `analyze` liefert: Ergebnis oder Fehlergrund. `ct` ist die
 * Kartendefinition der Engine (Teilkarten-Ids und Achsentexte).
 * @typedef {{ status: 'ok', ct: any, fit: Fit, primaryViolations: Violation[],
 *   secondaryViolations: Violation[], capability: object|null, baselineEnd: number,
 *   n: number, stages: number[], frozen: boolean, misaligned: number[] }
 *   | { status: 'error', reason: Reason }} Analysis
 */

/**
 * Die Rechnung der Altkachel: nur die erste Teilkarte.
 * @typedef {{ status: 'ok', chartTypeId: string, primary: Subchart, violations: Violation[],
 *   violationIndices: number[], capability: object|null, outOfSpec: number|null,
 *   totalPoints: number, baselineEnd: number|null }
 *   | { status: 'error', reason: Reason }} TileAnalysis
 */

/**
 * Die Rechenfunktion: Kartentyp, Werte, Untergruppe, Ende der Basis, Stufen,
 * Ausschlüsse → Rohergebnis der Engine.
 * @typedef {(chartTypeId: string, values: number[], n: number, baselineEnd: number,
 *   stages: number[]|undefined, excluded: number[]) => any} Engine
 */

/**
 * Die Stufen aus dem Stufentext: Zahlen getrennt durch Komma, Semikolon oder
 * Leerraum, ganzzahlig gelesen, nur positive, entdoppelt und sortiert; `[]`
 * für leeren oder unlesbaren Text.
 * @param {unknown} text
 * @returns {number[]}
 */
export function parseStages(text) {
  if (!text || typeof text !== 'string') return [];
  /** @type {number[]} */
  const out = [];
  for (const part of text.split(/[,;\s]+/)) {
    if (!part) continue;
    const v = parseInt(part, 10);
    if (Number.isFinite(v) && v > 0) out.push(v);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/**
 * Die wirksamen Stufen: nur Grenzen innerhalb der Werte (`0 < b < N`).
 * Rechnung und Einfrieren fragen beide hier, ob Stufen gelten.
 * @param {unknown} stagesText
 * @param {number} N Zahl der Werte
 * @returns {number[]}
 */
export function activeStages(stagesText, N) {
  return parseStages(stagesText).filter((b) => b > 0 && b < N);
}

/**
 * Stufengrenzen, die in eine Untergruppe fallen (kein Vielfaches von n); die
 * Engine zählt eine solche Untergruppe zur früheren Stufe.
 * @param {number[]} stages letzte Punkte je Stufe (ab 1)
 * @param {number} n Untergruppengröße
 * @returns {number[]}
 */
export function misalignedStages(stages, n) {
  if (!(n > 1)) return [];
  return stages.filter((b) => b % n !== 0);
}

/**
 * Die Indizes der Anmerkungen mit Ausschluss, sortiert. Ein Kommentar ohne
 * Ausschluss zählt nicht.
 * @param {Object<string, Annotation|null|undefined>|null|undefined} annotations
 * @returns {number[]}
 */
export function excludedOf(annotations) {
  if (!annotations || typeof annotations !== 'object') return [];
  return Object.keys(annotations)
    .filter((k) => annotations[k]?.excluded)
    .map(Number)
    .sort((a, b) => a - b);
}

/**
 * Ob zwei Bezüge dieselbe Spalte meinen.
 * @param {any} a @param {any} b
 * @returns {boolean}
 */
export function sameColumn(a, b) {
  if (!a || !b) return false;
  return a.instanceId === b.instanceId && a.sheetId === b.sheetId && a.columnId === b.columnId;
}

/**
 * Ob die eingefrorenen Grenzen gelten: gleicher Kartentyp, gleiche
 * Untergruppe, gleiche Spalte und keine Stufen. Grenzen ohne Spalte gelten
 * weiter.
 * @param {FrozenLimits|null|undefined} frozen
 * @param {{ chartTypeId: string, subgroupSize: number, columnRef: any }} model
 * @param {boolean} usingStages
 * @returns {boolean}
 */
export function frozenApplies(frozen, model, usingStages) {
  if (!frozen || usingStages) return false;
  if (frozen.chartTypeId !== model.chartTypeId || frozen.subgroupSize !== model.subgroupSize) return false;
  return !frozen.columnRef || sameColumn(frozen.columnRef, model.columnRef);
}

/** @param {any} l @returns {Limits} */
const limitsOf = (l) => ({ cl: l?.cl ?? null, ucl: l?.ucl ?? null, lcl: l?.lcl ?? null, sigma: l?.sigma ?? null });

/**
 * Was an die Engine geht. Ohne Bezug, bei nicht lesbarer Spalte (gelöscht),
 * bei unbekanntem Kartentyp oder unter zwei Werten `null` (leere Ausgabe
 * ohne Meldung). Es zählen nur echte Zahlen (kein `NaN`, kein Text wie
 * „2,5“, kein `null`); die Stufen sind die wirksamen.
 * @param {any} model Stand des Models
 * @param {{ values: (ref: object) => any[]|null }} read Spaltenleser (`sourceColumns`)
 * @returns {Inputs|null}
 */
export function inputsOf(model, read) {
  if (!model?.columnRef || !getChartType(model.chartTypeId)) return null;
  const raw = read.values(model.columnRef);
  if (!Array.isArray(raw)) return null;
  const values = raw.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (values.length < MIN_VALUES) return null;
  const stages = activeStages(model.stagesText, values.length);
  const frozen = frozenApplies(model.frozenLimits, model, stages.length > 0)
    ? { primary: limitsOf(model.frozenLimits.primary), secondary: limitsOf(model.frozenLimits.secondary) }
    : null;
  return {
    values,
    chartTypeId: model.chartTypeId,
    n: model.subgroupSize,
    baselineCount: model.baselineCount ?? null,
    stages,
    enabledRules: Array.isArray(model.enabledRules) ? [...model.enabledRules] : [...DEFAULT_ENABLED_RULES],
    excluded: excludedOf(model.annotations),
    frozen,
    usl: model.usl ?? null,
    lsl: model.lsl ?? null,
  };
}

/** @param {readonly unknown[]} a @param {readonly unknown[]} b @returns {boolean} */
function sameList(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

const LIMIT_KEYS = /** @type {const} */ (['cl', 'ucl', 'lcl', 'sigma']);

/** @param {Limits} a @param {Limits} b @returns {boolean} */
const sameLimits = (a, b) => LIMIT_KEYS.every((k) => Object.is(a[k], b[k]));

/** @param {Inputs['frozen']} a @param {Inputs['frozen']} b @returns {boolean} */
function sameFrozen(a, b) {
  if (a === null || b === null) return a === b;
  return sameLimits(a.primary, b.primary) && sameLimits(a.secondary, b.secondary);
}

/** @param {Inputs|null} a @param {Inputs|null} b @returns {boolean} */
function sameInputs(a, b) {
  if (a === null || b === null) return a === b;
  return a.chartTypeId === b.chartTypeId
    && Object.is(a.n, b.n) && Object.is(a.baselineCount, b.baselineCount)
    && Object.is(a.usl, b.usl) && Object.is(a.lsl, b.lsl)
    && sameList(a.values, b.values) && sameList(a.stages, b.stages)
    && sameList(a.enabledRules, b.enabledRules) && sameList(a.excluded, b.excluded)
    && sameFrozen(a.frozen, b.frozen);
}

/** @param {Inputs} i @returns {Inputs} */
function copyInputs(i) {
  return {
    ...i,
    values: [...i.values],
    stages: [...i.stages],
    enabledRules: [...i.enabledRules],
    excluded: [...i.excluded],
    frozen: i.frozen && { primary: { ...i.frozen.primary }, secondary: { ...i.frozen.secondary } },
  };
}

/**
 * Die letzte Eingabe und ihr Ergebnis.
 * @type {{ inputs: Inputs|null, analysis: Analysis|null }|null}
 */
let last = null;

/** Wie oft die Engine für das Modul gerechnet hat (Zählung für Tests). */
let runs = 0;

/**
 * Wie oft `analyzeWith` die Engine bisher gerufen hat. Nur zum Zählen in
 * Tests; der Wert steigt nur, wenn wirklich gerechnet wird. Die Rechnung der
 * Kachel zählt nicht.
 * @returns {number}
 */
export function engineRuns() { return runs; }

/**
 * Die Engine: die Rechenfunktion des Kartentyps.
 * @type {Engine}
 */
export const computeChart = (chartTypeId, values, n, baselineEnd, stages, excluded) =>
  /** @type {any} */ (getChartType(chartTypeId)).compute(values, n, baselineEnd, stages, excluded);

/**
 * Rechnet die Regelkarte. `inputs` `null` → `null`: keine Ausgabe, kein
 * Fehler. Bei gleicher Eingabe wie beim letzten Aufruf (Werte und Listen
 * flach, übrige Eingaben einzeln verglichen) kommt dasselbe Objekt zurück,
 * auch für Fehler und `null`; es wird nicht verändert.
 * @param {Inputs|null} inputs
 * @returns {Analysis|null}
 */
export function analyze(inputs) {
  if (last && sameInputs(last.inputs, inputs)) return last.analysis;
  const analysis = analyzeWith(computeChart, inputs);
  last = { inputs: inputs && copyInputs(inputs), analysis };
  return analysis;
}

/**
 * Das Ende der Phase I in Einzelwerten. Mit Stufen gilt es nicht (alle
 * Werte). Sonst höchstens so viele Werte, wie Punkte daraus entstehen: bei
 * I-MR alle N, bei X̄ die Werte der vollen Untergruppen (der Rest am Ende
 * bildet keinen Punkt). Phase I darüber oder leer heißt „alle“.
 * @param {number|null} baselineCount
 * @param {number} N Zahl der Werte
 * @param {string} chartTypeId
 * @param {number} n Untergruppengröße
 * @param {boolean} usingStages
 * @returns {number}
 */
export function baselineEndOf(baselineCount, N, chartTypeId, n, usingStages) {
  if (usingStages) return N;
  const cap = chartTypeId === 'i-mr' ? N : Math.floor(N / n) * n;
  return baselineCount ? Math.min(baselineCount, cap) : cap;
}

/** @param {unknown} v @returns {boolean} */
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** @param {LimitValue} v @returns {boolean} */
const finiteLimit = (v) => (Array.isArray(v) ? v.every(finite) : finite(v));

/**
 * Eine Grenzliste auf die Zahl der Punkte gekürzt (die Engine legt bei
 * Stufen mit einem Rest am Ende einen Eintrag hinter den letzten Punkt).
 * @param {any} v @param {number} len
 * @returns {LimitValue}
 */
const trim = (v, len) => (Array.isArray(v) ? v.slice(0, len) : v);

/**
 * Das Rohergebnis auf die gezeichneten Punkte gekürzt: Grenzlisten mit genau
 * einem Eintrag je Punkt, Stufen innerhalb der Punkte, leere Stufen
 * entfallen.
 * @param {any} raw
 * @param {string[]} ids Teilkarten-Ids
 * @param {Inputs['frozen']} frozen eingefrorene Grenzen statt der gerechneten
 * @returns {Fit}
 */
function fitOf(raw, ids, frozen) {
  /** @type {Object<string, Subchart>} */
  const subcharts = {};
  ids.forEach((id, k) => {
    const sc = raw.subcharts[id];
    const values = [...sc.values];
    const lim = frozen ? (k === 0 ? frozen.primary : frozen.secondary) : sc;
    subcharts[id] = {
      values,
      cl: trim(lim.cl, values.length),
      ucl: trim(lim.ucl, values.length),
      lcl: trim(lim.lcl, values.length),
      sigma: trim(lim.sigma, values.length),
    };
  });
  const K = subcharts[ids[0]].values.length;
  const segments = !frozen && Array.isArray(raw.segments)
    ? raw.segments
      .map((/** @type {Segment} */ s) => ({ start: s.start, end: Math.min(s.end, K) }))
      .filter((/** @type {Segment} */ s) => s.end > s.start)
    : undefined;
  return { subcharts, segments };
}

/**
 * Ob alle gezeichneten Zahlen endlich sind: jeder Punkt beider Teilkarten
 * (außer `null` der MR-Reihe an Index 0 und an Stufenbeginnen), jede Grenze
 * und jedes σ, auch eingefrorene; die erste Teilkarte hat mindestens einen
 * Punkt.
 * @param {Fit} fit @param {string} chartTypeId @param {string[]} ids
 * @returns {boolean}
 */
function plottable(fit, chartTypeId, ids) {
  if (fit.subcharts[ids[0]].values.length === 0) return false;
  const gaps = new Set([0, ...(fit.segments || []).map((s) => s.start)]);
  return ids.every((id, k) => {
    const sc = fit.subcharts[id];
    const mayGap = chartTypeId === 'i-mr' && k === 1;
    return sc.values.every((v, i) => (mayGap && gaps.has(i) ? v === null : finite(v)))
      && LIMIT_KEYS.every((key) => finiteLimit(sc[key]));
  });
}

/** @param {LimitValue} v @returns {number|null} */
const lastOf = (v) => (Array.isArray(v) ? v[v.length - 1] : v);

/**
 * Die Rechnung selbst, ohne Merker, mit wählbarer Engine (Tests stubben sie,
 * um Würfe und nicht endliche Werte zu prüfen). Wie die Altform: mit
 * geltenden eingefrorenen Grenzen rechnet die Engine nur die Punkte, die
 * Grenzen kommen aus Phase II; sonst rechnet sie mit Phase I, Stufen und
 * Ausschlüssen. Nelson-Regeln je Stufe an der ersten Teilkarte, an der
 * zweiten nur die dort erlaubten; die Fähigkeit aus der letzten Stufe. Ein
 * Wurf der Engine und ein nicht endlicher gezeichneter Wert werden zum Grund
 * `errCompute` (Ursache per `console.warn`); eine nicht endliche Fähigkeit
 * ist kein Fehler.
 * @param {Engine} engine
 * @param {Inputs|null} inputs
 * @returns {Analysis|null}
 */
export function analyzeWith(engine, inputs) {
  if (inputs === null) return null;
  const { values, chartTypeId, n, stages, enabledRules, excluded, frozen, usl, lsl } = inputs;
  const ct = getChartType(chartTypeId);
  const ids = ct.subcharts.map((/** @type {{ id: string }} */ s) => s.id);
  const usingStages = stages.length > 0;
  const baselineEnd = baselineEndOf(inputs.baselineCount, values.length, chartTypeId, n, usingStages);
  runs += 1;
  /** @type {Fit} */
  let fit;
  /** @type {Violation[]} */
  let primaryViolations;
  /** @type {Violation[]} */
  let secondaryViolations;
  try {
    const raw = engine(chartTypeId, values, n, baselineEnd, usingStages ? stages : undefined, excluded);
    fit = fitOf(raw, ids, frozen);
    if (!plottable(fit, chartTypeId, ids)) {
      console.warn('control-chart: nicht endliche Werte', ids.map((id) => {
        const sc = fit.subcharts[id];
        return { id, cl: lastOf(sc.cl), ucl: lastOf(sc.ucl), lcl: lastOf(sc.lcl), sigma: lastOf(sc.sigma) };
      }));
      return { status: 'error', reason: 'errCompute' };
    }
    const p = fit.subcharts[ids[0]];
    const s = fit.subcharts[ids[1]];
    primaryViolations = evaluateNelsonRules(p.values, p.cl, p.sigma, enabledRules, fit.segments);
    secondaryViolations = evaluateNelsonRules(s.values, s.cl, s.sigma, secondaryChartRules(enabledRules), fit.segments);
  } catch (e) {
    console.warn('control-chart: Rechnung fehlgeschlagen', e);
    return { status: 'error', reason: 'errCompute' };
  }
  const p = fit.subcharts[ids[0]];
  const lastSeg = fit.segments ? fit.segments[fit.segments.length - 1] : null;
  const capValues = lastSeg ? p.values.slice(lastSeg.start, lastSeg.end) : p.values;
  const capability = computeCapability(
    /** @type {number[]} */ (capValues.filter((v) => v !== null)),
    /** @type {number} */ (lastOf(p.cl)),
    /** @type {number} */ (capabilitySigma(chartTypeId, /** @type {number} */ (lastOf(p.sigma)), n)),
    usl, lsl,
  );
  return {
    status: 'ok',
    ct,
    fit,
    primaryViolations,
    secondaryViolations,
    capability,
    baselineEnd,
    n,
    stages: [...stages],
    frozen: Boolean(frozen),
    misaligned: chartTypeId === 'i-mr' ? [] : misalignedStages(stages, n),
  };
}

/**
 * Je Paar aus Punkt und Regel ein Eintrag, nach Punkt sortiert (gleiche
 * Punkte in Reihenfolge der Prüfung).
 * @param {Violation[]} violations
 * @returns {Violation[]}
 */
export function uniqueViolations(violations) {
  /** @type {Violation[]} */
  const unique = [];
  const seen = new Set();
  for (const v of violations) {
    const k = `${v.index}-${v.ruleId}`;
    if (!seen.has(k)) { seen.add(k); unique.push({ index: v.index, ruleId: v.ruleId }); }
  }
  return unique.sort((a, b) => a.index - b.index);
}

/**
 * Das Ergebnis in der Form von `read().result` der Altform; keine
 * Funktionen, Zahlen über `finiteOrNull`, Grenzen bei Stufen die der letzten
 * Stufe.
 * @param {Analysis|null} analysis
 * @returns {Result|null} null ohne Ergebnis oder bei Fehler
 */
export function resultOf(analysis) {
  if (analysis?.status !== 'ok') return null;
  const { ct, fit } = analysis;
  const ids = ct.subcharts.map((/** @type {{ id: string }} */ s) => s.id);
  /** @type {Object<string, SubchartLimits>} */
  const subcharts = {};
  for (const id of ids) {
    const sc = fit.subcharts[id];
    subcharts[id] = {
      cl: finiteOrNull(lastOf(sc.cl)), ucl: finiteOrNull(lastOf(sc.ucl)),
      lcl: finiteOrNull(lastOf(sc.lcl)), sigma: finiteOrNull(lastOf(sc.sigma)),
    };
  }
  const violations = uniqueViolations(analysis.primaryViolations);
  const cap = analysis.capability;
  return {
    chartType: ct.id,
    subgroupSize: analysis.n,
    n: fit.subcharts[ids[0]].values.length,
    baselineEnd: analysis.baselineEnd,
    stages: [...analysis.stages],
    frozen: analysis.frozen,
    subcharts,
    capability: cap ? /** @type {Capability} */ (Object.fromEntries(Object.entries(cap).map(([k, v]) => [k, finiteOrNull(v)]))) : null,
    violations,
    signals: [...new Set(violations.map((v) => v.index))],
  };
}

/**
 * Je Punkt der ersten Teilkarte eine Zeile: je Teilkarte der Punkt und seine
 * Grenzen (`i`, `iCl`, `iUcl`, `iLcl`, `mr`, … bzw. `xbar…`, `r…`/`s…`),
 * dazu `signal`. Genau so viele Zeilen wie Punkte.
 * @param {Analysis|null} analysis
 * @returns {Array<Object<string, number|boolean|null>>} leer ohne Ergebnis oder bei Fehler
 */
export function pointsOf(analysis) {
  if (analysis?.status !== 'ok') return [];
  const { ct, fit } = analysis;
  /** @type {Record<string, any>} */
  const cols = {};
  for (const { id } of ct.subcharts) {
    const sc = fit.subcharts[id];
    cols[id] = sc.values;
    cols[`${id}Cl`] = sc.cl;
    cols[`${id}Ucl`] = sc.ucl;
    cols[`${id}Lcl`] = sc.lcl;
  }
  const signals = [...new Set(uniqueViolations(analysis.primaryViolations).map((v) => v.index))];
  return zipPoints(cols, { signal: signals }).rows;
}

/**
 * Die Grenzen für Phase II aus einer Rechnung ohne Stufen (skalare Grenzen),
 * wie die Altform sie speicherte: Kartentyp, Untergruppe und Spalte des
 * Models, Ende der Basis, Grenzen beider Teilkarten, Ausschlüsse.
 * @param {any} model
 * @param {Analysis|null} analysis
 * @returns {FrozenLimits|null} null ohne Ergebnis, bei Fehler oder mit Stufen
 */
export function freezeLimitsOf(model, analysis) {
  if (analysis?.status !== 'ok' || analysis.stages.length > 0) return null;
  const ids = analysis.ct.subcharts.map((/** @type {{ id: string }} */ s) => s.id);
  /** @param {Subchart} sc @returns {SubchartLimits} */
  const grab = (sc) => ({
    cl: finiteOrNull(sc.cl), ucl: finiteOrNull(sc.ucl), lcl: finiteOrNull(sc.lcl), sigma: finiteOrNull(sc.sigma),
  });
  const ref = model.columnRef;
  return {
    chartTypeId: model.chartTypeId,
    subgroupSize: model.subgroupSize,
    columnRef: ref ? { instanceId: ref.instanceId, sheetId: ref.sheetId, columnId: ref.columnId } : null,
    baselineEnd: analysis.baselineEnd,
    primary: grab(analysis.fit.subcharts[ids[0]]),
    secondary: grab(analysis.fit.subcharts[ids[1]]),
    excludedIndices: excludedOf(model.annotations),
  };
}

/**
 * Die Rechnung der Kachel, wie die Altkachel sie machte: ohne Stufen, ohne
 * Ausschlüsse, ohne eingefrorene Grenzen, Nelson-Regeln ohne Stufen,
 * Fähigkeit über alle Punkte, dazu die Zahl der Punkte außerhalb der
 * Spezifikation. Phase I höchstens bis zu den Werten, die Punkte bilden
 * (wie im Modul). Kein Merker (die Kachel ist ein Schnappschuss je Rendern).
 * @param {any} model
 * @param {any[]|null|undefined} rawValues Werte der Spalte, ungefiltert
 * @returns {TileAnalysis|null} null ohne Bezug, bei unbekanntem Kartentyp oder unter zwei Werten
 */
export function tileAnalysisOf(model, rawValues) {
  if (!model?.columnRef || !Array.isArray(rawValues)) return null;
  const chartTypeId = model.chartTypeId || 'i-mr';
  const ct = getChartType(chartTypeId);
  if (!ct) return null;
  const values = rawValues.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (values.length < MIN_VALUES) return null;
  const n = model.subgroupSize || 1;
  const baselineEnd = baselineEndOf(model.baselineCount ?? null, values.length, chartTypeId, n, false);
  const enabledRules = Array.isArray(model.enabledRules) ? model.enabledRules : [...DEFAULT_ENABLED_RULES];
  const usl = model.usl ?? null;
  const lsl = model.lsl ?? null;
  /** @type {Subchart} */
  let primary;
  /** @type {Violation[]} */
  let violations;
  try {
    const raw = ct.compute(values, n, baselineEnd);
    const sc = raw.subcharts[ct.subcharts[0].id];
    primary = { values: [...sc.values], cl: sc.cl, ucl: sc.ucl, lcl: sc.lcl, sigma: sc.sigma };
    if (primary.values.length === 0 || !primary.values.every(finite) || !LIMIT_KEYS.every((k) => finiteLimit(primary[k]))) {
      console.warn('control-chart: nicht endliche Werte (Kachel)', { cl: primary.cl, ucl: primary.ucl, lcl: primary.lcl, sigma: primary.sigma });
      return { status: 'error', reason: 'errCompute' };
    }
    violations = evaluateNelsonRules(primary.values, primary.cl, primary.sigma, enabledRules);
  } catch (e) {
    console.warn('control-chart: Rechnung fehlgeschlagen (Kachel)', e);
    return { status: 'error', reason: 'errCompute' };
  }
  const points = /** @type {number[]} */ (primary.values);
  const capability = computeCapability(
    points, /** @type {number} */ (primary.cl),
    /** @type {number} */ (capabilitySigma(chartTypeId, /** @type {number} */ (primary.sigma), n)), usl, lsl,
  );
  const hasSpec = usl != null || lsl != null;
  const outOfSpec = hasSpec
    ? points.filter((v) => (usl != null && v > usl) || (lsl != null && v < lsl)).length
    : null;
  const bc = model.baselineCount;
  const blEnd = bc ? (chartTypeId === 'i-mr' ? bc : Math.ceil(bc / n)) : null;
  return {
    status: 'ok',
    chartTypeId,
    primary,
    violations,
    violationIndices: [...new Set(violations.map((v) => v.index))].sort((a, b) => a - b),
    capability,
    outOfSpec,
    totalPoints: points.length,
    baselineEnd: blEnd != null && blEnd < points.length ? blEnd : null,
  };
}

/**
 * Der Grund, warum nicht gerechnet wurde. Ein Fehlerobjekt eines `computed`
 * (`{ error }`, Wurf außerhalb der Engine) zählt als `errCompute`.
 * @param {Analysis|TileAnalysis|{ error: unknown }|null} analysis
 * @returns {Reason|null} null mit Ergebnis oder ohne Ausgabe
 */
export function errorOf(analysis) {
  if (!analysis) return null;
  if ('status' in analysis) return analysis.status === 'error' ? analysis.reason : null;
  return 'error' in analysis ? 'errCompute' : null;
}
