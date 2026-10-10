/**
 * D.Mike — Agentenvertrag (agent-contract.js)
 *
 * Die eine Stelle, an der die Hülle der Agentenfläche steht: Vertragsversion,
 * Fehlercodes, Aktionskatalog. Keine Logik, keine Abhängigkeiten — Stufe 2
 * (App als eigener Harness) bindet dieselbe Datei an einen HTTP-Client.
 *
 * Shape-Grammatik der Ergebnisformen (geschlossen, absichtlich armselig —
 * sie existiert nur, damit Prüfstufe 4 aus Spec §5 statisch sein kann):
 *   'string' | 'number' | 'boolean' | 'any'
 *   { key: <shape>, … }   Objekt mit genau diesen Schlüsseln
 *   [ <shape> ]           Array; Pfadsegmente müssen Ziffernfolgen sein
 */

/** Version der Fläche. Bump nur bei Bruch der Hülle. Siehe Plan §Constraints. */
export const CONTRACT_VERSION = 1;

/**
 * Alle Fehlercodes der Fläche. Werte sind Teil des Vertrags.
 *
 * Ein NEUER Code ist kein Bruch der Hülle und löst daher KEINEN
 * `CONTRACT_VERSION`-Bump aus — genauso wie ein neues `op`. Gebumpt wird nur,
 * wenn sich Aktionsform, Referenzsyntax, Fehler*form* oder Ergebnis-Hülle
 * ändern. Invariante (ein Test prüft sie): `ERRORS[k] === k.toLowerCase()`.
 */
export const ERRORS = Object.freeze({
  CONSENT_DENIED:         'consent_denied',
  NOT_CONNECTED:          'not_connected',
  UNKNOWN_OP:             'unknown_op',
  UNKNOWN_MODULE:         'unknown_module',
  UNKNOWN_PHASE:          'unknown_phase',
  UNKNOWN_INSTANCE:       'unknown_instance',
  UNKNOWN_METHOD:         'unknown_method',
  UNKNOWN_FIELD:          'unknown_field',
  UNKNOWN_SECTION:        'unknown_section',
  MISSING_PARAM:          'missing_param',
  UNKNOWN_PARAM:          'unknown_param',
  WRONG_TYPE:             'wrong_type',
  DUPLICATE_ID:           'duplicate_id',
  MISSING_OP:             'missing_op',
  BAD_SHAPE:              'bad_shape',
  FORWARD_REF:            'forward_ref',
  UNRESOLVED_REF:         'unresolved_ref',
  MODULE_NOT_AGENT_READY: 'module_not_agent_ready',
  MODULE_SINGLETON:       'module_singleton',
  PROJECT_COMPLETED:      'project_completed',
  VALIDATION_FAILED:      'validation_failed',
  CALL_FAILED:            'call_failed',
  OP_FAILED:              'op_failed',
  SURFACE_FAILED:         'surface_failed',
});

/** Ein Katalogeintrag des Modulkatalogs (catalog.read, project.read). */
const MODULE_ENTRY = { id: 'string', name: 'string', whenToUse: 'string', available: 'boolean', phase: 'string' };

/** Ein Instanzeintrag der flachen Instanzliste. */
const INSTANCE_ENTRY = { id: 'string', module: 'string', name: 'string', phase: 'string' };

/** Die angezeigte Ansicht. Zur Laufzeit null, wenn kein Modul offen ist. */
const VIEW = { instanceId: 'string', module: 'string', phase: 'string' };

/**
 * Deep-freeze eines Objekts rekursiv.
 * @param {any} obj
 * @returns {any} das gefrorene Objekt
 * @private
 */
function deepFreeze(obj) {
  Object.freeze(obj);
  if (obj && typeof obj === 'object') {
    Object.getOwnPropertyNames(obj).forEach(name => {
      if (obj[name] !== null && (typeof obj[name] === 'object' || typeof obj[name] === 'function')) {
        deepFreeze(obj[name]);
      }
    });
  }
  return obj;
}

