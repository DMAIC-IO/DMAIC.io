/**
 * D.Mike — Prüfer der Agentenschicht (agent-validate.js)
 *
 * Der GESAMTE Stapel wird geprüft, bevor irgendein Seiteneffekt passiert
 * (Spec §5). Steht im letzten Eintrag ein nicht existierendes `op`, dürfen
 * die neun davor nicht ausgeführt werden — deshalb ist das hier eine reine
 * Funktion über den ganzen Stapel und keine Prüfung je Eintrag im Vollzug.
 *
 * Sechs Stufen, in dieser Reihenfolge:
 *   1. Form            — Array oder Einzelobjekt, jeder Eintrag hat `op`, `id` eindeutig
 *   2. op existiert    — gegen OPS
 *   3. Parameter       — Pflichtfelder, Typen, UNBEKANNTE FELDER SIND FEHLER
 *   4. Referenzgraph   — nur rückwärts, id existiert, UND der `path` existiert
 *                        in der deklarierten Ergebnisform der referenzierten Aktion
 *   5. Bezeichner      — module / phase / instance / method gegen die Welt
 *   6. Projektzustand  — im abgeschlossenen Projekt wird jede schreibende op
 *                        abgelehnt, bevor irgendetwas läuft
 *
 * Stufe 5 prüft eine angegebene Phase zweifach: zuerst, ob der aktive Zyklus
 * (`world.phases`) sie überhaupt kennt, dann — nur wenn ja — ob das
 * Zielmodul sie in seinen `allowedPhases` erlaubt. Beide Fälle melden
 * `ERRORS.UNKNOWN_PHASE` (der Vertrag kennt nur einen Code für Phasenfehler),
 * aber mit unterschiedlicher Meldung und unterschiedlichem `available`:
 * einmal die Phasen des Zyklus, einmal die des Moduls.
 *
 * Stufe 4 ist nur möglich, weil die Ergebnisformen zur Build-Zeit bekannt
 * sind (OPS in agent-contract.js).
 *
 * Rein: kein DOM, kein stateManager — die Momentaufnahme kommt als `world`.
 */
import { OPS, ERRORS } from './agent-contract.js';
import { pathExistsInShape } from './agent-shape.js';
import { collectRefs, isRef } from './agent-refs.js';
import { axiError } from './agent-errors.js';

/** Alle gültigen `op`-Namen, einmal berechnet. */
const OP_NAMES = Object.freeze(Object.keys(OPS));

/** Felder, die jedes Aktionsobjekt tragen darf, zusätzlich zu den op-Parametern. */
const UNIVERSAL_FIELDS = new Set(['id', 'op']);

/**
 * Die Aktionen, die OHNE Rücksicht auf ihre Parameter immer schreiben.
 *
 * `instance.call` gehört ABSICHTLICH NICHT dazu: `project.read`
 * (`agent-contract.js` `OPS['project.read'].result`) liefert nur
 * `{contract, appVersion, language, view, instances}` — Ids, Modul, Phase,
 * aber keine Feldwerte — und `module.describe` liefert das Feld-SCHEMA, nicht
 * die Daten. Das geteilte `read()` über `instance.call` ist der EINZIGE Weg
 * zu Feldwerten; ein pauschaler Block hätte jedes Auslesen aus genau den
 * Projekten entzogen, die ein Agent am ehesten zusammenfassen soll. Siehe
 * `CONDITIONAL_WRITE_OPS` unten für die feinere Regel.
 */
export const WRITE_OPS = new Set(['module.add', 'module.remove']);

/**
 * `instance.call` schreibt NUR, wenn die aufgerufene Methode nicht `read`
 * heißt. `'read'` ist dafür schon an zwei anderen Stellen ausgezeichnet
 * (`tools/build/agent-data.mjs:122-123`, `module_tag_without_actions` und
 * `no_read_action`) — diese Sonderbehandlung ist also bestehende Konvention,
 * keine neue Erfindung.
 *
 * Ein `read()`, der trotz seines Namens dennoch schriebe, wäre hier harmlos:
 * `stateManager.set` verwirft im abgeschlossenen Projekt jeden
 * Nicht-`settings.`-Schreibzugriff STILL (`state-manager.js:170`) — genau
 * dieselbe Verteidigung, auf die sich Stufe 6 unten als Letztes verlässt.
 */
