/**
 * D.Mike — Die acht Kernaktionen (agent-ops.js)
 *
 * Alles Fachliche ist eine Modulaktion; die Kernschicht kennt nur
 * Projekt, Katalog und Instanzen. Darum sind es acht und nicht fünfzehn —
 * kein `help.read`, kein `instance.read`, kein `worksheet.import`, kein
 * `connect`. Die Begründung steht in der Spec, die Konsequenz hier: diese
 * Datei wächst nicht, wenn Module dazukommen. Die achte, `instance.set`, setzt
 * Felder eines Schema-Moduls.
 *
 * Jede Funktion WIRFT NICHT. Sie liefert entweder ihr Ergebnis oder ein
 * AXI-Fehlerobjekt (`{ ok: false, error, message, available? }`); die
 * Laufzeit erkennt den Fehlschlag am `ok === false` und bricht den Stapel ab.
 *
 * Ergebnisse bleiben schlank: keine mitgelieferte
 * Entdeckungsinformation. Ein Agent, der ein Modul anlegt, hat dessen
 * Beschreibung vorher gelesen.
 */
import { CONTRACT_VERSION, ERRORS } from './agent-contract.js';
import { axiError } from './agent-errors.js';
import { buildCatalog, buildInstanceList, describeModule } from './agent-catalog.js';
import { canAddInstance, defaultPhaseFor, instanceWorld } from '../router/instance-ops.js';
import { getAllPhaseIds } from '../cycles/cycles.js';
import { requireArity, requireForm } from './agent-argcheck.js';
import { createEntryResolver } from './agent-entries.js';
import { stripPaths } from '../view-fields.js';
import { setFields } from '../model.js';

/**
 * Ein Dienst, der jede Instanz an den Ansichtswechsel verweist — für Aufrufer
 * ohne `instances` (Tests, die nur den Host fälschen).
 * @type {Pick<import('../instances.js').InstancesService, 'read' | 'write'>}
 */
const MOUNT_ONLY = Object.freeze({
  read: async () => { throw Object.assign(new Error('needs_mount'), { code: 'needs_mount' }); },
  write: async () => { throw Object.assign(new Error('needs_mount'), { code: 'needs_mount' }); },
});

/**
 * @param {object} deps  { stateManager, moduleRegistry, i18n, registry, getHelp, host, appVersion }
 *   plus optional `entries` (Auflöser, agent-entries.js), `loadModule` (for the default resolver)
 *   and `instances` (core/instances.js: Lesen und Schreiben ohne Mount)
 * @returns {Record<string, (action: object) => Promise<any>>}
 */
