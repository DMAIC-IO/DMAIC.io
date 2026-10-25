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
 *   { key: <shape>, … }      Objekt mit genau diesen Schlüsseln
 *   [ <shape> ]              Array; Pfadsegmente müssen Ziffernfolgen sein
 *   { $nullable: <shape> }   zur Laufzeit diese Form ODER null
 *
 * Die Nullable-Form ist keine Bequemlichkeit: ohne sie ließ Stufe 4
 * `path: 'view.module'` passieren, und der Aufruf scheiterte zur Laufzeit als
 * `unresolved_ref` — ein Fehler, den der statische Prüfer hätte fangen können.
 * Ein Abstieg DURCH die Form ist deshalb abgelehnt, die Form selbst ist ein
 * gültiges Referenzziel (`agent-shape.js`).
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
  UNKNOWN_OP:             'unknown_op',
  UNKNOWN_MODULE:         'unknown_module',
  UNKNOWN_PHASE:          'unknown_phase',
  UNKNOWN_INSTANCE:       'unknown_instance',
  UNKNOWN_METHOD:         'unknown_method',
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
  FLUSH_FAILED:           'flush_failed',
});

/** Ein Katalogeintrag des Modulkatalogs (catalog.read, project.read). */
const MODULE_ENTRY = { id: 'string', name: 'string', whenToUse: 'string', available: 'boolean', phase: 'string' };

/** Ein Instanzeintrag der flachen Instanzliste. */
const INSTANCE_ENTRY = { id: 'string', module: 'string', name: 'string', phase: 'string' };

/**
 * Die angezeigte Ansicht. Zur Laufzeit null, wenn kein Modul offen ist — und
 * das steht jetzt in der Grammatik, nicht nur in diesem Satz, damit Stufe 4
 * einen Abstieg nach `view.module` ablehnen kann statt ihn zur Laufzeit
 * scheitern zu lassen.
 */
const VIEW = { $nullable: { instanceId: 'string', module: 'string', phase: 'string' } };

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
 * Ein erklärter Schlüssel in `module.describe`: ein Setter-Schlüssel
 * (`setParam`) oder eine Kennzahl eines Lesefelds (`result.Cg`). `keys` ist
 * die nächste Ebene (`biasTest.p`) und sonst leer; die Grammatik kennt keine
 * Rekursion, darum `any` eine Ebene tiefer.
 */
const DESCRIBED_KEY = { name: 'string', type: 'string', help: 'string', optional: 'boolean', keys: 'any' };

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
                  params: [{ name: 'string', type: 'string', optional: 'boolean', help: 'string' }],
                  keys: [DESCRIBED_KEY] }],
      fields:  [{ name: 'string', type: 'string', help: 'string', bulk: 'boolean',
                  derived: 'boolean', keys: [DESCRIBED_KEY] }],
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
 * Eine Property einer Typedef der Moduldatei — Setter-Schlüssel oder
 * Kennzahl eines Ergebnisses. `keysOf`/`keys` nur, wenn die Property selbst
 * vom Typ einer Typedef der Datei ist. Der i18n-Satz steht unter
 * `modules.<id>.types.<keysOf des Elternknotens>.<property>`.
 * @typedef {object} AgentTypedefKey
 * @property {string} type
 * @property {string} help
 * @property {true} [optional]  nur gesetzt, wenn die Property als `[name]` erklärt ist
 * @property {string} [keysOf]
 * @property {Record<string, AgentTypedefKey>} [keys]
 */

/**
 * Form eines Eintrags in `agent-registry.generated.js` (Task 5 erzeugt sie).
 * @typedef {object} AgentModuleEntry
 * @property {boolean} tagged         Modul-Tag `@agent` am Modulkopf vorhanden
 * @property {boolean} available      tagged && keine Verstöße
 * @property {string[]} violations    harte Verstöße (leer, wenn available)
 * @property {string[]} reported      alle Befunde, auch die ohne Modul-Tag
 * @property {Record<string, { params: Array<{name:string,type:string,optional:boolean,help:string}>,
 *                             returns: string, help: string,
 *                             keysOf?: string, keys?: Record<string, AgentTypedefKey> }>} actions
 *   `keysOf`/`keys` stehen NUR an einem generischen Setter, dessen
 *   Schlüsselparameter `keyof <Typedef>` trägt: je Schlüssel der Wertetyp und
 *   die JSDoc-Prosa (`tools/build/agent-data.mjs:readKeySurface`).
 * @property {Record<string, { type: string, help: string, bulk: boolean,
 *                             bulkKind?: 'table'|'tree', omit?: string[], derived?: boolean,
 *                             keysOf?: string, keys?: Record<string, AgentTypedefKey> }>} fields
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
 *   `omit` steht NUR an einem Feld mit Auslassung (`@agentOmit` am
 *   Model-Feld, `[omit:…]` im Typedef) und nennt Pfade relativ zum Feld;
 *   `read()` liefert dort `{ $omitted: true, bytes }` statt des Werts. Wie
 *   `bulkKind` nicht in `describe()`.
 */