export const CONDITIONAL_WRITE_OPS = new Set(['instance.call']);

/**
 * Die restlichen Aktionen — reine Leseoperationen, nie betroffen von Stufe 6.
 * Von Hand aufgezählt (nicht als Komplement von `OPS` berechnet): ein neuer,
 * unklassifizierter `op` muss den Vollständigkeits-Test unten ROT machen,
 * nicht lautlos als „lesend" durchrutschen.
 */
export const READ_OPS = new Set(['project.read', 'catalog.read', 'module.describe', 'instance.open']);

/**
 * @param {object|object[]} input  ein Aktionsobjekt oder ein Stapel
 * @param {object} world  { t, phases: string[], modules: Map, instances: Map, completed: boolean }
 * @returns {{ ok: true, actions: object[] }
 *          |{ ok: false, error: 'validation_failed', message: string,
 *             index: number|null, id: string|null, cause: object }}
 */
export function validateBatch(input, world) {
  const actions = Array.isArray(input) ? input : [input];
  const fail = (index, cause) => {
    const id = actions[index] && typeof actions[index] === 'object' ? (actions[index].id ?? null) : null;
    return {
      ok: false,
      error: ERRORS.VALIDATION_FAILED,
      message: id
        ? world.t('agent.errors.validationFailed', { index, id })
        : world.t('agent.errors.validationFailedNoId', { index }),
      index,
      id,
      cause,
    };
  };

  // ── Stufe 1: Form ────────────────────────────────────────────
  const seenIds = new Set();
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    if (!a || typeof a !== 'object' || Array.isArray(a)) {
      return fail(i, axiError(ERRORS.BAD_SHAPE, world.t('agent.errors.notAnAction', { index: i })));
    }
    if (typeof a.op !== 'string' || a.op.length === 0) {
      return fail(i, axiError(ERRORS.MISSING_OP, world.t('agent.errors.missingOp', { index: i }),
        { available: OP_NAMES }));
    }
    if (a.id !== undefined) {
      if (seenIds.has(a.id)) {
        return fail(i, axiError(ERRORS.DUPLICATE_ID, world.t('agent.errors.duplicateId', { id: a.id })));
      }
      seenIds.add(a.id);
    }
  }

  // ── Stufe 2: op existiert ────────────────────────────────────
  for (let i = 0; i < actions.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(OPS, actions[i].op)) {
      return fail(i, axiError(ERRORS.UNKNOWN_OP, world.t('agent.errors.unknownOp', { op: actions[i].op }),
        { available: OP_NAMES }));
    }
  }

  // ── Stufe 3: Parameter ──────────────────────────────────────
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    const spec = OPS[a.op];
    const allowed = Object.keys(spec.params);
    for (const [param, pspec] of Object.entries(spec.params)) {
      const value = a[param];
      if (value === undefined) {
        if (pspec.required) {
          return fail(i, axiError(ERRORS.MISSING_PARAM,
            world.t('agent.errors.missingParam', { op: a.op, param }), { available: allowed }));
        }
        continue;
      }
      // Eine Referenz steht für ihren späteren Wert — ihr Typ ist erst zur
      // Laufzeit bekannt. Dort holt `checkResolvedParamTypes` (unten) diese
      // Prüfung nach, direkt nach `resolveRefs` und vor der Op.
      if (isRef(value)) continue;
      if (!typeMatches(pspec.type, value)) {
        return fail(i, axiError(ERRORS.WRONG_TYPE,
          world.t('agent.errors.wrongType', { op: a.op, param, expected: pspec.type, actual: typeNameOf(value) })));
      }
    }
    for (const key of Object.keys(a)) {
      if (UNIVERSAL_FIELDS.has(key)) continue;
      if (!Object.prototype.hasOwnProperty.call(spec.params, key)) {
        return fail(i, axiError(ERRORS.UNKNOWN_PARAM,
          world.t('agent.errors.unknownParam', { op: a.op, param: key }), { available: allowed }));
      }
    }
  }

  // ── Stufe 4: Referenzgraph ──────────────────────────────────
  const idToIndex = new Map();
  for (let i = 0; i < actions.length; i++) {
    if (actions[i].id !== undefined) idToIndex.set(actions[i].id, i);
  }
  for (let i = 0; i < actions.length; i++) {
    for (const ref of collectRefs(actions[i])) {
      if (!idToIndex.has(ref.from)) {
        // Nur Ids VOR dieser Aktion sind gültige Rückwärtsreferenzen —
        // spätere Ids wären ohnehin ein `forward_ref`, nicht hilfreich als
        // "verfügbare" Alternative.
        return fail(i, axiError(ERRORS.UNRESOLVED_REF,
          world.t('agent.errors.unresolvedRef', { id: ref.from }),
          { available: [...idToIndex.entries()].filter(([, idx]) => idx < i).map(([id]) => id) }));
      }
      const target = idToIndex.get(ref.from);
      if (target >= i) {
        return fail(i, axiError(ERRORS.FORWARD_REF, world.t('agent.errors.forwardRef', { id: ref.from })));
      }
      const shape = OPS[actions[target].op].result;
      const check = pathExistsInShape(shape, ref.path);
      if (!check.ok) {
        return fail(i, axiError(ERRORS.BAD_SHAPE,
          world.t('agent.errors.badShape', { path: ref.path, id: ref.from, segment: check.segment }),
          { available: check.available }));
      }
    }
  }

  // ── Stufe 5: literale Bezeichner ────────────────────────────
  const moduleIds = [...world.modules.keys()];
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];

    if (typeof a.module === 'string' && !world.modules.has(a.module)) {
      return fail(i, axiError(ERRORS.UNKNOWN_MODULE,
        world.t('agent.errors.unknownModule', { module: a.module }), { available: moduleIds }));
    }

    if (typeof a.phase === 'string') {
      // Erst: kennt der aktive Zyklus diese Phase überhaupt?
      if (!world.phases.includes(a.phase)) {
        return fail(i, axiError(ERRORS.UNKNOWN_PHASE,
          world.t('agent.errors.unknownPhaseInCycle', { phase: a.phase }), { available: [...world.phases] }));
      }
      // Dann: darf das Zielmodul in diese (dem Zyklus bekannte) Phase?
      if (typeof a.module === 'string') {
        const allowed = world.modules.get(a.module).allowedPhases;
        if (!allowed.includes(a.phase)) {
          return fail(i, axiError(ERRORS.UNKNOWN_PHASE,
            world.t('agent.errors.unknownPhase', { phase: a.phase, module: a.module }), { available: allowed }));
        }
      }
    }

    // Ein `singleton`-Modul darf nur EINE Instanz haben. Die Regel steht in
    // der UI (`ui/dmaic-tiles.js:_canAdd`) und darf nicht nur dort stehen,
    // sonst kann der Agent etwas, was die UI verbietet (Spec §2). Hier im
    // Prüfer, weil dabei kein Seiteneffekt entsteht; `agent-ops.js` hat
    // dieselbe Prüfung nochmals als Verteidigung (zwei `module.add` im
    // SELBEN Stapel sieht diese Momentaufnahme nicht).
    if (a.op === 'module.add' && typeof a.module === 'string' && world.modules.get(a.module)?.singleton) {
      const existing = [...world.instances.entries()].find(([, i]) => i.module === a.module);
      if (existing) {
        return fail(i, axiError(ERRORS.MODULE_SINGLETON,
          world.t('agent.errors.moduleSingleton', { module: a.module, instance: existing[0] })));
      }
    }

    if (typeof a.instance === 'string' && !world.instances.has(a.instance)) {
      return fail(i, axiError(ERRORS.UNKNOWN_INSTANCE,
        world.t('agent.errors.unknownInstance', { instance: a.instance }),
        { available: [...world.instances.keys()] }));
    }

    if (a.op === 'instance.call') {
      // Das Zielmodul ist statisch bekannt, wenn `instance` literal ist ODER
      // auf das Ergebnis eines `module.add` mit literalem `module` zeigt.
      // Zeigt es in ein Leseergebnis hinein, bleibt nur die Laufzeitprüfung.
      const moduleId = staticTargetModule(a, actions, idToIndex, world);
      if (moduleId !== null) {
        const entry = world.modules.get(moduleId);
        if (!entry.available || entry.methods === null) {
          return fail(i, axiError(ERRORS.MODULE_NOT_AGENT_READY,
            world.t('agent.errors.moduleNotAgentReady', { module: moduleId })));
        }
        if (!entry.methods.includes(a.method)) {
          return fail(i, axiError(ERRORS.UNKNOWN_METHOD,
            world.t('agent.errors.unknownMethod', { module: moduleId, method: a.method }),
            { available: entry.methods }));
        }
      }
    }
  }

  // ── Stufe 6: abgeschlossenes Projekt ────────────────────────
  // Im abgeschlossenen Projekt verwirft `stateManager.set` jeden
  // Nicht-`settings.`-Schreibzugriff STILL. Die Laufzeitprüfungen in
  // agent-ops.js bleiben als Verteidigung, aber als PRÜFSTUFE verhindert das
  // hier, dass ein Stapel halb läuft und dann am Schreibschutz scheitert.
  if (world.completed) {
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      const isWrite = WRITE_OPS.has(a.op)
        || (CONDITIONAL_WRITE_OPS.has(a.op) && a.method !== 'read');
      if (!isWrite) continue;
      return fail(i, axiError(ERRORS.PROJECT_COMPLETED, world.t('agent.errors.projectCompleted')));
    }
  }

  return { ok: true, actions };
}

