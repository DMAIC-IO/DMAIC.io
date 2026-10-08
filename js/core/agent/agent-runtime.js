/**
 * D.Mike — Laufzeit der Agentenfläche (agent-runtime.js)
 *
 * Drei Schritte, immer in dieser Reihenfolge:
 *   1. Einwilligungstor (Spec §3.2) — vor JEDEM Aufruf, auch dem
 *      parameterlosen. Ohne Zustimmung fließt keine Information.
 *   2. Prüfung des GANZEN Stapels (Spec §5) — schlägt sie fehl, passiert
 *      kein Seiteneffekt, und die Rückgabe enthält keine Teilergebnisse.
 *   3. Ausführung, der Reihe nach, mit Referenzauflösung gegen die bereits
 *      erzielten Ergebnisse. Beim ersten Laufzeitfehler Abbruch mit
 *      Teilergebnissen (Spec §4.3).
 *
 * `window` kommt hier nicht vor: Stufe 1 ist ein dünner `window`-Adapter
 * (`startup/agent-surface.js`), Stufe 2 bindet denselben Runtime an einen
 * HTTP-Client.
 */
import { CONTRACT_VERSION, ERRORS } from './agent-contract.js';
import { axiError } from './agent-errors.js';
import { validateBatch } from './agent-validate.js';
import { resolveRefs } from './agent-refs.js';
import { buildWorld, buildCatalog, buildInstanceList } from './agent-catalog.js';
import { buildUsage } from './agent-usage.js';
import { createOps } from './agent-ops.js';

/**
 * @param {object} deps
 * @param {object} deps.stateManager
 * @param {object} deps.moduleRegistry
 * @param {object} deps.i18n
 * @param {Record<string, object>} deps.registry  AGENT_REGISTRY
 * @param {(id: string) => Promise<object|null>} deps.getHelp
 * @param {{ ensure: () => Promise<object> }} deps.consent
 * @param {object} deps.host  siehe ui/agent-host.js
 * @param {string} deps.appVersion
 * @returns {{ interact: (input?: object|object[]) => Promise<object> }}
 */
export function createAgentRuntime(deps) {
  const { stateManager, moduleRegistry, i18n, registry, consent, host, appVersion } = deps;
  const ops = createOps(deps);

  /** Die Antwort auf `interact()` ohne Parameter (Spec §3.1). */
  function describeSurface() {
    return {
      ok: true,
      contract: CONTRACT_VERSION,
      appVersion,
      language: i18n.getLanguage(),
      usage: buildUsage(i18n),
      catalog: buildCatalog({ moduleRegistry, i18n, registry }),
      instances: buildInstanceList({ stateManager, i18n }),
      view: host.getCurrentView(),
    };
  }

  return {
    async interact(input) {
      const gate = await consent.ensure();
      if (!gate.ok) return { ...gate, contract: CONTRACT_VERSION };

      if (input === undefined || input === null) return describeSurface();

      // Eine Momentaufnahme für den ganzen Prüflauf: der Prüfer darf nicht
      // gegen einen Zustand prüfen, der sich zwischen den Stufen verschiebt.
      const world = buildWorld({ stateManager, moduleRegistry, i18n, registry });
      const checked = validateBatch(input, world);
      if (!checked.ok) return { ...checked, contract: CONTRACT_VERSION };

      const results = [];
      const byId = new Map();
      let allOk = true;

      for (const action of checked.actions) {
        const resolved = resolveRefs(action, byId);
        if (!resolved.ok) {
          results.push({
            ok: false,
            id: action.id ?? null,
            error: ERRORS.UNRESOLVED_REF,
            message: i18n.t('agent.errors.unresolvedRef', { id: resolved.from }),
            available: resolved.available,
          });
          allOk = false;
          break;
        }

        // Eine Op wirft im Regelfall nicht (siehe agent-ops.js), aber ein
        // Host-Port (`router.navigate`, IndexedDB, …) kann es trotzdem tun.
        // Dieser EINE Fang-Punkt übersetzt jeden solchen Wurf in einen
        // AXI-Fehler, statt ihn unbehandelt aus `interact()` fallen zu
        // lassen — eine Stelle statt sieben Einzelfälle je Op.
        let outcome;
        try {
          outcome = await ops[action.op](resolved.value);
        } catch (err) {
          outcome = axiError(ERRORS.OP_FAILED,
            i18n.t('agent.errors.opFailed', { op: action.op, detail: err?.message ?? String(err) }));
        }
        if (outcome && outcome.ok === false) {
          results.push({ ...outcome, id: action.id ?? null });
          allOk = false;
          break;                               // Spec §4.3: Abbruch, Teilergebnisse bleiben
        }
        results.push({ ok: true, id: action.id ?? null, result: outcome });
        if (action.id !== undefined) byId.set(action.id, outcome);
      }

      return { ok: allOk, contract: CONTRACT_VERSION, results };
    },
  };
}
