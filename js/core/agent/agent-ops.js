/**
 * D.Mike — Die sieben Kernaktionen (agent-ops.js)
 *
 * Alles Fachliche ist eine Modulaktion; die Kernschicht kennt nur
 * Projekt, Katalog und Instanzen. Darum sind es sieben und nicht fünfzehn —
 * kein `help.read`, kein `instance.read`, kein `worksheet.import`, kein
 * `connect`. Die Begründung steht in der Spec, die Konsequenz hier: diese
 * Datei wächst nicht, wenn Module dazukommen.
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
import { buildCatalog, buildInstanceList, describeModule, allowedPhasesFor, isSingleton } from './agent-catalog.js';
import { getAllPhaseIds } from '../cycles/cycles.js';
import { requireArity } from './agent-argcheck.js';

/**
 * @param {object} deps  { stateManager, moduleRegistry, i18n, registry, getHelp, host, appVersion }
 * @returns {Record<string, (action: object) => Promise<any>>}
 */
export function createOps(deps) {
  const { stateManager, moduleRegistry, i18n, registry, getHelp, host, appVersion } = deps;
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
      modules: buildCatalog({ moduleRegistry, i18n, registry }),
    }),

    'module.describe': async (action) =>
      describeModule({ moduleRegistry, i18n, registry, getHelp }, action.module, action.sections),

    'module.add': async (action) => {
      // Stufe 5 des Prüfers fängt ein unbekanntes Modul schon vorher ab —
      // dieser Zweig bleibt als Verteidigung, weil die Laufzeit prinzipiell
      // auch ohne Prüfer aufrufbar ist (Ruling R7a).
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
        const allowed = allowedPhasesFor(def, cycle);
        if (!allowed.includes(action.phase)) {
          return axiError(ERRORS.UNKNOWN_PHASE,
            t('agent.errors.unknownPhase', { phase: action.phase, module: action.module }),
            { available: allowed });
        }
      }

      // Die Singleton-Regel der UI (Review-Befund I1). Der Prüfer hat sie
      // gegen seine Momentaufnahme schon geprüft; zwei `module.add` im
      // SELBEN Stapel sieht nur diese Stelle.
      if (isSingleton(def)) {
        const existing = buildInstanceList({ stateManager, i18n }).find(it => it.module === action.module);
        if (existing) {
          return axiError(ERRORS.MODULE_SINGLETON,
            t('agent.errors.moduleSingleton', { module: action.module, instance: existing.id }));
        }
      }

      // Im abgeschlossenen Projekt verwirft `stateManager.set` jeden
      // Nicht-`settings.`-Schreibzugriff STILL. Ohne diesen Zweig meldete
      // `module.add` Erfolg und lieferte eine Phantom-Instanz-Id
      // (Review-Befund I2).
      if (host.isCompleted()) {
        // Derselbe Satz wie die Lesebalken-Meldung der Oberfläche
        // (`frame/helpers.js:28`). Zweimal zu pflegen heißt: zweimal
        // auseinanderzulaufen.
        return axiError(ERRORS.PROJECT_COMPLETED, t('app.projectReadOnly'));
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
      const entry = registry[found.module];
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
      const viewmodel = await host.getViewmodel(action.instance);
      if (!viewmodel) {
        // Derselbe Vertragscode wie „Instanz unbekannt" (ERRORS.UNKNOWN_INSTANCE,
        // Ruling R7b) — die echte Ursache ist hier eine andere: die Instanz
        // EXISTIERT, ihr Viewmodel ist nur nicht lebendig (nicht gemountet,
        // Ansicht nicht aktiv). Ein eigener Fehlercode wäre eine
        // Vertragsänderung (CONTRACT_VERSION-Bump) — daher bleibt der Code,
        // aber die Meldung benennt die echte Ursache. Follow-up: eigener
        // Code in einer späteren Vertragsstufe.
        return axiError(ERRORS.UNKNOWN_INSTANCE,
          t('agent.errors.viewmodelNotAlive', { instance: action.instance }), { available: [] });
      }
      const target = callTarget(viewmodel, action.method);
      if (typeof target.object?.[target.name] !== 'function') {
        // Die Methodenliste der LEBENDEN Komponente, nicht die der Registry:
        // weicht sie ab, ist die generierte Registry stale, und genau das
        // soll der Agent sehen.
        return axiError(ERRORS.UNKNOWN_METHOD,
          t('agent.errors.unknownMethod', { module: found.module, method: action.method }),
          { available: publicMethodsOf(viewmodel, subViewModelNames(entry)) });
      }
      const args = action.args ?? [];
      try {
        // Die Argumentzahl gegen den Parametersatz der Registry — dieselbe
        // Quelle, aus der der Agent die Signatur liest. Ohne sie kam ein
        // FEHLENDES Argument als `undefined` bei der Senke an und wurde dort
        // wie der dokumentierte Leerwert behandelt: der Aufruf löschte einen
        // Wert und meldete Erfolg (Ruling 55). Der Parametersatz ist immer da
        // — ein Aufruf ohne Katalogeintrag ist oben schon abgewiesen, die
        // Prüfung läuft also nie mehr fail open.
        requireArity(action.method, args, spec.params ?? []);
        const value = await target.object[target.name](...args);
        return { instanceId: action.instance, method: action.method, value: value ?? null };
      } catch (err) {
        return axiError(ERRORS.CALL_FAILED,
          t('agent.errors.callFailed', { method: action.method, detail: err?.message ?? String(err) }));
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
  const names = Object.keys(entry.actions ?? {}).filter((k) => k.includes('.')).map((k) => k.slice(0, k.indexOf('.')));
  return [...new Set(names)];
}