export function createOps(deps) {
  const { stateManager, moduleRegistry, i18n, registry, getHelp, host, appVersion } = deps;
  const entries = deps.entries ?? createEntryResolver(registry, deps.loadModule);
  const instancesService = deps.instances ?? MOUNT_ONLY;
  const t = (key, params) => i18n.t(key, params);

  return {
    'project.read': async () => ({
      contract: CONTRACT_VERSION,
      appVersion,
      language: i18n.getLanguage(),
      view: host.getCurrentView(),
      instances: buildInstanceList({ stateManager, i18n }),
    }),

    'catalog.read': async () => ({
      contract: CONTRACT_VERSION,
      modules: buildCatalog({ moduleRegistry, i18n, registry: entries.view() }),
    }),

    'module.describe': async (action) => {
      await entries.resolve(action.module);
      return describeModule({ moduleRegistry, i18n, registry: entries.view(), getHelp }, action.module, action.sections);
    },

    'module.add': async (action) => {
      // Stufe 5 des Prüfers fängt ein unbekanntes Modul schon vorher ab —
      // dieser Zweig bleibt als Verteidigung, weil die Laufzeit prinzipiell
      // auch ohne Prüfer aufrufbar ist.
      const def = moduleRegistry.get(action.module);
      if (!def) {
        return axiError(ERRORS.UNKNOWN_MODULE,
          t('agent.errors.unknownModule', { module: action.module }),
          { available: moduleRegistry.getAll().map(d => d.id) });
      }

      // Dieselbe Verteidigung für die PHASE. Sie fehlte (Review-Befund C1),
      // und ein referenzierter Wert kam damit bis in `createInstance` →
      // `stateManager.set('phases.<Anzeigename>')`: ein persistierter
      // Phasen-Eimer, den kein Tile und kein Zyklus kennt.
      if (action.phase !== undefined) {
        const cycle = moduleRegistry.getActiveCycle();
        const cyclePhases = getAllPhaseIds(cycle);
        if (!cyclePhases.includes(action.phase)) {
          return axiError(ERRORS.UNKNOWN_PHASE,
            t('agent.errors.unknownPhaseInCycle', { phase: action.phase }), { available: cyclePhases });
        }
      }

      // Phasenzugehörigkeit, Singleton-Regel der UI (Review-Befund I1) und
      // das abgeschlossene Projekt (Befund I2) an einem Ort: `canAddInstance`.
      const cycle = moduleRegistry.getActiveCycle();
      const verdict = canAddInstance(def, action.phase ?? defaultPhaseFor(def, cycle),
        instanceWorld(stateManager, cycle, host.isCompleted()));
      if (!verdict.ok) {
        if (verdict.reason === 'completed') {
          // Im abgeschlossenen Projekt verwirft `stateManager.set` jeden
          // Nicht-`settings.`-Schreibzugriff STILL; ohne diese Absage meldete
          // `module.add` Erfolg mit einer Phantom-Instanz-Id.
          // Derselbe Satz wie die Lesebalken-Meldung der Oberfläche
          // (`frame/helpers.js:28`). Zweimal zu pflegen heißt: zweimal
          // auseinanderzulaufen.
          return axiError(ERRORS.PROJECT_COMPLETED, t('app.projectReadOnly'));
        }
        if (verdict.reason === 'wrongPhase') {
          return axiError(ERRORS.UNKNOWN_PHASE,
            t('agent.errors.unknownPhase', { phase: action.phase, module: action.module }),
            { available: verdict.allowedPhases });
        }
        // Singleton: der Prüfer hat gegen seine Momentaufnahme schon geprüft;
        // zwei `module.add` im SELBEN Stapel sieht nur diese Stelle.
        const existing = buildInstanceList({ stateManager, i18n }).find(it => it.module === action.module);
        return axiError(ERRORS.MODULE_SINGLETON,
          t('agent.errors.moduleSingleton', { module: action.module, instance: existing?.id }));
      }

      const added = await host.addInstance(action.module, action.phase);
      if (!added) {
        // Kein Rückfall auf eine erfundene Id: findet der Host die Instanz
        // nicht wieder, hat nichts stattgefunden.
        return axiError(ERRORS.OP_FAILED,
          t('agent.errors.addNotPersisted', { module: action.module }));
      }
      return added;
    },

    'module.remove': async (action) => {
      const instances = buildInstanceList({ stateManager, i18n });
      // Erst der ehrliche Grund: im abgeschlossenen Projekt gibt der
      // Workspace `false` zurück, und das als „Instanz unbekannt" MIT dieser
      // Id in `available` zu melden war in sich widersprüchlich
      // (Review-Befunde I2 / I3c).
      if (host.isCompleted()) {
        // Derselbe Satz wie die Lesebalken-Meldung der Oberfläche
        // (`frame/helpers.js:28`). Zweimal zu pflegen heißt: zweimal
        // auseinanderzulaufen.
        return axiError(ERRORS.PROJECT_COMPLETED, t('app.projectReadOnly'));
      }
      const removed = await host.removeInstance(action.instance);
      if (!removed) {
        return unknownInstanceError(t, instances, action.instance);
      }
      return { instanceId: action.instance, removed: true };
    },

    'instance.open': async (action) => {
      const instances = buildInstanceList({ stateManager, i18n });
      const opened = await host.openInstance(action.instance);
      if (!opened) {
        return unknownInstanceError(t, instances, action.instance);
      }
      return opened;
    },

    'instance.call': async (action) => {
      const instances = buildInstanceList({ stateManager, i18n });
      const found = instances.find(i => i.id === action.instance);
      if (!found) {
        return unknownInstanceError(t, instances, action.instance);
      }
      // Die Freigabe wird hier ERNEUT geprüft: der Prüfer kommt an sie nur
      // heran, wenn die Modulidentität statisch bekannt war.
      const entry = await entries.resolve(found.module);
      if (entry?.available !== true) {
        return axiError(ERRORS.MODULE_NOT_AGENT_READY,
          t('agent.errors.moduleNotAgentReady', { module: found.module }));
      }
      // Der Katalog IST die Fläche. Zeigt `instance` auf eine Referenz, die
      // nicht aus einem `module.add` mit literalem Modulnamen stammt, kann
      // `staticTargetModule` das Zielmodul nicht bestimmen, und Prüfstufe 5
      // überspringt die Methodenprüfung (agent-validate.js) — ohne diese
      // Zeilen blieb nur die Prüfung gegen das LEBENDE Viewmodel, und damit
      // war jedes öffentliche `@noagent`-Mitglied aufrufbar: ein Dialog zum
      // Öffnen, eine bewusst nicht freigegebene Umschaltung, ein
      // Zurücksetzen von Einstellungen. Geprüft wird VOR `getViewmodel`:
      // ein abgewiesener Aufruf soll die Ansicht nicht erst öffnen.
      // Nur eigene Schlüssel: geerbte Namen wie `constructor` oder `valueOf`
      // gehören nicht zum Katalog.
      const spec = Object.hasOwn(entry.actions ?? {}, action.method)
        ? entry.actions[action.method] : null;
      if (!spec) {
        // Dieselbe Fehlerform wie unten; `available` nennt aber die
        // KATALOG-Aktionen — was der Agent statt dessen rufen darf. Die
        // Methodenliste des Viewmodels wäre hier eine Einladung zu genau dem
        // Aufruf, der gerade abgewiesen wurde.
        // Eigener Satz, nicht `unknownMethod`: hier steht nicht fest, dass es
        // die Methode nicht gibt — sie gehört nur nicht zur Fläche. Der Satz
        // „hat keine Methode" bleibt dem Zweig unten vorbehalten, wo er
        // zutrifft (Registry führt sie, die lebende Komponente nicht).
        return axiError(ERRORS.UNKNOWN_METHOD,
          t('agent.errors.methodNotAgentAction', { module: found.module, method: action.method }),
          { available: Object.keys(entry.actions ?? {}).sort() });
      }
      const args = action.args ?? [];
      // Ohne Ansichtswechsel: `read` jeder Instanz und die Model-Kommandos
      // eines Schema-Moduls. Der Dienst verweist mit `needs_mount` an den
      // alten Weg (Altmodul mit eigenem `read()`). Viewmodel-Kommandos,
      // Abläufe und Aktionen von Altmodulen brauchen das lebende Viewmodel.
      if (action.method === 'read' || spec.target === 'model') {
        try {
          let value;
          if (action.method === 'read') {
            requireArity(action.method, args, spec.params ?? []);
            value = await instancesService.read(action.instance, args[0]);
          } else {
            requireForm('args', args, args.length <= 1, `one command object for ${action.method}`);
            ({ result: value } = await instancesService.write(action.instance,
              (model) => model[action.method](args[0])));
          }
          return callResult(action, value);
        } catch (err) {
          if (err?.code !== 'needs_mount') return serviceError(t, action, action.method, err);
        }
      }
      const viewmodel = await host.getViewmodel(action.instance);
      if (!viewmodel) {
        // Derselbe Vertragscode wie „Instanz unbekannt" (ERRORS.UNKNOWN_INSTANCE) —
        // die echte Ursache ist hier eine andere: die Instanz
        // EXISTIERT, ihr Viewmodel ist nur nicht lebendig (nicht gemountet,
        // Ansicht nicht aktiv). Ein eigener Fehlercode wäre eine
        // Vertragsänderung (CONTRACT_VERSION-Bump) — daher bleibt der Code,
        // aber die Meldung benennt die echte Ursache. Follow-up: eigener
        // Code in einer späteren Vertragsstufe.
        return axiError(ERRORS.UNKNOWN_INSTANCE,
          t('agent.errors.viewmodelNotAlive', { instance: action.instance }), { available: [] });
      }
      // Schema-Kommandos (agent-schema.js) tragen `target`: das Model, das
      // Viewmodel oder `asyncTask` (Ablauf-Host, eigener Zweig darunter).
      // Die Fläche ruft das REAKTIVE Model des Viewmodels.
      if (spec.target === 'asyncTask') return callAsyncTask(viewmodel, spec, action, found.module, entry, t);
      const target = spec.target === 'model'
        ? { object: viewmodel.model, name: action.method }
        : callTarget(viewmodel, action.method);
      if (typeof target.object?.[target.name] !== 'function') {
        // Die Methodenliste der LEBENDEN Komponente, nicht die der Registry:
        // weicht sie ab, ist die generierte Registry stale, und genau das
        // soll der Agent sehen.
        return unknownMethodError(t, found.module, action.method, viewmodel, entry);
      }
      try {
        // Die Argumentzahl gegen den Parametersatz der Registry — dieselbe
        // Quelle, aus der der Agent die Signatur liest. Ohne sie kam ein
        // FEHLENDES Argument als `undefined` bei der Senke an und wurde dort
        // wie der dokumentierte Leerwert behandelt: der Aufruf löschte einen
        // Wert und meldete Erfolg. Der Parametersatz ist immer da
        // — ein Aufruf ohne Katalogeintrag ist oben schon abgewiesen, die
        // Prüfung läuft also nie mehr fail open.
        let value;
        if (spec.target) {
          // Ein Kommando nimmt genau EIN Objekt; die Prüfung seiner Schlüssel
          // macht das Model selbst (requireKeys, gleiche Meldungsform).
          requireForm('args', args, args.length <= 1, `one command object for ${action.method}`);
          value = await target.object[target.name](args[0]);
        } else {
          requireArity(action.method, args, spec.params ?? []);
          value = await target.object[target.name](...args);
        }
        // Auf dem alten Weg fallen die Ansichtsfelder hier aus jedem `read()` —
        // auch aus einem handgeschriebenen; der Dienst streicht sie selbst.
        const shown = action.method === 'read' ? stripPaths(value, entry.viewFields) : value;
        return callResult(action, shown);
      } catch (err) {
        return callFailedError(t, action.method, err);
      }
    },

    'instance.set': async (action) => {
      const instances = buildInstanceList({ stateManager, i18n });
      const found = instances.find(i => i.id === action.instance);
      if (!found) return unknownInstanceError(t, instances, action.instance);
      const entry = await entries.resolve(found.module);
      if (entry?.available !== true) {
        return axiError(ERRORS.MODULE_NOT_AGENT_READY,
          t('agent.errors.moduleNotAgentReady', { module: found.module }));
      }
      // Nur ein Schema-Modul kennt setzbare Felder; ein Modul alter Form ändert
      // seine Felder über Aktionen. Kein neuer Fehlercode (contract bleibt 2).
      if (!Array.isArray(entry.settable)) {
        return axiError(ERRORS.CALL_FAILED, t('agent.errors.setNotSupported', { module: found.module }));
      }
      // Alles prüfen, dann alles schreiben — ohne Ansichtswechsel, auf dem
      // lebenden Model oder dem gespeicherten Stand (Besitzer-Regel im Dienst).
      try {
        const { result: values } = await instancesService.write(action.instance,
          (model) => setFields(model, action.values));
        return { instanceId: action.instance, values };
      } catch (err) {
        if (err?.code !== 'needs_mount') return serviceError(t, action, 'instance.set', err);
      }
      const viewmodel = await host.getViewmodel(action.instance);
      if (!viewmodel) {
        return axiError(ERRORS.UNKNOWN_INSTANCE,
          t('agent.errors.viewmodelNotAlive', { instance: action.instance }), { available: [] });
      }
      try {
        // Alles prüfen, dann alles schreiben — auf dem REAKTIVEN Model.
        const values = setFields(viewmodel.model, action.values);
        return { instanceId: action.instance, values };
      } catch (err) {
        return callFailedError(t, 'instance.set', err);
      }
    },
  };
}

