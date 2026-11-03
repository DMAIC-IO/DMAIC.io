/**
 * D.Mike — Einträge der Agentenfläche auflösen (agent-entries.js)
 *
 * Für ein Schema-Modul (deklaratives Model, core/model.js) führt die
 * generierte Registry nur einen Platzhalter `{ schema: true, available: true }`:
 * der echte Eintrag entsteht aus dem Schema und das liegt im Modulcode, der
 * erst bei Bedarf geladen wird. Dieser Auflöser lädt ihn beim ersten Bedarf
 * (`describe`, `instance.call`, `instance.set`) und hält ihn danach.
 * `catalog.read` kommt mit dem Platzhalter aus — er lädt nichts.
 *
 * Spec 2026-11-03-module-einzeln-nachladbar-design.md §9 („describe lädt nach“, „Übergang“).
 */

/**
 * @param {Record<string, object>} registry AGENT_REGISTRY
 * @param {(id: string) => Promise<{ agentEntry?: object }|undefined>} [loadModule]
 * @returns {{ resolve: (id: string) => Promise<object|undefined>,
 *             preload: (ids: string[]) => Promise<void>,
 *             view: () => Record<string, object> }}
 */
export function createEntryResolver(registry, loadModule) {
  const resolved = new Map();

  async function resolve(id) {
    const base = registry[id];
    if (base?.schema !== true) return base;
    if (resolved.has(id)) return resolved.get(id);
    let entry;
    try {
      if (typeof loadModule === 'function') entry = (await loadModule(id))?.agentEntry;
    } catch (err) {
      console.warn(`[agent] ${id}: Modul nicht ladbar`, err);
    }
    if (!entry) return { ...base, available: false };
    resolved.set(id, entry);
    return entry;
  }

  return {
    resolve,
    async preload(ids) {
      for (const id of new Set(ids)) await resolve(id);
    },
    view() {
      return resolved.size === 0 ? registry : { ...registry, ...Object.fromEntries(resolved) };
    },
  };
}

/**
 * Die Module, die ein Stapel statisch benennt — wörtliche `module`-Felder und
 * literale `instance`-Ids. Referenzen löst `agent-ops.js` zur Laufzeit selbst auf.
 * @param {object|object[]} input @param {Array<{ id: string, module: string }>} instances
 * @returns {string[]}
 */
export function referencedModules(input, instances) {
  const byId = new Map(instances.map(i => [i.id, i.module]));
  const out = [];
  for (const a of Array.isArray(input) ? input : [input]) {
    if (!a || typeof a !== 'object') continue;
    if (typeof a.module === 'string') out.push(a.module);
    if (typeof a.instance === 'string' && byId.has(a.instance)) out.push(byId.get(a.instance));
  }
  return out;
}
