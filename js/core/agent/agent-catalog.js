/**
 * D.Mike — Katalog und Weltmomentaufnahme der Agentenschicht (agent-catalog.js)
 *
 * Drei Dinge, die alle aus demselben Material gebaut sind (Modulregistry,
 * stateManager, i18n, generierte Registry):
 *   • `buildCatalog`      — ALLE Module mit Name, whenToUse, Freigabestatus
 *   • `buildInstanceList` — die flache Instanzliste
 *   • `buildWorld`        — die Momentaufnahme, gegen die der Prüfer prüft
 *
 * Spec §9: alle Module werden gelistet, auch nicht freigegebene — damit der
 * Agent sagen kann „dieses Werkzeug wäre jetzt richtig, ich kann es nicht
 * bedienen — mach du."
 *
 * Kein DOM, kein `window`. Phasen sind zyklus-abhängig (Global Constraint) —
 * die Nicht-Methodik-Phasen `data`/`extras` kommen daher nie als Literal vor,
 * sondern aus `js/core/cycles/cycles.js` (`VIRTUAL_PHASES`, `getAllPhaseIds`).
 */
import { ERRORS } from './agent-contract.js';
import { axiError } from './agent-errors.js';
import { VIRTUAL_PHASES, getAllPhaseIds } from '../cycles/cycles.js';
import { allowedPhasesFor as phasesFor } from '../router/instance-ops.js';

/**
 * Die erlaubten Phasen eines Moduls im aktiven Zyklus.
 *
 * Nur noch ein Durchreicher: die Regel steht in
 * `core/router/instance-ops.js` und wird von Kacheln, Router und
 * Agentenfläche gemeinsam benutzt. Der Name bleibt, weil `agent-ops.js` und
 * `buildWorld` ihn aufrufen.
 *
 * @param {object} def
 * @param {string} activeCycle
 * @returns {string[]}
 */
export function allowedPhasesFor(def, activeCycle) {
  return phasesFor(def, activeCycle);
}

/**
 * Darf dieses Modul nur EINMAL im Projekt vorkommen?
 *
 * Die EINE Stelle, an der die Agentenschicht `def.singleton` liest — der
 * Prüfer (über `buildWorld`) und die Verteidigung in `agent-ops.js` benutzen
 * beide dieses Ergebnis, damit die Regel nicht ein zweites Mal buchstabiert
 * wird. Die UI-Fassung derselben Regel steht heute noch separat in
 * `ui/dmaic-tiles.js:_canAdd`; sie zusammenzuziehen ist ein eigener Durchgang
 * (Roadmap: „Ein Ort für Modul-Vorbedingungen").
 *
 * @param {object|null|undefined} def  normalisierte Moduldefinition
 * @returns {boolean}
 */
export function isSingleton(def) {
  return def?.singleton === true;
}

/**
 * `whenToUse` eines Moduls: der eigene Schlüssel, sonst die vorhandene
 * Beschreibung (Spec §8 — 72 Module, zweisprachig, existiert schon).
 * @param {object} i18n
 * @param {string} id
 * @returns {string}
 */
function whenToUse(i18n, id) {
  const own = `modules.${id}.whenToUse`;
  if (i18n.exists?.(own)) return i18n.t(own);
  return i18n.t(`modules.${id}.description`);
}

/**
 * Der vollständige Modulkatalog — nicht phasenbeschränkt (Spec §3.1).
 * @param {{ moduleRegistry: object, i18n: object, registry: Record<string, object> }} deps
 * @returns {Array<{ id: string, name: string, whenToUse: string, available: boolean, phase: string }>}
 */
export function buildCatalog({ moduleRegistry, i18n, registry }) {
  const cycle = moduleRegistry.getActiveCycle();
  return moduleRegistry.getAll().map(def => ({
    id: def.id,
    name: i18n.t(`modules.${def.id}.name`),
    whenToUse: whenToUse(i18n, def.id),
    available: registry[def.id]?.available === true,
    phase: allowedPhasesFor(def, cycle)[0],
  }));
}

