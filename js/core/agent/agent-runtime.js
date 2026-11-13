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
 * Zwei Einstiege, eine Kette: `interact` für den Agenten, `interactAsModule`
 * für Module (`ctx.instances.interact`). Der Modulweg fragt keine
 * Einwilligung, prüft keine gelesene Revision, verlangt an `instance.call`
 * und `instance.set` das Feld `module` und lässt an einem umgestellten Ziel
 * keine Viewmodel-Kommandos und keine `asyncTask`-Aktionen zu — die gehören
 * der Oberfläche und dem Agenten. Ruft eine laufende Aktion selbst
 * `interactAsModule` auf (die Instanz, an der sie gerade arbeitet), läuft der
 * innere Stapel im äußeren Lauf statt hinten in der Kette — dort warteten
 * beide aufeinander.
 *
 * `window` kommt hier nicht vor: Stufe 1 ist ein dünner `window`-Adapter
 * (`startup/agent-surface.js`), Stufe 2 bindet denselben Runtime an einen
 * HTTP-Client.
 */
import { CONTRACT_VERSION, ERRORS, OPS } from './agent-contract.js';
import { axiError } from './agent-errors.js';
import { validateBatch, checkResolvedParamTypes, isWritingAction } from './agent-validate.js';
import { resolveRefs, isRef } from './agent-refs.js';
import { buildWorld, buildCatalog, buildInstanceList } from './agent-catalog.js';
import { flattenBriefing } from './agent-briefing.js';
import { createOps } from './agent-ops.js';
import { createEntryResolver, referencedModules } from './agent-entries.js';
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
 * @param {object} [deps.instances]  Dienst aus core/instances.js; ohne ihn
 *   laufen Lesen und Schreiben über den Ansichtswechsel
 * @param {object} [deps.entries]  Auflöser aus agent-entries.js (Naht für Tests)
 * @param {object} [deps.revisions]  Merker aus agent-revisions.js; ohne Angabe
 *   ein frischer (Naht für Unit-Tests)
 * @returns {{
 *   interact: (input?: object|object[]) => Promise<object>,
 *   interactAsModule: (input: object|object[], caller: { instanceId: string, moduleId: string }) => Promise<object>,
 * }}
 */
