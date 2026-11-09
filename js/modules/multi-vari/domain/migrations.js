/**
 * D.Mike — Multi-Vari: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js (das Schema darf sich ändern, die Migration nicht).
 */
import { uid } from '../../../core/uid.js';

/** Modellformen im Formatstand 1.0. */
const MODEL_FORMS_1_0 = ['nested', 'crossed'];
/** Schätzer im Formatstand 1.0. */
const ESTIMATORS_1_0 = ['anova', 'reml'];

/**
 * Spaltenbezug aus persistiertem JSON, oder null.
 * @param {*} d @returns {{ instanceId: string, sheetId: string, columnId: string }|null}
 */
function refFrom(d) {
  if (!d || typeof d !== 'object') return null;
  if (d.instanceId == null || d.sheetId == null || d.columnId == null) return null;
  return { instanceId: String(d.instanceId), sheetId: String(d.sheetId), columnId: String(d.columnId) };
}

/**
 * '0→1.0': Altstand ohne `_schema` — `columnRefs.measurement`, Faktorzeilen als
 * `factorRows` (mit ids) oder flach als `columnRefs.factors` (neue ids); die
 * Zeilenform des Standes 1.0 selbst geht unverändert durch. Zu
 * viele oder zu wenige Zeilen lässt die Invariante `factorCount` heilen;
 * `columnRefs` und `factorRows` entfallen.
 * @param {object} json Kopie des gespeicherten Zustands
 * @returns {object} Zustand im Formatstand 1.0
 */
export function from0(json) {
  const refs = json.columnRefs && typeof json.columnRefs === 'object' ? json.columnRefs : {};
  let factors;
  if (Array.isArray(json.factorRows)) {
    factors = json.factorRows.map(r => ({ id: typeof r?.id === 'string' ? r.id : uid(), ref: refFrom(r?.ref) }));
  } else if (Array.isArray(json.factors) && json.factors.every(r => r && typeof r === 'object' && 'id' in r)) {
    // Bereits Zeilenform (ein Stand 1.0 ohne `_schema`): unverändert übernehmen.
    factors = json.factors.map(r => ({ id: typeof r.id === 'string' ? r.id : uid(), ref: refFrom(r.ref) }));
  } else if (Array.isArray(refs.factors)) {
    factors = refs.factors.map(r => ({ id: uid(), ref: refFrom(r) }));
  }
  return {
    measurement: refFrom(refs.measurement ?? json.measurement),
    ...(factors ? { factors } : {}),
    modelForm: MODEL_FORMS_1_0.includes(json.modelForm) ? json.modelForm : 'nested',
    estimator: ESTIMATORS_1_0.includes(json.estimator) ? json.estimator : 'anova',
    showPoints: json.showPoints !== false,
    connectMeans: json.connectMeans !== false,
    showGroupMean: json.showGroupMean !== false,
    showRefLine: json.showRefLine !== false,
    exampleWorksheetId: typeof json.exampleWorksheetId === 'string' ? json.exampleWorksheetId : null,
  };
}
