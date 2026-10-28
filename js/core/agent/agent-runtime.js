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
import { CONTRACT_VERSION, ERRORS, OPS } from './agent-contract.js';
import { axiError } from './agent-errors.js';
import { validateBatch, checkResolvedParamTypes, isWritingAction } from './agent-validate.js';
import { resolveRefs } from './agent-refs.js';
import { buildWorld, buildCatalog, buildInstanceList } from './agent-catalog.js';
import { flattenBriefing } from './agent-briefing.js';
import { createOps } from './agent-ops.js';
import { createRevisionTracker } from './agent-revisions.js';

/**
 * Die Aktionsformen, wie der Agent sie liest: je op `params` und `result`,
 * abgeleitet aus `OPS` und nicht nebenher aufgeschrieben.
 * @returns {Record<string, { params: object, result: object }>}
 */
function opShapes() {
  const out = {};
  for (const [name, spec] of Object.entries(OPS)) out[name] = { params: spec.params, result: spec.result };
  return out;
}

/**
 * @param {object} deps
 * @param {object} deps.stateManager
 * @param {object} deps.moduleRegistry
 * @param {object} deps.i18n
 * @param {Record<string, object>} deps.registry  AGENT_REGISTRY
 * @param {(id: string) => Promise<object|null>} deps.getHelp  für `module.describe`
 * @param {{ ensure: () => Promise<object> }} deps.consent
 * @param {object} deps.host  siehe ui/agent-host.js
 * @param {string} deps.appVersion
 * @param {object} [deps.revisions]  Merker aus agent-revisions.js; ohne Angabe
 *   ein frischer (Naht für Unit-Tests)
 * @returns {{ interact: (input?: object|object[]) => Promise<object> }}
 */
