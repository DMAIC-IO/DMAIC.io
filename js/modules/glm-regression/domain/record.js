/**
 * D.Mike — GLM-Regression: den Modelldatensatz bauen (domain/record.js). Rein.
 *
 * Die Momentaufnahme, die die Instanz als gespeichertes Modell trägt, in der
 * Form der Altform (`saveAsModel`: `state.models[id]` ohne `id`, `name`,
 * `createdFromInstanceId`): Familie, Terme, Koeffizienten, Faktorbereiche
 * (kategoriale X mit Stufen), Spezifikation, Daten samt Hash.
 */
import { buildGLMDesignMatrix } from '../../../engines/glm-engine.js';
import { buildDataSnapshot, computeDataHash } from '../../../core/model-record.js';
import { refKey } from './columns.js';

/**
 * Der Datensatz zu einem konvergierten Fit; `null` ohne Fit oder ohne Zeilen.
 * `createdAt` bleibt beim Aktualisieren, `updatedAt` ist `now`.
 * @param {{ yRef: any, modelRecord: any }} m
 * @param {import('./analyze.js').Analysis} a
 * @param {string} now ISO-Zeitpunkt
 * @returns {Record<string, any>|null}
 */
export function buildRecord(m, a, now) {
  const r = a.fit;
  const fd = a.data;
  if (!r || !r.converged || !fd || fd.y.length === 0) return null;
  const { y, xCols, xNames, xIsCat } = fd;
  const factorSpec = xNames.map((name, j) => {
    if (xIsCat[j]) {
      const levels = [...new Set(xCols[j].map(String))].sort();
      return { name, kind: 'categorical', levels, reference: levels[0] };
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of xCols[j]) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return { name, kind: 'continuous', low: -1, high: 1 };
    return { name, kind: 'continuous', low: lo, high: hi };
  });
  const predictors = factorSpec.map((f) => (f.kind === 'categorical'
    ? { id: f.name, kind: 'categorical', levels: [.../** @type {string[]} */ (f.levels)], reference: /** @type {string} */ (f.reference) }
    : { id: f.name, kind: 'continuous' }));
  const columns = xCols.map((vals, j) => ({ values: vals, name: xNames[j], categorical: xIsCat[j] }));
  const { X } = buildGLMDesignMatrix(columns);
  const yKey = m.yRef ? refKey(m.yRef) : null;
  const dataSnapshot = buildDataSnapshot({ X, y, factorSpec, termSet: [...r.terms], experimentId: null, responseColumn: yKey });
  dataSnapshot.trainedAt = now;
  return {
    experimentId: null,
    responseSpec: { sourceColumn: yKey, transform: 'identity', aggregateOver: null },
    family: { name: r.family.name, link: r.family.link, ...(r.family.theta != null ? { theta: r.family.theta } : {}) },
    terms: [...r.terms],
    termSet: [...r.terms],
    coef: [...r.coefficients],
    vcov: null,
    sigma2: null,
    df: r.n - r.p,
    rSqAdj: r.pseudoR2?.nagelkerke ?? 0,
    lofPValue: null,
    factorSpec,
    spec: { predictors, terms: [] },
    dataSnapshot,
    dataHash: computeDataHash(X, y),
    createdAt: m.modelRecord?.createdAt ?? now,
    updatedAt: now,
  };
}