/**
 * Der wiederkehrende „Instanz nicht gefunden"-Fehler von `module.remove`,
 * `instance.open` und `instance.call` — nur die auslösende Host-Methode
 * unterscheidet sich, die Fehlerform ist überall dieselbe.
 * @param {(key: string, params?: object) => string} t
 * @param {Array<{ id: string }>} instances  die aktuelle flache Instanzliste
 * @param {string} instance  der nicht gefundene Bezeichner
 * @returns {{ ok: false, error: string, message: string, available: string[] }}
 */
function unknownInstanceError(t, instances, instance) {
  return axiError(ERRORS.UNKNOWN_INSTANCE,
    t('agent.errors.unknownInstance', { instance }),
    { available: instances.map(i => i.id) });
}

/**
 * Die aufrufbaren, nicht-privaten Methoden eines lebenden Viewmodels, dazu
 * je Teil-Viewmodel dessen Methoden mit Präfix (`draft.addQuestion`).
 * Alpine-Interna (`$el`, `$watch`, …) und `_`-Präfixe bleiben draußen.
 * @param {object} viewmodel
 * @param {string[]} [subNames]  die Teil-Viewmodels laut Katalog
 * @returns {string[]}
 */
function publicMethodsOf(viewmodel, subNames = []) {
  const out = methodNames(viewmodel, false);
  for (const sub of subNames) {
    const vm = viewmodel[sub];
    if (vm && typeof vm === 'object') for (const key of methodNames(vm, true)) out.push(`${sub}.${key}`);
  }
  return out.sort();
}

