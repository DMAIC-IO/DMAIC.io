/**
 * D.Mike — Kano: Beispiel laden (Hook `beforeLoadExample`).
 *
 * Drei Lagen, je nach dem VoC→CTx-Baum im Projekt (das Baum-Modul gibt es
 * höchstens einmal):
 *   1. kein Baum — der Stapel legt einen an und schreibt den Beispielbaum;
 *   2. ein leerer Baum — der Stapel schreibt den Beispielbaum hinein;
 *   3. ein Baum mit Inhalt — nach Rückfrage wird er überschrieben; ohne
 *      Zustimmung (und ausgehängt, beim Szenario-Laden, ohne Rückfrage) lädt
 *      das Beispiel ohne Baumbezug.
 * Geschrieben wird ganz oder gar nicht über `ctx.instances.interact`; danach
 * hängen die Merkmale an den neuen Knoten-ids (`domain/example.js`). Wirft
 * der Hook, bricht der Kern das Laden ab und meldet es.
 */
import { exampleTreeStack, newNodeIds, relinkKano, detachKano } from '../domain/example.js';

/**
 * @this {{ _context: any }} die Modul-Instanz, die das Beispiel lädt
 * @param {{ tree: any, kano: any }} data das Beispiel
 * @returns {Promise<any>} der Kano-Stand, den der Kern setzt
 * @throws {Error} wenn der Stapel scheitert
 */
export async function beforeLoadExample(data) {
  const ctx = this._context;
  const instances = ctx.instances;
  const trees = instances.list({ modules: ['voc-ctx-tree'] });
  /** @type {string|null} */
  let target = null;
  /** @type {string[]} */
  let clearVocIds = [];
  if (trees.length > 0) {
    target = trees[0].instanceId;
    const read = /** @type {any} */ (await instances.read(target, { fields: ['vocs'] }));
    const vocs = Array.isArray(read?.vocs) ? read.vocs : [];
    if (vocs.length > 0) {
      if (ctx.detached) return detachKano(data.kano);
      const ok = await ctx.dialog.confirm({
        message: ctx.i18n.tf('modules.kano')('confirm.overwriteTree'),
        danger: true,
      });
      if (!ok) return detachKano(data.kano);
      clearVocIds = vocs.map((/** @type {any} */ v) => v.id);
    }
  }
  const { stack, refs } = exampleTreeStack({ tree: data.tree, instanceId: target, clearVocIds });
  const res = /** @type {any} */ (await instances.interact(stack));
  if (res?.ok !== true) throw Object.assign(new Error('kano example: tree stack failed'), { cause: res });
  const instanceId = target ?? res.results?.find((/** @type {any} */ r) => r.id === 'tree')?.result?.instanceId ?? null;
  if (typeof instanceId !== 'string') throw new Error('kano example: no tree instance');
  return relinkKano(data.kano, instanceId, newNodeIds(res, refs));
}
