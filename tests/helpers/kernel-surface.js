/**
 * Test-Helfer: eine Attrappe von `Workspace#interactAsKernel` für Unit-Tests
 * mit einem `stateManager` aus Literalen. Führt einen Stapel ganz oder gar
 * nicht aus wie die Agentenfläche bei einem nicht eingehängten Arbeitsblatt:
 * `module.add` legt einen Eintrag in `state.phases[phase]` an,
 * `instance.call` lädt den gespeicherten Stand in das echte Model des
 * Arbeitsblatts (`WorksheetModel`, Zielform), ruft das Kommando und legt den
 * Stand zurück. `{ $from, path }`-Verweise werden in jeder Tiefe aufgelöst.
 * Wie die echte Fläche nimmt sie nur Aktionen des Katalogs (`@agent`); ein
 * `@noagent`-Kommando wie `applyRowPermutation` scheitert.
 * Nur für Tests.
 */
import { WorksheetModel } from '../../js/modules/worksheet/domain/model.js';
import { AGENT_REGISTRY } from '../../js/core/agent/agent-registry.generated.js';

/** Wert an einem Punktpfad (`value.3`) eines Ergebnisses. */
function at(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** `{ $from, path }`-Verweise gegen frühere Ergebnisse auflösen, in jeder Tiefe. */
function resolve(v, byId) {
  if (Array.isArray(v)) return v.map(x => resolve(x, byId));
  if (v && typeof v === 'object') {
    if (typeof v.$from === 'string') return at(byId.get(v.$from), v.path);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x, byId)]));
  }
  return v;
}

/**
 * @param {{ state: { phases: object }, modules: Map<string, any>, isCompleted: () => boolean }} world
 *   `state.phases` und die gespeicherten Stände je Instanz
 * @returns {{ interactAsKernel: (stack: object[], source: string) => Promise<object>, stacks: Array<{ stack: object[], source: string }> }}
 */
export function fakeKernelSurface({ state, modules, isCompleted }) {
  const stacks = [];
  let n = 0;
  return {
    stacks,
    async interactAsKernel(stack, source) {
      stacks.push({ stack, source });
      if (isCompleted()) return { ok: false, error: 'validation_failed', cause: { error: 'project_completed' } };
      const before = { phases: structuredClone(state.phases), modules: new Map([...modules].map(([k, v]) => [k, structuredClone(v)])) };
      const byId = new Map();
      const results = [];
      try {
        for (const action of stack) {
          let result;
          if (action.op === 'module.add') {
            const instanceId = `ws-new-${++n}`;
            const items = state.phases[action.phase] ?? [];
            state.phases[action.phase] = [...items, { instanceId, moduleId: action.module, order: items.length, state: {} }];
            result = { instanceId, module: action.module, phase: action.phase };
          } else if (action.op === 'instance.call') {
            if (!Object.hasOwn(AGENT_REGISTRY.worksheet.actions, action.method)) {
              throw new Error(`unknown_method: ${action.method} is not an agent action`);
            }
            const id = resolve(action.instance, byId);
            const model = WorksheetModel.fromJSON(modules.get(id) ?? undefined);
            const value = model[action.method](resolve(action.args[0], byId));
            modules.set(id, structuredClone(model.toJSON()));
            result = { instanceId: id, value };
          } else {
            throw new Error(`unexpected op ${action.op}`);
          }
          results.push({ ok: true, id: action.id ?? null, result });
          if (action.id !== undefined) byId.set(action.id, result);
        }
      } catch (err) {
        state.phases = before.phases;
        modules.clear();
        for (const [k, v] of before.modules) modules.set(k, v);
        return { ok: false, results: [...results, { ok: false, message: err.message }], rolledBack: true };
      }
      return { ok: true, results };
    },
  };
}