export function createAgentRuntime(deps) {
  const { stateManager, moduleRegistry, i18n, registry, consent, host, appVersion } = deps;
  // Schema-Module stehen im Registry nur als Platzhalter; der Auflöser lädt
  // ihren Eintrag bei Bedarf aus dem Modulcode (agent-entries.js).
  const entries = deps.entries ?? createEntryResolver(registry, (id) => moduleRegistry.loadModule?.(id));
  const ops = createOps({ ...deps, entries });

  // Ansichtsfelder zählen nicht zur Revision: ein Klick des Nutzers macht
  // nichts veraltet. Der Kern kennt nur Pfade, die Zuordnung Instanz → Modul
  // → `viewFields` steht hier.
  const ignorePathsOf = (instanceId) => {
    const instance = buildInstanceList({ stateManager, i18n }).find(i => i.id === instanceId);
    return entries.view()[instance?.module]?.viewFields ?? [];
  };

  // Lesen vor Schreiben: was der Agent gesehen hat.
  // Nur im Speicher — nach einem Neuladen ist nichts gelesen.
  const revisions = deps.revisions ?? createRevisionTracker(stateManager, ignorePathsOf);

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
    if (op === 'instance.call' || op === 'instance.set') {
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
   * wartet `host.settle()` bei einer eingehängten Instanz die Persistenz ab:
   * der persist-`$watch` läuft erst im nächsten Alpine-Tick, und eine eigene Änderung, die danach landet,
   * sähe beim nächsten Schreiben wie eine fremde aus. Auch nach `read`: das
   * Einhängen einer Instanz kann ihr Model im `init()` normalisieren. Mit der
   * Instanz-Id legt der Host zudem einen noch fehlenden Zustand ab — sonst
   * schriebe ihn erst der nächste Ansichtswechsel, und die Revision drehte
   * sich ohne Änderung. `catalog.read`, `module.describe` und
   * `instance.open` zeigen keinen Inhalt und vermerken nichts.
   * Ohne `track` (Modulweg) wartet die Laufzeit nur `settle` ab und vermerkt
   * nichts: ein Modul liest nicht für den Agenten, und sein Schreiben soll
   * die Instanz für den Agenten veralten lassen wie jede fremde Änderung —
   * auch eine, die erst im persist-`$watch` landet.
   * @param {string} op
   * @param {object} params
   * @param {any} outcome  das Ergebnis der Op
   * @param {boolean} [track]  Merker des Agenten fortschreiben
   * @returns {Promise<void>}
   */
  async function noteSeen(op, params, outcome, track = true) {
    if (!track) {
      try {
        if (op === 'instance.call' || op === 'instance.set') {
          if (host.isMounted(params.instance)) await host.settle(params.instance);
        } else if (op === 'module.add') {
          await host.settle(outcome.instanceId);
        } else if (op === 'module.remove') {
          await host.settle();
        }
      } catch {
        // Wie unten: die Aktion ist gelungen, ihr Ergebnis bleibt.
      }
      return;
    }
    try {
      if (op === 'project.read') {
        revisions.markStructure();
      } else if (op === 'instance.call' || op === 'instance.set') {
        // Ohne Mount ist der gespeicherte Stand der Stand: der Dienst
        // `instances` hat synchron geschrieben, es gibt nichts abzuwarten.
        if (host.isMounted(params.instance)) await host.settle(params.instance);
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
      catalog: buildCatalog({ moduleRegistry, i18n, registry: entries.view() }),
      instances: buildInstanceList({ stateManager, i18n }),
      view: host.getCurrentView(),
    };
  }

  /**
   * Ob jede Aktion syntaktisch ein Abbruchaufruf ist (`instance.call` auf
   * eine Methode, die auf `.cancel` endet).
   * @param {object|object[]} input
   * @returns {boolean}
   */
  function looksLikeCancelBatch(input) {
    const actions = Array.isArray(input) ? input : [input];
    return actions.length > 0 && actions.every((a) => a && typeof a === 'object' && a.op === 'instance.call'
      && typeof a.instance === 'string' && typeof a.method === 'string' && a.method.endsWith('.cancel'));
  }

  /**
   * Ob jede Aktion im aufgelösten Eintrag ein Task-Abbruch ist (nicht bloß
   * eine Methode, die zufällig `cancel` heißt).
   * @param {object|object[]} input
   * @returns {boolean}
   */
  function isTaskCancelBatch(input) {
    const view = entries.view();
    const instances = buildInstanceList({ stateManager, i18n });
    return (Array.isArray(input) ? input : [input]).every((a) => {
      const module = instances.find((i) => i.id === a.instance)?.module;
      const actions = module ? view[module]?.actions : null;
      const spec = actions && Object.hasOwn(actions, a.method) ? actions[a.method] : null;
      return spec?.target === 'asyncTask' && spec.op === 'cancel';
    });
  }

  /**
   * Meldet geänderte Instanzen, die am Ende des Aufrufs nicht angezeigt
   * werden — ein Toast je Aufruf. Der Host kann fehlen (Tests, Teil-Hosts).
   * @param {string[]} ids
   */
  function notifyBackground(ids) {
    // Ein Toast darf das Ergebnis eines schon angewandten Stapels nie kippen.
    try {
      const hidden = ids.filter(id => !host.isDisplayed?.(id));
      if (hidden.length > 0) host.notifyBackgroundChange?.(hidden);
    } catch (err) {
      console.warn('[agent] background-change toast failed', err);
    }
  }

  /**
   * Ob ein Modul diese Aktion an diesem Modul aufrufen darf. Viewmodel-
   * Kommandos und `asyncTask`-Aktionen eines umgestellten Moduls sind der
   * Oberfläche und dem Agenten vorbehalten; ein Modul schreibt über
   * Model-Kommandos, `instance.set` oder die Aktionen eines Moduls alter Form.
   * @param {string} moduleId
   * @param {string} method
   * @returns {object|null} ein AXI-Fehler `not_module_surface` oder null
   */
  function moduleSurfaceError(moduleId, method) {
    const actions = entries.view()[moduleId]?.actions;
    const spec = actions && Object.hasOwn(actions, method) ? actions[method] : null;
    if (spec?.target !== 'viewmodel' && spec?.target !== 'asyncTask') return null;
    return axiError(ERRORS.NOT_MODULE_SURFACE,
      i18n.t('agent.errors.notModuleSurface', { module: moduleId, method }));
  }

  /**
   * Die Prüfungen, die nur für Module gelten, in der Hülle des Prüfers:
   * `module` ist an `instance.call` und `instance.set` Pflicht, und eine
   * Aktion mit literalem `module` darf kein Viewmodel-Kommando und keine
   * `asyncTask`-Aktion sein. Läuft nach `validateBatch`, vor jedem
   * Seiteneffekt.
   * @param {object[]} actions  der geprüfte Stapel
   * @returns {object|null} `validation_failed` mit `cause` oder null
   */
  function moduleBatchError(actions) {
    for (let index = 0; index < actions.length; index++) {
      const a = actions[index];
      if (a.op !== 'instance.call' && a.op !== 'instance.set') continue;
      let cause = null;
      if (a.module === undefined) {
        cause = axiError(ERRORS.MISSING_PARAM,
          i18n.t('agent.errors.missingParam', { op: a.op, param: 'module' }),
          { available: Object.keys(OPS[a.op].params) });
      } else if (a.op === 'instance.call' && typeof a.module === 'string' && typeof a.method === 'string') {
        cause = moduleSurfaceError(a.module, a.method);
      }
      if (cause) {
        const id = a.id ?? null;
        return {
          ok: false,
          contract: CONTRACT_VERSION,
          error: ERRORS.VALIDATION_FAILED,
          message: id
            ? i18n.t('agent.errors.validationFailed', { index, id })
            : i18n.t('agent.errors.validationFailedNoId', { index }),
          index,
          id,
          cause,
        };
      }
    }
    return null;
  }

  /**
   * Ein Lauf: was Aktionen eines Stapels — und Stapel, die im Lauf
   * wiedereintreten — gemeinsam fortschreiben.
   * @returns {{ inOp: { instanceId: string|null }|null, wrote: boolean, changed: string[] }}
   */
  function newRun() {
    return {
      // Ziel der Aktion, deren Op gerade läuft; sonst null.
      inOp: null,
      // Ein Stapel, der geschrieben hat, flusht EINMAL am Ende des Laufs.
      wrote: false,
      // Ids der wirksam geänderten Instanzen, in der Reihenfolge der ersten
      // Änderung; auch bei späterem Abbruch gefüllt.
      changed: [],
    };
  }

  /** Optionen des Agentenwegs. */
  const AGENT = Object.freeze({ consent: true, revisions: true });

  /**
   * Der eigentliche Durchlauf. Serialisiert aufgerufen, siehe unten.
   * @param {object|object[]} [input]
   * @param {object} [opts]
   * @param {{ gate: object }|null} [opts.decided]  Einwilligung und Laden hat
   *   `decideCancel` schon erledigt; der Lauf überspringt beides.
   * @param {boolean} [opts.consent]  Einwilligungstor fragen (Agent)
   * @param {boolean} [opts.revisions]  Lesen vor Schreiben prüfen und
   *   vermerken (Agent)
   * @param {{ instanceId: string, moduleId: string }} [opts.caller]  das
   *   aufrufende Modul (Modulweg)
   * @param {object} [opts.run]  der Lauf aus `newRun()`; ohne Angabe ein frischer
   * @param {boolean} [opts.inline]  im laufenden Stapel wiedereingetreten:
   *   Speichern und Toast übernimmt der äußere Lauf
   */
  async function runInteract(input, opts = AGENT) {
    const { decided = null, caller = null, inline = false } = opts;
    const track = opts.revisions === true;
    const run = opts.run ?? newRun();
    if (opts.consent) {
      const gate = decided ? decided.gate : await consent.ensure();
      if (!gate.ok) return { ...gate, contract: CONTRACT_VERSION };
    }

    if (input === undefined || input === null) {
      const surface = await describeSurface();
      // Die Beschreibung zeigt die Instanzliste — ein Lesen der Struktur.
      if (track) revisions.markStructure();
      return surface;
    }

    // Eine Momentaufnahme für den ganzen Prüflauf: der Prüfer darf nicht
    // gegen einen Zustand prüfen, der sich zwischen den Stufen verschiebt.
    // Schema-Module, die der Stapel nennt, vorher auflösen: der Prüfer
    // (Stufe 5) kennt ihre Aktionen sonst nicht.
    if (!decided) await entries.preload(referencedModules(input, buildInstanceList({ stateManager, i18n })));
    const world = buildWorld({ stateManager, moduleRegistry, i18n, registry: entries.view(), completed: host.isCompleted() });
    const checked = validateBatch(input, world);
    if (!checked.ok) return { ...checked, contract: CONTRACT_VERSION };
    if (caller) {
      const refused = moduleBatchError(checked.actions);
      if (refused) return refused;
    }

    const results = [];
    const byId = new Map();
    let allOk = true;
    // Ein Stapel, der geschrieben hat, flusht EINMAL am Ende — nicht je
    // Aktion: der Preis ist ein Plattenzugriff pro Stapel.
    const changed = run.changed;

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

      // Das Feld `module` einer aufgelösten Instanzreferenz: erst jetzt
      // ist die Instanz bekannt. Ein Literal hat Stufe 5 schon geprüft.
      if ((action.op === 'instance.call' || action.op === 'instance.set')
          && typeof resolved.value.module === 'string' && isRef(action.instance)) {
        const actual = buildInstanceList({ stateManager, i18n })
          .find((e) => e.id === resolved.value.instance)?.module;
        if (actual !== undefined && actual !== resolved.value.module) {
          results.push({
            ...axiError(ERRORS.INSTANCE_MODULE_MISMATCH,
              i18n.t('agent.errors.instanceModuleMismatch',
                { instance: String(resolved.value.instance), actual, module: resolved.value.module })),
            id: action.id ?? null,
          });
          allOk = false;
          break;
        }
      }

      // Regel für Module an einer aufgelösten Instanzreferenz; ein literales
      // `module` hat `moduleBatchError` schon geprüft.
      if (caller && action.op === 'instance.call') {
        const actual = buildInstanceList({ stateManager, i18n })
          .find((e) => e.id === resolved.value.instance)?.module;
        const refused = actual !== undefined ? moduleSurfaceError(actual, resolved.value.method) : null;
        if (refused) {
          results.push({ ...refused, id: action.id ?? null });
          allOk = false;
          break;
        }
      }

      // Eine Op wirft im Regelfall nicht (siehe agent-ops.js), aber ein
      // Host-Port (`router.navigate`, IndexedDB, …) kann es trotzdem tun —
      // und die Revisionsprüfung hasht Modulzustand. Dieser Fang-Punkt
      // übersetzt jeden solchen Wurf in einen AXI-Fehler mit der FEINEN
      // Zuordnung (`op_failed` nennt die Op); der äußere Fang-Punkt in
      // `interact` ist das Netz für alles davor und danach.
      let outcome;
      try {
        const stale = track ? staleRevision(action.op, resolved.value) : null;
        if (stale) {
          outcome = stale;
        } else {
          if (isWritingAction(action)) run.wrote = true;
          // Solange die Op läuft, darf ein Modul, das an dieser Instanz
          // arbeitet, wiedereintreten (siehe `interactAsModule`).
          const outer = run.inOp;
          const target = resolved.value.instance;
          run.inOp = { instanceId: typeof target === 'string' ? target : null };
          try {
            outcome = await ops[action.op](resolved.value);
          } finally {
            run.inOp = outer;
          }
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
      if (isWritingAction(action) && (action.op === 'instance.set' || action.op === 'instance.call')
          && !changed.includes(resolved.value.instance)) {
        changed.push(resolved.value.instance);
      }
      results.push({ ok: true, id: action.id ?? null, result: outcome });
      if (action.id !== undefined) byId.set(action.id, outcome);
      await noteSeen(action.op, resolved.value, outcome, track);
    }

    // Wiedereingetreten: Speichern und Toast macht der äußere Lauf, einmal.
    if (inline) return { ok: allOk, contract: CONTRACT_VERSION, results };

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
    // es bleibt dabei: ein fehlgeschlagener Flush IST ein
    // Misserfolg des Stapels, nur kein unspezifischer.
    if (run.wrote) {
      try {
        // Beide Hälften: der `save()`-Debounce (localStorage: phases,
        // models, chartEdits, …) und die IndexedDB-Warteschlange. Erst dann
        // heißt `ok: true` „angewandt und gespeichert".
        stateManager.saveNow();
        await stateManager.flushNow();
      } catch (err) {
        const detail = err?.message ?? String(err);
        notifyBackground(changed);
        return {
          ok: false,
          contract: CONTRACT_VERSION,
          error: ERRORS.FLUSH_FAILED,
          message: i18n.t('agent.errors.flushFailed', { detail }),
          results,
        };
      }
    }
    notifyBackground(changed);
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

  /**
   * Ob der Stapel ein reiner Task-Abbruch ist: Einwilligung, Einträge laden,
   * dann die Prüfung am aufgelösten Eintrag. Wirft nie; ohne Entscheidung
   * (`decided: null`) läuft der Stapel in der Kette den ganzen Weg selbst.
   * @param {object|object[]} input
   * @returns {Promise<{ cancel: boolean, decided: { gate: object }|null }>}
   */
  async function decideCancel(input) {
    try {
      const gate = await consent.ensure();
      if (!gate.ok) return { cancel: false, decided: { gate } };
      await entries.preload(referencedModules(input, buildInstanceList({ stateManager, i18n })));
      return { cancel: isTaskCancelBatch(input), decided: { gate } };
    } catch {
      return { cancel: false, decided: null };
    }
  }

  /**
   * Der Lauf, der gerade an der Spitze der Kette steht; sonst null. Nur über
   * ihn erkennt `interactAsModule` einen Wiedereintritt.
   * @type {object|null}
   */
  let current = null;

  /**
   * Führt einen Stapel an der Spitze der Kette aus und hält ihn solange als
   * `current`.
   * @param {object|object[]} [input]
   * @param {object} opts  Optionen von `runInteract`
   * @returns {Promise<object>}
   */
  function runChained(input, opts) {
    const run = newRun();
    current = run;
    return runInteract(input, { ...opts, run })
      .catch(surfaceFailure)
      .finally(() => { if (current === run) current = null; });
  }

  /**
   * Reiht die Eingabe in die Kette ein.
   * @param {object|object[]} [input]
   * @param {object} [opts]  Optionen von `runInteract`
   * @returns {Promise<object>}
   */
  function enqueue(input, opts = AGENT) {
    const run = queue.then(() => runChained(input, opts));
    // Die Kette darf nie in einen abgelehnten Zustand geraten, sonst
    // schlüge der Fehler von Stapel A auf Stapel B durch.
    queue = run.then(() => undefined, () => undefined);
    return run;
  }

  return {
    interact(input) {
      if (!looksLikeCancelBatch(input)) return enqueue(input);
      // Den Platz in der Kette sofort reservieren, damit ein später abgesetzter
      // Aufruf nicht überholt; die Entscheidung läuft daneben an.
      const decision = decideCancel(input);
      const queued = queue.then(() => decision)
        .then((d) => {
          if (d.cancel) return undefined;
          // Im Platz gilt die Einwilligung von jetzt, nicht die vom Aufruf: war das
          // Tor offen, prüft `runInteract` selbst erneut (ohne Dialog, solange sie
          // gilt). Eine Verweigerung wird unverändert zurückgegeben, ohne zweiten Dialog.
          const decided = d.decided?.gate?.ok ? null : d.decided;
          return runChained(input, { ...AGENT, decided });
        });
      queue = queued.then(() => undefined, () => undefined);
      return decision.then((d) => (d.cancel
        ? runInteract(input, { ...AGENT, decided: d.decided }).catch(surfaceFailure)
        : queued));
    },

    /**
     * Der Einstieg für Module (`ctx.instances.interact`): dieselben Ops,
     * dieselbe Antwortform, dieselbe Kette — ohne Einwilligung und ohne
     * Lesen vor Schreiben. Arbeitet die laufende Aktion gerade an der
     * Instanz des Aufrufers, läuft der Stapel sofort in diesem Lauf (mit
     * eigener Prüfung, Speichern am Ende des äußeren); jeder andere
     * Aufruf reiht sich hinten ein.
     * @param {object|object[]} input
     * @param {{ instanceId: string, moduleId: string }} caller
     * @returns {Promise<object>}
     */
    interactAsModule(input, caller) {
      const opts = { consent: false, revisions: false, caller };
      if (current?.inOp && current.inOp.instanceId === caller?.instanceId) {
        return runInteract(input, { ...opts, run: current, inline: true }).catch(surfaceFailure);
      }
      return enqueue(input, opts);
    },
  };
}