/**
 * @param {object} obj
 * @param {boolean} withPrototype  Klassenmethoden liegen am Prototyp
 * @returns {string[]} öffentliche Funktionsnamen
 */
function methodNames(obj, withPrototype) {
  const keys = new Set(Object.keys(obj));
  if (withPrototype) {
    for (let p = Object.getPrototypeOf(obj); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
      for (const k of Object.getOwnPropertyNames(p)) if (k !== 'constructor') keys.add(k);
    }
  }
  return [...keys].filter((k) => !k.startsWith('_') && !k.startsWith('$') && typeof obj[k] === 'function');
}

/**
 * Das Objekt, an dem eine Aktion läuft: die Wurzel, oder bei
 * `<teil>.<methode>` das Teil-Viewmodel `<teil>` — damit `this` in der
 * Methode das Teil-Viewmodel ist. Genau eine Ebene:
 * ein weiterer Punkt bleibt Teil des Methodennamens und trifft nichts.
 * @param {object} viewmodel
 * @param {string} method
 * @returns {{ object: object|undefined, name: string }}
 */
function callTarget(viewmodel, method) {
  const dot = method.indexOf('.');
  if (dot < 0) return { object: viewmodel, name: method };
  const sub = viewmodel[method.slice(0, dot)];
  return { object: sub && typeof sub === 'object' ? sub : undefined, name: method.slice(dot + 1) };
}

