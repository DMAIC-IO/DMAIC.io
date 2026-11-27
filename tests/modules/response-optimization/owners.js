/**
 * Test-Helfer der Zielgrößenoptimierung: ein Leser über die Modulzustände
 * eines Projektdokuments. Regressions- und GLM-Instanzen liefern ihr
 * `savedModel` aus dem echten Model (Migration und Ableitung), andere Instanzen
 * werfen `not_loaded`, wenn ihr Modul in `unloaded` steht.
 */
import { State as Regression } from '../../../js/modules/regression/domain/model.js';
import { State as Glm } from '../../../js/modules/glm-regression/domain/model.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';

setModelName(Regression, 'regression');
setModelName(Glm, 'glm-regression');

const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
const OWNERS = { regression: Regression, 'glm-regression': Glm };
const T = (/** @type {string} */ k) => k;

/**
 * @param {{ phases: Record<string, Array<{ instanceId: string, moduleId: string }>>, moduleStates: Record<string, any> }} doc
 * @param {{ unloaded?: string[] }} [opts] Module, deren Instanzen `not_loaded` werfen
 * @returns {import('../../../js/core/source-reader.js').Source & { reads: string[] }}
 */
export function ownersSource(doc, { unloaded = [] } = {}) {
  /** @type {string[]} */
  const reads = [];
  const instances = Object.entries(doc.phases).flatMap(([phase, list]) => list.map((i) => ({ instanceId: i.instanceId, moduleId: i.moduleId, phase })));
  return {
    reads,
    list: () => instances.map((i) => ({ ...i })),
    read(instanceId) {
      reads.push(instanceId);
      const inst = instances.find((i) => i.instanceId === instanceId);
      if (!inst) throw Object.assign(new Error(`unknown_instance: ${instanceId}`), { code: 'unknown_instance' });
      if (unloaded.includes(inst.moduleId)) throw Object.assign(new Error(`not_loaded: ${instanceId}`), { code: 'not_loaded' });
      const Model = /** @type {any} */ (OWNERS)[inst.moduleId];
      if (!Model) return {};
      const m = Model.fromJSON(JSON.parse(JSON.stringify(doc.moduleStates[instanceId] ?? {})), { context: CTX });
      return evaluateDerived(m, this, ['savedModel'], T);
    },
    ensureLoaded: async () => false,
  };
}

/**
 * Ein Dokument mit einer Besitzerinstanz je Datensatz (für reine Fälle).
 * @param {Array<Record<string, any>>} records Modelldatensätze mit `id` und `name`
 * @param {string} [moduleId]
 * @returns {{ phases: Record<string, any[]>, moduleStates: Record<string, any> }}
 */
export function docWithModels(records, moduleId = 'regression') {
  const phases = { improve: records.map((r, i) => ({ instanceId: `own-${i}`, moduleId })) };
  /** @type {Record<string, any>} */
  const moduleStates = {};
  records.forEach((r, i) => {
    moduleStates[`own-${i}`] = { savedModelId: r.id, savedModelName: r.name, savedModel: r };
  });
  return { phases, moduleStates };
}