/**
 * Die flache Instanzliste über alle Phasen. Der Anzeigename ist der
 * umbenannte Tab-Name, sonst der i18n-Modulname — nie die rohe UUID.
 * @param {{ stateManager: object, i18n: object }} deps
 * @returns {Array<{ id: string, module: string, name: string, phase: string }>}
 */
export function buildInstanceList({ stateManager, i18n }) {
  const out = [];
  const phases = stateManager.get('phases') || {};
  for (const phaseId of Object.keys(phases)) {
    const items = stateManager.get(`phases.${phaseId}`) || [];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item?.instanceId) continue;
      out.push({
        id: item.instanceId,
        module: item.moduleId,
        name: item.customName || i18n.t(`modules.${item.moduleId}.name`),
        phase: phaseId,
      });
    }
  }
  return out;
}

/**
 * Die Momentaufnahme, gegen die `validateBatch` prüft. Einmal pro
 * `interact()`-Aufruf gebaut — der Prüfer darf nicht gegen einen Zustand
 * prüfen, der sich zwischen den Stufen verschiebt.
 *
 * `phases` kommt aus den Phasen-IDs des AKTIVEN ZYKLUS
 * (`getAllPhaseIds`), nicht aus den bislang befüllten Schlüsseln des
 * Projektzustands — ein frisches oder teilweise leeres Projekt kennt sonst
 * Phasen nicht, in denen noch keine Instanz liegt, und jede Aktion mit
 * dieser `phase` würde fälschlich mit `unknown_phase` abgelehnt.
 *
 * @param {{ moduleRegistry: object, stateManager: object, i18n: object,
 *           registry: Record<string, object>, completed?: boolean }} deps
 * @returns {{ t: Function, phases: string[], modules: Map, instances: Map, completed: boolean }}
 */
export function buildWorld({ moduleRegistry, stateManager, i18n, registry, completed }) {
  const cycle = moduleRegistry.getActiveCycle();
  const modules = new Map();
  for (const def of moduleRegistry.getAll()) {
    const entry = registry[def.id];
    const available = entry?.available === true;
    modules.set(def.id, {
      available,
      // null heißt „nicht freigegeben" — der Prüfer antwortet dann mit
      // module_not_agent_ready statt mit einer leeren Methodenliste.
      methods: available ? Object.keys(entry.actions) : null,
      allowedPhases: allowedPhasesFor(def, cycle),
      singleton: isSingleton(def),
    });
  }

  const instances = new Map();
  for (const item of buildInstanceList({ stateManager, i18n })) {
    instances.set(item.id, { module: item.module, phase: item.phase });
  }

  return {
    t: (key, params) => i18n.t(key, params),
    phases: getAllPhaseIds(cycle),
    modules,
    instances,
    // Der schreibgeschützte Projektzustand gehört in die Momentaufnahme, gegen
    // die geprüft wird — nicht erst in die Laufzeit. Sonst meldet ein Stapel
    // den Fehler an der dritten Aktion, nachdem die ersten zwei schon
    // gelaufen sind; Spec §5 verlangt aber „nichts ausgeführt".
    completed: completed === true,
  };
}

/**
 * Die Werkzeugbeschreibung eines Moduls (Spec §7: ein `op`, zwei Tiefen).
 * Ohne `sections` kommen Aktionen, Felder und die LISTE der
 * Handbuchabschnitte; mit `sections: ['overview']` zusätzlich die Prosa.
 *
 * Das Handbuch ist lang — es als Ganzes in jedes `module.describe` zu legen
 * wäre Verschwendung. Das `{{term:…}}`-Markup der Blöcke bleibt unangetastet
 * (Spec §12).
 *
 * @param {{ moduleRegistry: object, i18n: object, registry: Record<string, object>,
 *           getHelp: (id: string) => Promise<object|null> }} deps
 * @param {string} moduleId
 * @param {string[]} [sections]
 * @returns {Promise<object>} die Beschreibung, oder ein AXI-Fehler
 */