/**
 * Die Teil-Viewmodels eines Moduls, abgelesen an seinen Katalogaktionen.
 * @param {{ actions?: Record<string, object> }} entry
 * @returns {string[]}
 */
function subViewModelNames(entry) {
  const names = Object.entries(entry.actions ?? {})
    .filter(([k, a]) => k.includes('.') && a?.target !== 'asyncTask')
    .map(([k]) => k.slice(0, k.indexOf('.')));
  return [...new Set(names)];
}

/**
 * Der Fehler für eine Methode, die das lebende Viewmodel nicht hat.
 * @param {Function} t @param {string} moduleId @param {string} method
 * @param {object} viewmodel @param {object} entry
 * @returns {object}
 */
function unknownMethodError(t, moduleId, method, viewmodel, entry) {
  return axiError(ERRORS.UNKNOWN_METHOD, t('agent.errors.unknownMethod', { module: moduleId, method }),
    { available: publicMethodsOf(viewmodel, subViewModelNames(entry)) });
}

/**
 * Die Erfolgsform eines Methodenaufrufs.
 * @param {{ instance: string, method: string }} action @param {any} value
 * @returns {{ instanceId: string, method: string, value: any }}
 */
function callResult(action, value) {
  return { instanceId: action.instance, method: action.method, value: value ?? null };
}

