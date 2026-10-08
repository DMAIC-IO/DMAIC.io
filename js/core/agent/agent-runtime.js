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
 * Aufrufe werden SERIALISIERT (eine Promise-Kette, unten): die Prüfung gilt
 * gegen den Zustand zum Beginn der Ausführung, und zwei nebenläufige
 * `interact()`-Aufrufe können ihre Effekte nicht verschränken.
 *
 * Und sie liefert NIE eine rohe Ausnahme nach außen — der äußere Fang-Punkt
 * umschließt den ganzen Körper, nicht nur den Op-Aufruf.
 *
 * `window` kommt hier nicht vor: Stufe 1 ist ein dünner `window`-Adapter
 * (`startup/agent-surface.js`), Stufe 2 bindet denselben Runtime an einen
 * HTTP-Client.
 */
import { CONTRACT_VERSION, ERRORS } from './agent-contract.js';
import { axiError } from './agent-errors.js';
import { validateBatch, checkResolvedParamTypes } from './agent-validate.js';
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

  /** Der eigentliche Durchlauf. Serialisiert aufgerufen, siehe unten. */
  async function runInteract(input) {
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
          // Zwei Ursachen, zwei Meldungen: eine unbekannte `$from`-Id ist
          // etwas anderes als ein Pfad, der im vorhandenen Ergebnis
          // abbricht — und `available` bedeutet in beiden Fällen etwas
          // anderes. Die Meldung sagt, welche Liste gemeint ist, und nennt
          // bei einem Pfadfehler Pfad UND schuldiges Segment (Spec §6,
          // wie `badShape` in Stufe 4). Review-Befunde M2 + Ledger-Minor.
          message: resolved.reason === 'bad_path'
            ? i18n.t('agent.errors.unresolvedRefPath',
              { id: resolved.from, path: resolved.path, segment: resolved.segment })
            : i18n.t('agent.errors.unresolvedRefId', { id: resolved.from }),
          available: resolved.available,
        });
        allOk = false;
        break;
      }

      // Stufe 3 für die eben aufgelösten Referenzen (Review-Befund C1):
      // ohne diese Zeilen käme ein referenzierter Wert ungeprüft bei der Op
      // an, weil der Prüfer seinen Typ nicht kennen konnte.
      const typeError = checkResolvedParamTypes(action.op, resolved.value, (key, params) => i18n.t(key, params));
      if (typeError) {
        results.push({ ...typeError, id: action.id ?? null });
        allOk = false;
        break;
      }

      // Eine Op wirft im Regelfall nicht (siehe agent-ops.js), aber ein
      // Host-Port (`router.navigate`, IndexedDB, …) kann es trotzdem tun.
      // Dieser Fang-Punkt übersetzt jeden solchen Wurf in einen AXI-Fehler
      // mit der FEINEN Zuordnung (`op_failed` nennt die Op); der äußere
      // Fang-Punkt in `interact` ist das Netz für alles davor und danach.
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
  }

  /**
   * Der letzte Fang-Punkt. `runInteract` berührt außerhalb des Op-Aufrufs
   * noch `consent.ensure()`, `buildWorld`, `validateBatch`, `resolveRefs`
   * und `describeSurface()` — jedes davon kann werfen (ein blockierendes
   * `stateManager.set` im Einwilligungstor reicht). Eine Fläche, die ein
   * Fremdsystem bedient, darf an KEINER Stelle eine rohe Ausnahme liefern
   * (Review-Befund I8); deshalb liegt der GANZE Körper darin.
   * @param {Error|any} err
   * @returns {object} ein AXI-Fehler mit Vertragsversion
   */
  function surfaceFailure(err) {
    const detail = err?.message ?? String(err);
    let message = `agent.errors.surfaceFailed|${detail}`;
    // Auch `i18n.t` ist Fremdcode und darf hier nicht das Netz zerreißen.
    try { message = i18n.t('agent.errors.surfaceFailed', { detail }); } catch { /* Rückfall oben */ }
    return { ok: false, contract: CONTRACT_VERSION, error: ERRORS.SURFACE_FAILED, message };
  }

  /**
   * Serialisierungskette. Ohne sie prüft Stapel B gegen eine
   * `world`-Momentaufnahme, die die laufenden, noch nicht abgeschlossenen
   * Effekte von Stapel A nicht enthält — ein TOCTOU zwischen Prüfung und
   * Ausführung, und damit ein Bruch der Zusage „kein Seiteneffekt vor
   * vollständiger Prüfung" (Spec §5, Review-Befund I7). Das Einwilligungstor
   * dedupliziert nur den Dialog, nicht die Ausführung.
   * @type {Promise<any>}
   */
  let queue = Promise.resolve();

  return {
    interact(input) {
      const run = queue.then(() => runInteract(input).catch(surfaceFailure));
      // Die Kette darf nie in einen abgelehnten Zustand geraten, sonst
      // schlüge der Fehler von Stapel A auf Stapel B durch.
      queue = run.then(() => undefined, () => undefined);
      return run;
    },
  };
}