export async function describeModule({ moduleRegistry, i18n, registry, getHelp }, moduleId, sections) {
  const def = moduleRegistry.get(moduleId);
  const entry = registry[moduleId] ?? { available: false, actions: {}, fields: {} };
  const help = await getHelp(moduleId);
  const lang = i18n.getLanguage();

  const sectionIds = help?.sections ? Object.keys(help.sections) : [];
  const sectionList = sectionIds.map(id => ({
    id,
    title: help.sections[id]?.[lang]?.title ?? help.sections[id]?.en?.title ?? id,
  }));

  let prose = null;
  if (Array.isArray(sections) && sections.length > 0) {
    const unknown = sections.find(id => !sectionIds.includes(id));
    if (unknown !== undefined) {
      return axiError(ERRORS.UNKNOWN_SECTION,
        i18n.t('agent.errors.unknownSection', { module: moduleId, section: unknown }),
        { available: sectionIds });
    }
    prose = {};
    for (const id of sections) {
      prose[id] = help.sections[id]?.[lang] ?? help.sections[id]?.en ?? null;
    }
  }

  return {
    module: moduleId,
    name: i18n.t(`modules.${moduleId}.name`),
    whenToUse: whenToUse(i18n, moduleId),
    available: entry.available === true,
    phase: def ? allowedPhasesFor(def, moduleRegistry.getActiveCycle())[0] : VIRTUAL_PHASES.extras.id,
    actions: Object.entries(entry.actions).map(([name, action]) => ({
      name,
      // i18n hat Vorrang; die JSDoc-Prosa ist nur der Rückfall (Spec §8).
      // Die Schlüssel sind `…actions.<name>.help` und
      // `…actions.<name>.params.<param>` — NICHT `…actions.<name>` plus
      // `…actions.<name>.<param>`: in verschachteltem JSON kann ein String
      // keine Kinder haben, und `i18n._resolve` läuft Segment für Segment.
      help: contextHelp(i18n, moduleId, `actions.${name}.help`, action.help),
      returns: action.returns,
      params: action.params.map(p => ({
        name: p.name,
        type: p.type,
        optional: p.optional,
        help: contextHelp(i18n, moduleId, `actions.${name}.params.${p.name}`, p.help),
      })),
    })),
    fields: Object.entries(entry.fields).map(([name, field]) => ({
      name,
      type: field.type,
      bulk: field.bulk === true,
      // `derived` sagt dem Agenten, woher die Lesefläche kommt: false heißt
      // „das ist die persistierte Model-Form" (Spec §8), true heißt „das Modul
      // hat sie erklärt, weil seine persistierte Form als Lesefläche nutzlos
      // oder zu groß wäre" (AgentRead-Typedef, z. B. worksheet). Ohne dieses
      // Durchreichen erzeugt der Extraktor die Marke und niemand sieht sie.
      derived: field.derived === true,
      help: contextHelp(i18n, moduleId, `fields.${name}`, field.help),
    })),
    sections: sectionList,
    prose,
  };
}

/**
 * Kontexthilfe: derselbe i18n-Schlüssel speist die Agentenbeschreibung und
 * die Detailhilfe in der UI (Spec §8, „Single Source of Truth in beide
 * Richtungen").
 *
 * Reihenfolge: Modulschlüssel → geteilter Schlüssel → JSDoc-Prosa.
 *
 * Der geteilte Schlüssel (`agent.shared.<suffix>`) gehört zum geteilten
 * `read()` aus `agent-read-mixin.js`: das Mixin zentralisiert den Code, nicht
 * den Text — ohne diesen Rückfall müsste jedes der 72 Module denselben
 * `actions.read.help` und `actions.read.params.options` in beide
 * Sprachdateien kopieren. Modulspezifische Schlüssel gewinnen weiterhin, wo
 * es sie gibt; fehlt beides, greift die JSDoc-Prosa — fehlende Kontexthilfe
 * ist erlaubt und blockiert nicht (Spec §8 Regel 1).
 * @returns {string}
 */
function contextHelp(i18n, moduleId, suffix, fallback) {
  const key = `modules.${moduleId}.agent.${suffix}`;
  if (i18n.exists?.(key)) return i18n.t(key);
  const shared = `agent.shared.${suffix}`;
  if (i18n.exists?.(shared)) return i18n.t(shared);
  return fallback ?? '';
}
