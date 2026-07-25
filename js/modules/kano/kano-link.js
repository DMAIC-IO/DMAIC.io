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

/**
 * Vergleicht die Item-Liste mit den aktuellen Baum-Kandidaten.
 * Losgelöste Items (nodeId === null) bleiben unberührt.
 *
 * @param {Array<object>} items aktuelle Kano-Items
 * @param {Array<{nodeId: string, label: string, path: string}>} candidates
 * @returns {{ added: object[], renamed: Array<{item: object, candidate: object}>, missing: object[] }}
 */
export function diff(items, candidates) {
  const itemList = items || [];
  const candList = candidates || [];
  const byNode = new Map(itemList.filter((i) => i.nodeId).map((i) => [i.nodeId, i]));
  const candIds = new Set(candList.map((c) => c.nodeId));

  const added = candList.filter((c) => !byNode.has(c.nodeId));
  const renamed = [];
  for (const c of candList) {
    const item = byNode.get(c.nodeId);
    if (item && (item.label !== c.label || item.path !== c.path)) renamed.push({ item, candidate: c });
  }
  const missing = itemList.filter((i) => i.nodeId && !candIds.has(i.nodeId) && !i.missing);

  return { added, renamed, missing };
}

/**
 * Wendet ein Diff an: neue Items anhängen, umbenannte aktualisieren,
 * verschwundene als `missing` markieren, zurückgekehrte entmarkieren.
 * Löscht nie ein Item — das bleibt eine bewusste Nutzeraktion.
 *
 * @param {Array<object>} items
 * @param {{ added: object[], renamed: object[], missing: object[] }} diffResult
 * @param {() => string} makeId liefert eine neue, eindeutige Item-ID
 * @returns {Array<object>} neue Liste; die Eingabe wird nicht mutiert
 */
export function applyDiff(items, diffResult, makeId) {
  const renamedByNode = new Map((diffResult?.renamed || []).map((r) => [r.item.nodeId, r.candidate]));
  const missingIds = new Set((diffResult?.missing || []).map((i) => i.id));
  const returnedIds = new Set(
    (items || [])
      .filter((i) => i.missing && !missingIds.has(i.id) && i.nodeId && !(diffResult?.added || []).some((c) => c.nodeId === i.nodeId))
      .map((i) => i.id)
  );

  const next = (items || []).map((item) => {
    const cand = item.nodeId ? renamedByNode.get(item.nodeId) : null;
    return {
      ...item,
      label: cand ? cand.label : item.label,
      path: cand ? cand.path : item.path,
      missing: missingIds.has(item.id) ? true : (returnedIds.has(item.id) ? false : item.missing),
    };
  });

  for (const c of diffResult?.added || []) {
    next.push({ id: makeId(), nodeId: c.nodeId, label: c.label, path: c.path, missing: false });
  }
  return next;
}
