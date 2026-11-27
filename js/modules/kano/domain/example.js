/**
 * D.Mike — Kano: Beispiel mit Baum. Rein.
 *
 * Ein Kano-Beispiel bringt seinen VoC→CTx-Baum mit (`{ tree, kano }`). Der
 * Baum entsteht über die Kommandos des Baum-Moduls in einem Stapel für
 * `ctx.instances.interact`: ohne Baum legt der Stapel einen an, einen
 * vorhandenen leert er auf Wunsch vorher. Jeder Knoten bekommt eine
 * Referenz-id aus seiner alten id; nach dem Stapel hängen `relinkKano` die
 * Merkmale auf die neuen Knoten-ids um. Kein DOM, keine Dienste.
 */

/**
 * @typedef {{ $from: string, path: string }} Ref
 * @typedef {{ op: 'module.add', id: string, module: string }} AddOp
 * @typedef {{ op: 'instance.call', id?: string, module: string, instance: string|Ref, method: string, args: any[] }} CallOp
 * @typedef {{ op: 'instance.set', module: string, instance: string|Ref, values: Record<string, any> }} SetOp
 * @typedef {AddOp|CallOp|SetOp} StackOp
 */

const TREE = 'voc-ctx-tree';

/** Referenz-id eines Knotens im Stapel. @param {'voc'|'need'|'drv'|'req'} kind @param {string} id @returns {string} */
export const refId = (kind, id) => `${kind}:${id}`;

/** @param {string} ref @returns {Ref} der Rückgabewert des Schritts (die neue id) */
const valueOf = (ref) => ({ $from: ref, path: 'value' });

/** @param {unknown} v @returns {string} */
const str = (v) => (typeof v === 'string' ? v : '');

/**
 * Ob die Darstellung des Beispielbaums von der Vorgabe abweicht (Randstärke
 * nicht 1 oder eigene Farben); nur dann schreibt der Stapel sie.
 * @param {any} styles
 * @returns {boolean}
 */
export function hasOwnStyles(styles) {
  if (!styles || typeof styles !== 'object') return false;
  const colors = styles.colors && typeof styles.colors === 'object' ? Object.keys(styles.colors) : [];
  return colors.length > 0 || (typeof styles.borderWidth === 'number' && styles.borderWidth !== 1);
}

/**
 * Der Stapel, der den Beispielbaum anlegt bzw. in einen vorhandenen schreibt.
 * @param {{ tree: any, instanceId: string|null, clearVocIds?: ReadonlyArray<string> }} input
 *   `instanceId` der vorhandene Baum oder `null` für einen neuen;
 *   `clearVocIds` die Kundenstimmen, die vorher entfallen
 * @returns {{ stack: StackOp[], refs: Record<string, string> }} der Stapel und
 *   je alter Knoten-id die Referenz-id ihres Schritts
 */
export function exampleTreeStack({ tree, instanceId, clearVocIds = [] }) {
  /** @type {StackOp[]} */
  const stack = [];
  /** @type {Record<string, string>} */
  const refs = {};
  /** @type {string|Ref} */
  const instance = instanceId ?? { $from: 'tree', path: 'instanceId' };
  /** @param {string} method @param {object} args @param {string} [id] */
  const call = (method, args, id) => {
    /** @type {CallOp} */
    const op = { op: 'instance.call', module: TREE, instance, method, args: [args] };
    if (id !== undefined) op.id = id;
    stack.push(op);
  };
  if (instanceId === null) stack.push({ op: 'module.add', id: 'tree', module: TREE });
  for (const vocId of clearVocIds) call('removeVoc', { vocId });
  for (const voc of Array.isArray(tree?.vocs) ? tree.vocs : []) {
    const v = refId('voc', voc.id);
    refs[voc.id] = v;
    call('addVoc', { text: str(voc.text), source: str(voc.source) }, v);
    for (const need of Array.isArray(voc.needs) ? voc.needs : []) {
      const n = refId('need', need.id);
      refs[need.id] = n;
      call('addNeed', { vocId: valueOf(v), text: str(need.text) }, n);
      for (const drv of Array.isArray(need.drivers) ? need.drivers : []) {
        const d = refId('drv', drv.id);
        refs[drv.id] = d;
        call('addDriver', { vocId: valueOf(v), needId: valueOf(n), text: str(drv.text), type: drv.type ?? 'ctq' }, d);
        for (const req of Array.isArray(drv.requirements) ? drv.requirements : []) {
          const r = refId('req', req.id);
          refs[req.id] = r;
          call('addRequirement', {
            vocId: valueOf(v), needId: valueOf(n), drvId: valueOf(d),
            text: str(req.text), target: str(req.target), measure: str(req.measure),
          }, r);
        }
      }
    }
  }
  if (hasOwnStyles(tree?.styles)) {
    stack.push({ op: 'instance.set', module: TREE, instance, values: { styles: tree.styles } });
  }
  return { stack, refs };
}

/**
 * Neue Knoten-ids aus der Antwort des Stapels.
 * @param {{ results?: ReadonlyArray<{ id?: string, result?: any }> }} res
 * @param {Record<string, string>} refs alte Knoten-id → Referenz-id
 * @returns {Record<string, string>} alte Knoten-id → neue Knoten-id
 */
export function newNodeIds(res, refs) {
  /** @type {Map<string, any>} */
  const byRef = new Map((res?.results ?? []).filter((r) => r && r.id).map((r) => [r.id, r.result]));
  /** @type {Record<string, string>} */
  const out = {};
  for (const [old, ref] of Object.entries(refs)) {
    const value = byRef.get(ref)?.value;
    if (typeof value === 'string') out[old] = value;
  }
  return out;
}

/**
 * Den Kano-Teil des Beispiels an den Baum hängen: die Baum-Instanz und je
 * Merkmal die neue Knoten-id; unbekannte Knoten werden `null`.
 * @param {any} kano Kano-Teil des Beispiels (wird nicht verändert)
 * @param {string|null} instanceId die Baum-Instanz, `null` ohne Baumbezug
 * @param {Record<string, string>} ids alte Knoten-id → neue Knoten-id
 * @returns {any} Kopie
 */
export function relinkKano(kano, instanceId, ids) {
  const out = JSON.parse(JSON.stringify(kano));
  out.source = { ...(out.source ?? {}), instanceId };
  if (Array.isArray(out.items)) {
    out.items = out.items.map((/** @type {any} */ i) => ({
      ...i, nodeId: instanceId !== null && typeof i.nodeId === 'string' ? (ids[i.nodeId] ?? null) : null,
    }));
  }
  return out;
}

/**
 * Den Kano-Teil ohne Baumbezug laden (Baum mit Inhalt, nicht überschrieben).
 * @param {any} kano @returns {any} Kopie
 */
export const detachKano = (kano) => relinkKano(kano, null, {});
