/**
 * D.Mike — Regression: Planer lesen und den Modelldatensatz bauen (domain/record.js). Rein.
 *
 * `plannerExperiments` liest den Versuch jeder Planer-Instanz über den Leser.
 * `buildRecord` baut die Momentaufnahme, die die Instanz als gespeichertes
 * Modell trägt, in der Form der Altform (`state.models[id]` ohne `id`,
 * `name`, `createdFromInstanceId`): Koeffizienten, Fehlervarianz, Faktorbereiche,
 * Spezifikation, Daten samt Hash und — bei einem Versuch mit Wiederholungen —
 * der p-Wert des Lack-of-Fit-Tests.
 */
import { lackOfFitTest } from '../../../engines/regression-engine.js';
import { buildDataSnapshot, computeDataHash } from '../../../core/model-record.js';
import { numericOf, refKey } from './columns.js';
import { readInputs } from './analyze.js';

/** @typedef {import('../../../core/source-reader.js').Source} Source */
/** @typedef {import('./design-preset.js').PlannerExperiment} PlannerExperiment */

/**
 * Die Versuche der Planer-Instanzen. Eine nicht geladene oder nicht lesbare
 * Instanz zählt mit `loaded: false` (ihr Stand ist unbekannt).
 * @param {Source} src
 * @returns {Array<PlannerExperiment & { loaded: boolean }>}
 */
export function plannerExperiments(src) {
  return src.list().filter((i) => i.moduleId === 'doe-planner').map((p) => {
    try {
      const r = /** @type {any} */ (src.read(p.instanceId, { fields: ['experiment'] }));
      return { plannerId: p.instanceId, experiment: r?.experiment ?? null, loaded: true };
    } catch {
      return { plannerId: p.instanceId, experiment: null, loaded: false };
    }
  });
}

/**
 * Der p-Wert des Lack-of-Fit-Tests über die Wiederholungsgruppen des
 * Quellversuchs; `null` ohne Versuch, ohne Planer oder ohne nutzbare
 * Wiederholungen (Altform `computeLoFPValue`).
 * @param {string|null|undefined} experimentId
 * @param {PlannerExperiment[]} experiments
 * @param {any} r volles Polynomergebnis
 * @param {number[]} y die gerechneten Antworten
 * @param {Map<number, number>} originalToFiltered Blattzeile → gerechnete Zeile
 * @returns {number|null}
 */
export function lofPValueOf(experimentId, experiments, r, y, originalToFiltered) {
  if (!experimentId) return null;
  const exp = experiments.find((e) => e.plannerId === experimentId)?.experiment;
  const groups = exp?.replicateGroups;
  if (!Array.isArray(groups) || groups.length === 0) return null;
  if (!r || !Array.isArray(r.yHat) || !Number.isFinite(r.dfRes)) return null;
  /** @type {number[][]} */
  const translated = [];
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    /** @type {number[]} */
    const mapped = [];
    for (const i of group) {
      const f = originalToFiltered.get(i);
      if (f != null) mapped.push(f);
    }
    if (mapped.length >= 2) translated.push(mapped);
  }
  if (translated.length === 0) return null;
  const lof = lackOfFitTest(y, r.yHat, translated, r.dfRes);
  return lof ? lof.pValue : null;
}

/**
 * Der Datensatz eines Polynoms; `null`, wenn die Spalten nicht lesbar sind.
 * `createdAt` bleibt beim Aktualisieren, `updatedAt` ist `now`.
 * @param {{ colRefs: readonly any[], yRef: any, activeImportSource: any, modelRecord: any }} m
 * @param {Source} src
 * @param {any} r volles Polynomergebnis zum Stand
 * @param {PlannerExperiment[]} experiments
 * @param {string} now ISO-Zeitpunkt
 * @returns {Record<string, any>|null}
 */
export function buildRecord(m, src, r, experiments, now) {
  const cols = readInputs(/** @type {any} */ (m), src);
  if (!cols) return null;
  const xCols = cols.xs.map(numericOf);
  const yRaw = numericOf(cols.y);
  const n = Math.min(yRaw.length, ...xCols.map((c) => c.length));
  /** @type {number[][]} */ const X = [];
  /** @type {number[]} */ const y = [];
  const originalToFiltered = new Map();
  for (let i = 0; i < n; i++) {
    const yv = yRaw[i];
    if (yv == null) continue;
    const row = xCols.map((c) => c[i]);
    if (row.some((v) => v == null)) continue;
    originalToFiltered.set(i, y.length);
    X.push(/** @type {number[]} */ (row));
    y.push(yv);
  }
  const factorSpec = cols.xs.map((col, j) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const row of X) { const v = row[j]; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return { name: col.name, low: -1, high: 1 };
    return { name: col.name, low: lo, high: hi };
  });
  const src0 = m.activeImportSource;
  const yKey = refKey(m.yRef);
  const termSet = r._termNames ? [...r._termNames] : [];
  const dataSnapshot = buildDataSnapshot({
    X, y, factorSpec, termSet,
    experimentId: src0?.experimentId ?? null,
    responseColumn: src0?.sourceColumn ?? yKey,
  });
  dataSnapshot.trainedAt = now;
  return {
    experimentId: src0?.experimentId ?? null,
    responseSpec: { sourceColumn: src0?.sourceColumn ?? yKey, transform: src0?.transform ?? 'identity', aggregateOver: null },
    termSet,
    coef: r._coefficients ? [...r._coefficients] : null,
    vcov: null,
    sigma2: r.Se != null ? r.Se * r.Se : null,
    df: r.df ?? null,
    rSqAdj: r.adjR2 ?? null,
    lofPValue: lofPValueOf(src0?.experimentId, experiments, r, y, originalToFiltered),
    factorSpec,
    spec: r.spec ? JSON.parse(JSON.stringify(r.spec)) : null,
    dataSnapshot,
    dataHash: computeDataHash(X, y),
    createdAt: m.modelRecord?.createdAt ?? now,
    updatedAt: now,
  };
}
