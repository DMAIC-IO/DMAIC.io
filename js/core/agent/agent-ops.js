/**
 * D.Mike — Die sieben Kernaktionen (agent-ops.js)
 *
 * Spec §7: Alles Fachliche ist eine Modulaktion; die Kernschicht kennt nur
 * Projekt, Katalog und Instanzen. Darum sind es sieben und nicht fünfzehn —
 * kein `help.read`, kein `instance.read`, kein `worksheet.import`, kein
 * `connect`. Die Begründung steht in der Spec, die Konsequenz hier: diese
 * Datei wächst nicht, wenn Module dazukommen.
 *
 * Jede Funktion WIRFT NICHT. Sie liefert entweder ihr Ergebnis oder ein
 * AXI-Fehlerobjekt (`{ ok: false, error, message, available? }`); die
 * Laufzeit erkennt den Fehlschlag am `ok === false` und bricht den Stapel ab.
 *
 * Ergebnisse bleiben schlank (Spec §4.4): keine mitgelieferte
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
      // heran, wenn die Modulidentität statisch bekannt war (Spec §5).
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
      // Öffnen (E3), eine bewusst nicht freigegebene Umschaltung, ein
      // Zurücksetzen von Einstellungen. Geprüft wird VOR `getViewmodel`:
      // ein abgewiesener Aufruf soll die Ansicht nicht erst öffnen.
      const spec = entry.actions?.[action.method];
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
      if (typeof viewmodel[action.method] !== 'function') {
        // Die Methodenliste der LEBENDEN Komponente, nicht die der Registry:
        // weicht sie ab, ist die generierte Registry stale, und genau das
        // soll der Agent sehen.
        return axiError(ERRORS.UNKNOWN_METHOD,
          t('agent.errors.unknownMethod', { module: found.module, method: action.method }),
          { available: publicMethodsOf(viewmodel) });
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
        const value = await viewmodel[action.method](...args);
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
 * Die aufrufbaren, nicht-privaten Methoden eines lebenden Viewmodels.
 * Alpine-Interna (`$el`, `$watch`, …) und `_`-Präfixe bleiben draußen.
 * @param {object} viewmodel
 * @returns {string[]}
 */
function publicMethodsOf(viewmodel) {
  const out = [];
  for (const key of Object.keys(viewmodel)) {
    if (key.startsWith('_') || key.startsWith('$')) continue;
    if (typeof viewmodel[key] === 'function') out.push(key);
  }
  return out.sort();
}
