/**
 * D.Mike — Zielgrößenoptimierung: Beispiele mit Modellen. Rein.
 *
 * Ein Beispiel trägt neben dem eigenen Zustand (Zielform, `_schema`) die
 * Liste `models`: Modelldatensätze mit `id` und `name`. Ein Modell gehört
 * einer Instanz (Regel D5); die Ansicht legt dafür je Datensatz eine
 * Regressions-Instanz an (`owners`, Zustand in deren Zielform). Das Optimum
 * der gewählten Modelle rechnet dieselbe Funktion wie der Lauf
 * (`optimize`) und steht im eigenen Zustand.
 */
import { optimize } from './optimize.js';
import { effectiveSpec, selectedIdsOf, yRangeOf } from './models.js';

/** Schema-Stand der Regression, in dem die Besitzer angelegt werden. */
const REGRESSION_SCHEMA = Object.freeze({ version: '1.0' });

/**
 * @typedef {{ id: string, name: string, state: Record<string, any> }} ExampleOwner
 */

/**
 * Beispiel → Besitzer und eigener Zustand.
 * @param {Record<string, any>} data das Beispiel (eigener Zustand und `models`)
 * @returns {{ owners: ExampleOwner[], state: Record<string, any> }}
 */
export function exampleParts(data) {
  const { models = [], ...rest } = JSON.parse(JSON.stringify(data ?? {}));
  /** @type {Record<string, any>} */
  const state = rest;
  const records = /** @type {Array<Record<string, any>>} */ (Array.isArray(models) ? models : [])
    .filter((m) => m && typeof m.id === 'string');
  const owners = records.map((m) => {
    const { id, name, createdFromInstanceId: _owner, ...modelRecord } = m;
    const label = typeof name === 'string' && name ? name : id;
    return {
      id,
      name: label,
      state: { _schema: { ...REGRESSION_SCHEMA }, savedModelId: id, savedModelName: label, modelRecord },
    };
  });
  const specs = state.specs && typeof state.specs === 'object' ? state.specs : {};
  const ids = selectedIdsOf(specs, records.map((m) => m.id));
  if (ids.length > 0) {
    const chosen = ids.map((id) => /** @type {any} */ (records.find((m) => m.id === id)));
    /** @type {Record<string, any>} */
    const effective = {};
    for (const m of chosen) effective[m.id] = effectiveSpec(specs[m.id], yRangeOf(m));
    state.optimization = optimize(chosen, effective);
  }
  return { owners, state };
}
