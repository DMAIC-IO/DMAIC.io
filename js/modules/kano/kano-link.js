/**
 * D.Mike — Kano ↔ VoC-CTx-Tree Link (kano-link.js)
 *
 * Die einzige Stelle im Kano-Modul, die den Aufbau des voc-ctx-tree-States
 * kennt. Reine Funktionen: kein DOM, kein i18n, keine Mutation der Eingaben.
 *
 * Baum-Form (voc-ctx-tree-model.js):
 *   Voc { id, text, source, needs: Need[] }
 *   Need { id, text, drivers: Driver[] }
 *   Driver { id, text, type, requirements: Req[] }
 *   Req { id, text, target, measure }
 *
 * Spec: docs/superpowers/specs/2026-07-25-kano-modul-design.md
 */

/** Wählbare Item-Ebenen, Reihenfolge = Anzeigereihenfolge im Select. */
export const LEVELS = ['need', 'driver', 'req'];

/** Trennzeichen im Anzeigepfad. */
const SEP = ' ▸ ';

/**
 * Alle voc-ctx-tree-Instanzen des Projekts über alle Phasen hinweg.
 * @param {object} stateManager
 * @returns {Array<{ instanceId: string, state: object|null }>}
 */
export function listTrees(stateManager) {
  if (!stateManager) return [];
  const phases = stateManager.get('phases') || {};
  const out = [];
  for (const instances of Object.values(phases)) {
    if (!Array.isArray(instances)) continue;
    for (const inst of instances) {
      if (inst?.moduleId !== 'voc-ctx-tree') continue;
      out.push({ instanceId: inst.instanceId, state: stateManager.getModuleState(inst.instanceId) });
    }
  }
  return out;
}

/**
 * Klopft den Baum auf der gewählten Ebene flach.
 * @param {object|null} treeState persistierter voc-ctx-tree-State
 * @param {'need'|'driver'|'req'} level
 * @returns {Array<{ nodeId: string, label: string, path: string }>}
 */
export function flatten(treeState, level) {
  if (!treeState || !Array.isArray(treeState.vocs) || !LEVELS.includes(level)) return [];
  const out = [];
  for (const voc of treeState.vocs) {
    const vocPath = voc?.text || '';
    for (const need of voc?.needs || []) {
      if (level === 'need') {
        out.push({ nodeId: need.id, label: need.text || '', path: vocPath });
        continue;
      }
      const needPath = [vocPath, need?.text || ''].join(SEP);
      for (const drv of need?.drivers || []) {
        if (level === 'driver') {
          out.push({ nodeId: drv.id, label: drv.text || '', path: needPath });
          continue;
        }
        const drvPath = [needPath, drv?.text || ''].join(SEP);
        for (const req of drv?.requirements || []) {
          out.push({ nodeId: req.id, label: req.text || '', path: drvPath });
        }
      }
    }
  }
  return out;
}