/**
 * Stufe 3 für AUFGELÖSTE Referenzen — die Nachprüfung, die den Kommentar in
 * Stufe 3 („ihr Typ wird zur Laufzeit geprüft") wahr macht.
 *
 * Stufe 3 überspringt den Typ-Check eines Parameters, der eine Referenz ist:
 * sein Wert entsteht erst im Vollzug. Ohne diese Funktion gäbe es die dort
 * versprochene Laufzeitprüfung NICHT, und ein referenzierter Wert käme
 * ungeprüft bei der Op an (Review-Befund C1 — ein beliebiger Anzeigename
 * landete als Phasen-Id im Projektzustand).
 *
 * Die Laufzeit ruft das nach `resolveRefs` für JEDE Aktion auf: Literale sind
 * bereits geprüft, eine zweite Prüfung kostet nichts und braucht keine
 * Buchführung darüber, welches Feld vorher eine Referenz war.
 *
 * @param {string} op  der Aktionsname (Schlüssel in OPS)
 * @param {object} value  das Aktionsobjekt NACH der Referenzauflösung
 * @param {(key: string, params?: object) => string} t
 * @returns {{ ok: false, error: string, message: string }|null} null, wenn alles passt
 */
export function checkResolvedParamTypes(op, value, t) {
  const spec = OPS[op];
  if (!spec) return null;
  for (const [param, pspec] of Object.entries(spec.params)) {
    const actual = value?.[param];
    if (actual === undefined) continue;
    if (!typeMatches(pspec.type, actual)) {
      return axiError(ERRORS.WRONG_TYPE,
        t('agent.errors.wrongType', { op, param, expected: pspec.type, actual: typeNameOf(actual) }));
    }
  }
  return null;
}

/**
 * Das statisch bestimmbare Zielmodul eines `instance.call`, oder null.
 * @returns {string|null}
 */
function staticTargetModule(action, actions, idToIndex, world) {
  const target = action.instance;
  if (typeof target === 'string') return world.instances.get(target)?.module ?? null;
  if (!isRef(target)) return null;
  const source = actions[idToIndex.get(target.$from)];
  if (!source || source.op !== 'module.add') return null;
  if (typeof source.module !== 'string') return null;
  // Nur der Pfad auf die neue Instanz-Id identifiziert das Modul.
  return target.path === 'instanceId' ? source.module : null;
}

/** @returns {boolean} ob `value` dem ParamSpec-Typ entspricht. */
function typeMatches(type, value) {
  switch (type) {
    case 'string':  return typeof value === 'string';
    case 'number':  return typeof value === 'number' && Number.isFinite(value);
    case 'boolean': return typeof value === 'boolean';
    case 'array':   return Array.isArray(value);
    case 'object':  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    default:        return false;
  }
}

/** @returns {string} der Typname eines Werts für die Fehlermeldung. */
function typeNameOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