/**
 * Der Aktionskatalog. `params` beschreibt Pflicht- und Kürformen,
 * `result` die deklarierte Ergebnisform (Shape-Grammatik oben).
 * Unbekannte Felder in einem Aktionsobjekt sind ein Fehler — deshalb ist
 * diese Tabelle die vollständige Wahrheit über erlaubte Felder.
 */
export const OPS = deepFreeze({
  'project.read': {
    params: {},
    result: {
      contract: 'number', appVersion: 'string', language: 'string',
      view: VIEW, instances: [INSTANCE_ENTRY],
    },
  },
  'catalog.read': {
    params: {},
    result: { contract: 'number', modules: [MODULE_ENTRY] },
  },
  'module.describe': {
    params: {
      module:   { type: 'string', required: true },
      sections: { type: 'array',  required: false },
    },
    result: {
      module: 'string', name: 'string', whenToUse: 'string', available: 'boolean', phase: 'string',
      actions: [{ name: 'string', help: 'string', returns: 'string',
                  params: [{ name: 'string', type: 'string', optional: 'boolean', help: 'string' }] }],
      fields:  [{ name: 'string', type: 'string', help: 'string', bulk: 'boolean',
                  derived: 'boolean' }],
      sections: [{ id: 'string', title: 'string' }],
      prose: 'any',
    },
  },
  'module.add': {
    params: {
      module: { type: 'string', required: true },
      phase:  { type: 'string', required: false },
    },
    result: { instanceId: 'string', module: 'string', phase: 'string' },
  },
  'module.remove': {
    params: { instance: { type: 'string', required: true } },
    result: { instanceId: 'string', removed: 'boolean' },
  },
  'instance.open': {
    params: { instance: { type: 'string', required: true } },
    result: { instanceId: 'string', module: 'string', phase: 'string' },
  },
  'instance.call': {
    params: {
      instance: { type: 'string', required: true },
      method:   { type: 'string', required: true },
      args:     { type: 'array',  required: false },
    },
    result: { instanceId: 'string', method: 'string', value: 'any' },
  },
});

/**
 * Form eines Eintrags in `agent-registry.generated.js` (Task 5 erzeugt sie).
 * @typedef {object} AgentModuleEntry
 * @property {boolean} tagged         Modul-Tag `@agent` am Modulkopf vorhanden
 * @property {boolean} available      tagged && keine Verstöße
 * @property {string[]} violations    harte Verstöße (leer, wenn available)
 * @property {string[]} reported      alle Befunde, auch die ohne Modul-Tag
 * @property {Record<string, { params: Array<{name:string,type:string,optional:boolean,help:string}>,
 *                             returns: string, help: string }>} actions
 * @property {Record<string, { type: string, help: string, bulk: boolean,
 *                             bulkKind?: 'table'|'tree', derived?: boolean }>} fields
 *   Die Lesefläche. Ohne `derived` aus den Model-Feldern abgeleitet (die
 *   persistierte Form IST die Lesefläche, Spec §8); mit `derived: true` vom
 *   Modul über einen `@typedef {object} AgentRead` deklariert, weil seine
 *   Lesefläche nicht die persistierte Form ist.
 *   `bulkKind` steht NUR an einem Massenfeld und sagt, welchen
 *   Umfangs-Deskriptor es bekommt: `'table'` → `rowCount` + `columns`,
 *   `'tree'` → `nodeCount` + `depth`. Fehlt es an einem Massenfeld, gilt
 *   `'table'`. Die Menge ist durchgesetzt, nicht nur zugesichert: eine andere
 *   Art ist ein Verstoß des Moduls (`invalid_bulk_kind:<feld>:<wert>`,
 *   `tools/build/agent-data.mjs`) und das Modul damit nicht freigegeben. `describe()` gibt es nicht heraus — die Deskriptorform steht
 *   in der Antwort von `read()`, und `describe()` ist Vertragsfläche.
 */