export function createAgentRuntime(deps) {
  const { stateManager, moduleRegistry, i18n, registry, consent, host, appVersion } = deps;
  const ops = createOps(deps);

  // Lesen vor Schreiben: was der Agent gesehen hat.
  // Nur im Speicher — nach einem Neuladen ist nichts gelesen.
  const revisions = deps.revisions ?? createRevisionTracker(stateManager);

  /**
   * Prüft eine schreibende Aktion gegen den Merker — zur Ausführungszeit und
   * je Aktion, nicht im Validator: zwischen zwei `await` kann der Nutzer
   * gearbeitet haben.
   * @param {string} op
   * @param {object} params  die Aktion mit aufgelösten Referenzen
   * @returns {object|null} ein AXI-Fehler `stale_revision` — ohne Token und
   *   ohne `available` — oder null
   */
  function staleRevision(op, params) {
    if (!isWritingAction({ op, method: params.method })) return null;
    if (op === 'instance.call') {
      // Eine Instanz, die es nicht gibt, meldet die Op selbst als
      // `unknown_instance` mit den gültigen Ids — die nützlichere Antwort.
      const exists = buildInstanceList({ stateManager, i18n }).some(i => i.id === params.instance);
      if (!exists || revisions.isInstanceCurrent(params.instance)) return null;
      return axiError(ERRORS.STALE_REVISION,
        i18n.t('agent.errors.staleRevision', { instance: params.instance }));
    }
    if (revisions.isStructureCurrent()) return null;
    return axiError(ERRORS.STALE_REVISION, i18n.t('agent.errors.staleStructure'));
  }

  /**
   * Vermerkt nach einer gelungenen Aktion, was der Agent jetzt kennt. Vorher
   * wartet `host.settle()` die Persistenz ab: der persist-`$watch` läuft erst
   * im nächsten Alpine-Tick, und eine eigene Änderung, die danach landet,
   * sähe beim nächsten Schreiben wie eine fremde aus. Auch nach `read`: das
   * Einhängen einer Instanz kann ihr Model im `init()` normalisieren. Mit der
   * Instanz-Id legt der Host zudem einen noch fehlenden Zustand ab — sonst
   * schriebe ihn erst der nächste Ansichtswechsel, und die Revision drehte
   * sich ohne Änderung. `catalog.read`, `module.describe` und
   * `instance.open` zeigen keinen Inhalt und vermerken nichts.
   * @param {string} op
   * @param {object} params
   * @param {any} outcome  das Ergebnis der Op
   * @returns {Promise<void>}
   */
  async function noteSeen(op, params, outcome) {
    try {
      if (op === 'project.read') {
        revisions.markStructure();
      } else if (op === 'instance.call') {
        await host.settle(params.instance);
        revisions.markInstance(params.instance);
      } else if (op === 'module.add') {
        // `host.addInstance` hat das Einhängen schon abgewartet; erst danach
        // steht der Ausgangszustand, dessen Revision hier vermerkt wird.
        await host.settle(outcome.instanceId);
        revisions.markStructure();
        revisions.markInstance(outcome.instanceId);
      } else if (op === 'module.remove') {
        await host.settle();
        revisions.markStructure();
        revisions.forgetInstance(params.instance);
      }
    } catch {
      // `settle` und die Revision berühren Modulcode und dürfen werfen. Die
      // Aktion ist dann trotzdem gelungen; ihr Ergebnis und das Speichern
      // am Stapelende dürfen nicht verloren gehen. Unvermerkt ist sicher:
      // der nächste Schreibzugriff verlangt ein neues Lesen.
      const id = op === 'module.add' ? outcome?.instanceId : params.instance;
      if (typeof id === 'string') revisions.forgetInstance(id);
    }
  }

  /**
   * Der Agententext als Klartext in der aktiven Sprache. Dynamisch geladen:
   * er gehört nicht ins Start-Bundle, und gebraucht wird er nur beim
   * parameterlosen Aufruf.
   * @returns {Promise<string>}
   */
  async function briefingText() {
    const { default: text } = await import('./agent-briefing-text.js');
    return flattenBriefing(text, i18n.getLanguage());
  }

  /** Die Antwort auf `interact()` ohne Parameter. */
  async function describeSurface() {
    return {
      ok: true,
      contract: CONTRACT_VERSION,
      appVersion,
      language: i18n.getLanguage(),
      // Der eine Agententext (agent-briefing-text.js), nur hier ausgeliefert.
      briefing: await briefingText(),
      // Die Daten des früheren `usage`; die Prosa dazu steht nur im Briefing.
      ops: opShapes(),
      errors: Object.values(ERRORS),
      catalog: buildCatalog({ moduleRegistry, i18n, registry }),
      instances: buildInstanceList({ stateManager, i18n }),
      view: host.getCurrentView(),
    };
  }

  /** Der eigentliche Durchlauf. Serialisiert aufgerufen, siehe unten. */
  async function runInteract(input) {
    const gate = await consent.ensure();
    if (!gate.ok) return { ...gate, contract: CONTRACT_VERSION };

    if (input === undefined || input === null) {
      const surface = await describeSurface();
      // Die Beschreibung zeigt die Instanzliste — ein Lesen der Struktur.
      revisions.markStructure();
      return surface;
    }

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

      // Eine Op wirft im Regelfall nicht (siehe agent-ops.js), aber ein
      // Host-Port (`router.navigate`, IndexedDB, …) kann es trotzdem tun —
      // und die Revisionsprüfung hasht Modulzustand. Dieser Fang-Punkt
      // übersetzt jeden solchen Wurf in einen AXI-Fehler mit der FEINEN
      // Zuordnung (`op_failed` nennt die Op); der äußere Fang-Punkt in
      // `interact` ist das Netz für alles davor und danach.
      let outcome;
      try {
        const stale = staleRevision(action.op, resolved.value);
        if (stale) {
          outcome = stale;
        } else {
          if (isWritingAction(action)) wrote = true;
          outcome = await ops[action.op](resolved.value);
        }
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
      await noteSeen(action.op, resolved.value, outcome);
    }

    // `ok: true` heißt angewandt und gespeichert — der `stateManager` schreibt
    // hinter zwei Debounces (2 s localStorage, 500 ms IndexedDB); beide werden
    // hier vorgezogen. Ohne sie verliert ein Agent, der schreibt und danach
    // neu lädt oder exportiert, seinen bestätigten Schreibzugriff. Auch im
    // Fehlerfall gibt der Stapel Teilergebnisse zurück, und was passiert ist,
    // muss auch auf Platte sein.
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
        // Beide Hälften: der `save()`-Debounce (localStorage: phases,
        // models, chartEdits, …) und die IndexedDB-Warteschlange. Erst dann
        // heißt `ok: true` „angewandt und gespeichert".
        stateManager.saveNow();
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