/**
 * Der Fehler eines geworfenen Aufrufs.
 * @param {Function} t @param {string} method @param {any} err
 * @returns {object}
 */
function callFailedError(t, method, err) {
  return axiError(ERRORS.CALL_FAILED,
    t('agent.errors.callFailed', { method, detail: err?.message ?? String(err) }));
}

/**
 * Ein Fehler des Dienstes `instances` als AXI-Fehler. Was keinen Code trägt,
 * kommt aus dem Modul (Argumentprüfung, Kommando) und wird `call_failed`.
 * @param {Function} t @param {{ instance: string }} action @param {string} method @param {any} err
 * @returns {object}
 */
function serviceError(t, action, method, err) {
  if (err?.code === 'project_completed') return axiError(ERRORS.PROJECT_COMPLETED, t('app.projectReadOnly'));
  if (err?.code === 'unknown_instance') {
    // Die Instanz stand eben noch in der Liste: ihr Einhängen hat die Frist gerissen.
    return axiError(ERRORS.UNKNOWN_INSTANCE,
      t('agent.errors.viewmodelNotAlive', { instance: action.instance }), { available: [] });
  }
  return callFailedError(t, method, err);
}

/**
 * Ruft eine Aufgabenaktion (Start oder Abbrechen) am Ablauf-Host des Viewmodels.
 * Der Start wartet bis zum Ende: Wert, `{ cancelled: true }` oder `call_failed`.
 * @param {object} viewmodel @param {object} spec Katalogaktion @param {{ instance: string, method: string, args?: any[] }} action
 * @param {string} moduleId @param {object} entry @param {Function} t
 * @returns {Promise<object>}
 */
async function callAsyncTask(viewmodel, spec, action, moduleId, entry, t) {
  const host = viewmodel._asyncTaskHost;
  if (!host) {
    return unknownMethodError(t, moduleId, action.method, viewmodel, entry);
  }
  const args = action.args ?? [];
  try {
    requireForm('args', args, args.length <= 1, `one command object for ${action.method}`);
    let value;
    if (spec.op === 'cancel') {
      value = { cancelled: host.cancel(spec.task) };
    } else {
      const out = await host.start(spec.task, args[0]);
      if (out.status === 'done') value = out.value;
      else if (out.status === 'cancelled') value = { cancelled: true };
      else if (out.status === 'failed') throw out.error;
      else throw new Error(out.status === 'rejected' ? out.reason : `unknown outcome ${String(out?.status)}`);
    }
    return callResult(action, value);
  } catch (err) {
    return callFailedError(t, action.method, err);
  }
}
