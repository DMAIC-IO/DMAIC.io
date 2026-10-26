/**
 * D.Mike — Laufzeit der Agentenfläche (agent-runtime.js)
 *
 * Drei Schritte, immer in dieser Reihenfolge:
 *   1. Einwilligungstor — vor JEDEM Aufruf, auch dem
 *      parameterlosen. Ohne Zustimmung fließt keine Information.
 *   2. Prüfung des GANZEN Stapels — schlägt sie fehl, passiert
 *      kein Seiteneffekt, und die Rückgabe enthält keine Teilergebnisse.
 *   3. Ausführung, der Reihe nach, mit Referenzauflösung gegen die bereits
 *      erzielten Ergebnisse. Beim ersten Laufzeitfehler Abbruch mit
 *      Teilergebnissen.
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
import { validateBatch, checkResolvedParamTypes, isWritingAction } from './agent-validate.js';
import { resolveRefs } from './agent-refs.js';
import { buildWorld, buildCatalog, buildInstanceList } from './agent-catalog.js';
import { buildUsage } from './agent-usage.js';
import { flattenBriefing } from './agent-briefing.js';
import { AI_ASSISTANT_CHAPTER_ID } from '../../help/help-keys.js';
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
  const { stateManager, moduleRegistry, i18n, registry, consent, host, appVersion, getHelp } = deps;
  const ops = createOps(deps);

  /**
   * Das Rollen-Briefing als Klartext. Quelle ist das Handbuchkapitel
   * `js/help/ai-assistant-help.js` — dasselbe, das das Hilfesystem als
   * Kapitel zeigt und das der statische Generator nach `/app/<tag>/docs/`
   * mitnimmt. Über `getHelp` und damit über den stabilen Mantel
   * `help-registry.js`, nicht über die erzeugte Datei.
   * @returns {Promise<string>} das Briefing in der aktiven Sprache, sonst leer
   */
  async function briefingText() {
    return flattenBriefing(await getHelp(AI_ASSISTANT_CHAPTER_ID), i18n.getLanguage());
  }

  /** Die Antwort auf `interact()` ohne Parameter. */
  async function describeSurface() {
    return {
      ok: true,
      contract: CONTRACT_VERSION,
      appVersion,
      language: i18n.getLanguage(),
      // Eine Quelle, drei Verwendungen: hier der Kontextfenster-Text, im
      // Hilfefenster das Kapitel, im statischen Handbuch eine zitierbare URL.
      briefing: await briefingText(),
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

    if (input === undefined || input === null) return await describeSurface();

    // Eine Momentaufnahme für den ganzen Prüflauf: der Prüfer darf nicht
    // gegen einen Zustand prüfen, der sich zwischen den Stufen verschiebt.
    const world = buildWorld({ stateManager, moduleRegistry, i18n, registry, completed: host.isCompleted() });
    const checked = validateBatch(input, world);
    if (!checked.ok) return { ...checked, contract: CONTRACT_VERSION };

    const results = [];
    const byId = new Map();
    let allOk = true;
    // Ein Stapel, der geschrieben hat, flusht EINMAL am Ende — nicht je
    // Aktion: der Preis ist ein Plattenzugriff pro Stapel.
    let wrote = false;

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
          // bei einem Pfadfehler Pfad UND schuldiges Segment (wie `badShape` in Stufe 4). Review-Befunde M2 + Ledger-Minor.
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

      if (isWritingAction(action)) wrote = true;

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
        break;                               // Abbruch, Teilergebnisse bleiben
      }
      results.push({ ok: true, id: action.id ?? null, result: outcome });
      if (action.id !== undefined) byId.set(action.id, outcome);
    }

    // `ok: true` heißt „liegt auf Platte". Der `stateManager` schreibt hinter
    // einer Debounce (2 s localStorage, 500 ms IndexedDB); ohne dieses Flush
    // verliert ein Agent, der schreibt und danach neu lädt oder exportiert,
    // seinen bestätigten Schreibzugriff. Auch im Fehlerfall gibt der Stapel
    // Teilergebnisse zurück, und was passiert ist, muss auch auf Platte sein.
    //
    // Review-Befund (Important, Fixrunde 1): ein ungeschütztes `await
    // flushNow()` hier liegt in der Serialisierungskette unter
    // `.catch(surfaceFailure)` (siehe unten). Lehnt `flushNow()` ab (z. B.
    // IndexedDB-Quota), gingen die bereits gebauten `results` verloren und
    // der Agent sähe einen generischen `surface_failed` — und könnte
    // bereits gelandete Schreibvorgänge für nicht passiert halten und
    // wiederholen. Deshalb: eigener Fang-Punkt, eigener Fehlercode
    // (`FLUSH_FAILED`), `results` bleiben erhalten. `ok` bleibt `false` —
    // das Ruling aus Task 1 gilt weiter: ein fehlgeschlagener Flush IST ein
    // Misserfolg des Stapels, nur kein unspezifischer.
    if (wrote) {
      try {
        await stateManager.flushNow();
      } catch (err) {
        const detail = err?.message ?? String(err);
        return {
          ok: false,
          contract: CONTRACT_VERSION,
          error: ERRORS.FLUSH_FAILED,
          message: i18n.t('agent.errors.flushFailed', { detail }),
          results,
        };
      }
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
   * vollständiger Prüfung" (Review-Befund I7). Das Einwilligungstor
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
