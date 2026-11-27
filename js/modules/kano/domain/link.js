/**
 * D.Mike — Kano: Verknüpfung mit dem VoC→CTx-Baum. Rein.
 *
 * Die einzige Stelle des Moduls, die die Leseform des Baum-Moduls kennt
 * (`read({ fields: ['vocs'] })`: `vocs[].needs[].drivers[].requirements[]`
 * mit `id` und `text`). Kein DOM, kein i18n, keine Mutation der Eingaben.
 */

/** Wählbare Ebenen, Reihenfolge = Anzeigereihenfolge im Auswahlfeld. */
export const LEVELS = Object.freeze(['need', 'driver', 'req']);

/** Trennzeichen im Anzeigepfad. */
export const SEP = ' ▸ ';

/**
 * Die wirksame Baum-Instanz: die gespeicherte; ohne gespeicherte bei genau
 * einem Baum im Projekt, leerer Merkmalliste und nicht bewusst gelöster
 * Verknüpfung dessen id; sonst `null`. Heilung beim Lesen — gespeichert wird
 * die Verknüpfung erst mit der ersten Übernahme.
 * @param {{ stored: string|null, treeIds: ReadonlyArray<string>, itemsEmpty: boolean, unlinked: boolean }} args
 * @returns {string|null}
 */
export function effectiveSourceId({ stored, treeIds, itemsEmpty, unlinked }) {
  if (stored !== null) return stored;
  if (!unlinked && itemsEmpty && treeIds.length === 1) return treeIds[0];
  return null;
}

/**
 * Klopft den Baum auf der gewählten Ebene flach.
 * @param {{ vocs?: ReadonlyArray<any> }|null|undefined} treeState Leseform des Baums (`vocs`)
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
 * @returns {{ added: object[], renamed: Array<{item: object, candidate: object}>, missing: object[], presentNodeIds: Set }}
 */
export function diff(items, candidates) {
  const itemList = items || [];
  const candList = candidates || [];
  const byNode = new Map(itemList.filter((i) => i.nodeId).map((i) => [i.nodeId, i]));
  const presentNodeIds = new Set(candList.map((c) => c.nodeId));

  const added = candList.filter((c) => !byNode.has(c.nodeId));
  const renamed = [];
  for (const c of candList) {
    const item = byNode.get(c.nodeId);
    if (item && (item.label !== c.label || item.path !== c.path)) renamed.push({ item, candidate: c });
  }
  const missing = itemList.filter((i) => i.nodeId && !presentNodeIds.has(i.nodeId) && !i.missing);

  return { added, renamed, missing, presentNodeIds };
}

/**
 * Wendet ein Diff an: neue Items anhängen, umbenannte aktualisieren,
 * verschwundene als `missing` markieren, zurückgekehrte entmarkieren.
 * Löscht nie ein Item — das bleibt eine bewusste Nutzeraktion.
 * Das `missing`-Flag wird direkt von `presentNodeIds` abgeleitet:
 * - Item mit nodeId: missing = !presentNodeIds.has(nodeId)
 * - Item ohne nodeId (losgelöst): missing bleibt unverändert
 *
 * @param {Array<object>} items
 * @param {{ added: object[], renamed: object[], missing: object[], presentNodeIds?: Set }} diffResult
 * @param {() => string} makeId liefert eine neue, eindeutige Item-ID
 * @returns {Array<object>} neue Liste; die Eingabe wird nicht mutiert
 */
export function applyDiff(items, diffResult, makeId) {
  const renamedByNode = new Map((diffResult?.renamed || []).map((r) => [r.item.nodeId, r.candidate]));
  const presentNodeIds = diffResult?.presentNodeIds;

  const next = (items || []).map((item) => {
    const cand = item.nodeId ? renamedByNode.get(item.nodeId) : null;
    let nextMissing = item.missing;
    if (item.nodeId && presentNodeIds) {
      nextMissing = !presentNodeIds.has(item.nodeId);
    }
    return {
      ...item,
      label: cand ? cand.label : item.label,
      path: cand ? cand.path : item.path,
      missing: nextMissing,
    };
  });

  for (const c of diffResult?.added || []) {
    next.push({ id: makeId(), nodeId: c.nodeId, label: c.label, path: c.path, missing: false });
  }
  return next;
}
