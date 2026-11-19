/**
 * D.Mike — TRIZ-Funktionsanalyse: Model.
 *
 * Komponenten (genau ein Zielobjekt), ungeordnete Paare, die zusammenwirken
 * (`interactions`) oder ausdrücklich nicht (`exclusions`), gerichtete
 * Funktionen und die Lagen im Funktionsmodell. Ohne DOM, ohne i18n.
 *
 * Gespeichert: `{ _schema, components, interactions, exclusions, functions,
 * positions, labels, showRanks, activeTab }`. Paare stehen sortiert (`a < b`).
 * Dass Paare und Funktionsenden auf vorhandene Komponenten zeigen, sichern die
 * Invarianten — beim Laden repariert, beim Schreiben abgelehnt. Rang, offene
 * Paare, Nachteile und Wert & Kosten sind Ableitungen.
 */
import {
  defineModel, command, list, object, map, text, number, oneOf, idOf, boolean,
} from '../../../core/model.js';
import { requireForm } from '../../../core/validate.js';
import { uid } from '../../../core/uid.js';
import { from0 } from './migrations.js';
import {
  LEVELS, pairKey, isComplete, functionRanks, valueCostRows,
  openPairs as listOpenPairs, disadvantages as listDisadvantages,
} from './analysis.js';

/**
 * Ein angekreuztes Paar ohne Funktion.
 * @typedef {object} OpenPair
 * @property {string} a  id of the first component (a < b)
 * @property {string} b  id of the second component
 */

/**
 * Rang einer nützlichen, vollständigen Funktion.
 * @typedef {object} FunctionRank
 * @property {string} functionId  id of the function
 * @property {'basic'|'additional'|'auxiliary'} rank  basic on the target, additional on a supersystem element, auxiliary on a system component
 * @property {number|null} level  for auxiliary functions the distance to a basic or additional function (1 = Ax1), else null
 */

/**
 * Ein funktionaler Nachteil.
 * @typedef {object} Disadvantage
 * @property {string} functionId  id of the function
 * @property {string} carrier  name of the carrier
 * @property {string} verb  verb of the function
 * @property {string} object  name of the object
 * @property {string} parameter  parameter of the object the function changes
 * @property {'harmful'|'insufficient'|'excessive'} kind  kind of disadvantage
 */

/**
 * Eine Zeile der Wert-&-Kosten-Analyse (nur Systemkomponenten).
 * @typedef {object} ValueCostRow
 * @property {string} id  id of the component
 * @property {string} name  name of the component
 * @property {number} value  function value: 3/2/1 per basic/additional/auxiliary function it carries
 * @property {number} normValue  value normalised to 0…10 against the largest value
 * @property {number|null} cost  cost in euro, null without one
 * @property {number|null} normCost  cost normalised to 0…10 against the largest cost, null without one
 */

/** @param {string[]} ids @returns {boolean} keine leer, keine doppelt */
function distinctIds(ids) {
  return ids.every((id) => id !== '') && new Set(ids).size === ids.length;
}

/**
 * Leere ids und spätere Doppelte entfallen, die erste bleibt.
 * @template {{ id: string }} T @param {T[]} items @returns {T[]}
 */
function dropBadIds(items) {
  const seen = new Set();
  return items.filter((x) => {
    if (x.id === '' || seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
}

/**
 * Einträge einer Lage-Map, deren Schlüssel keine bekannte id ist, entfallen.
 * @param {Record<string, any>} places @param {Set<string>} known @returns {void}
 */
function dropUnknownPlaces(places, known) {
  for (const id of Object.keys(places)) if (!known.has(id)) delete places[id];
}

/**
 * Paarliste in Normalform: bekannte, verschiedene ids, sortiert, ohne Doppelte,
 * ohne Paare aus `skip`.
 * @param {Array<{ a: string, b: string }>} pairs @param {Set<string>} known @param {Set<string>} [skip]
 * @returns {Array<{ a: string, b: string }>}
 */
function normalPairs(pairs, known, skip = new Set()) {
  const seen = new Set(skip);
  const out = [];
  for (const { a, b } of pairs) {
    if (!known.has(a) || !known.has(b) || a === b) continue;
    const key = pairKey(a, b);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a < b ? { a, b } : { a: b, b: a });
  }
  return out;
}

/**
 * Paarliste ist in Normalform (siehe `normalPairs`).
 * @param {Array<{ a: string, b: string }>} pairs @param {Set<string>} known @param {Set<string>} [skip]
 * @returns {boolean}
 */
function isNormal(pairs, known, skip = new Set()) {
  const seen = new Set(skip);
  return pairs.every(({ a, b }) => {
    const key = pairKey(a, b);
    if (!known.has(a) || !known.has(b) || !(a < b) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** @param {{ components: ReadonlyArray<{ id: string }> }} m @returns {Set<string>} */
const componentIds = (m) => new Set(m.components.map((c) => c.id));

/** @param {Array<{ a: string, b: string }>} pairs @returns {Set<string>} */
const pairKeys = (pairs) => new Set(pairs.map((p) => pairKey(p.a, p.b)));

/**
 * Wie stark eine Komponente genutzt wird: angekreuzte Paare und Funktionen,
 * die sie als Träger oder Objekt haben.
 * @param {{ interactions: ReadonlyArray<{ a: string, b: string }>, functions: ReadonlyArray<{ carrier: string, object: string }> }} model
 * @param {string} id
 * @returns {{ interactions: number, functions: number }}
 */
export function impactOf(model, id) {
  return {
    interactions: model.interactions.filter((i) => i.a === id || i.b === id).length,
    functions: model.functions.filter((f) => f.carrier === id || f.object === id).length,
  };
}

export class State extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    components: list(object({
      id: text(),
      name: text(),
      kind: oneOf(['target', 'system', 'supersystem']),
      note: text(),
      cost: number({ nullable: true, min: 0 }),
    })),
    interactions: list(object({ a: text(), b: text() })),
    exclusions: list(object({ a: text(), b: text() })),
    functions: list(object({
      id: text(),
      carrier: text(),
      verb: text(),
      object: text(),
      parameter: text(),
      type: oneOf(['useful', 'harmful']),
      level: oneOf(['adequate', 'insufficient', 'excessive'], { nullable: true }),
      note: text(),
    })),
    positions: map(idOf('components'), object({ x: number({ min: 0 }), y: number({ min: 0 }) })),
    labels: map(idOf('functions'), object({ x: number({ min: 0 }), y: number({ min: 0 }) })),
    showRanks: boolean(),
  },
  view: {
    activeTab: oneOf(['components', 'interactions', 'model', 'valueCost']),
  },
  invariants: {
    uniqueComponentIds: {
      fields: ['components', 'positions'],
      test(m) {
        const ids = m.components.map((c) => c.id);
        const known = new Set(ids);
        return distinctIds(ids) && Object.keys(m.positions).every((id) => known.has(id));
      },
      repair(m) {
        m._v.components = dropBadIds(m._v.components);
        dropUnknownPlaces(m._v.positions, componentIds(m._v));
      },
    },
    singleTarget: {
      fields: ['components'],
      test(m) {
        return m.components.filter((c) => c.kind === 'target').length <= 1;
      },
      repair(m) {
        let seen = false;
        for (const c of m._v.components) {
          if (c.kind !== 'target') continue;
          if (seen) c.kind = 'system';
          seen = true;
        }
      },
    },
    validPairs: {
      fields: ['interactions', 'exclusions', 'components'],
      test(m) {
        const known = componentIds(m);
        return isNormal(m.interactions, known) && isNormal(m.exclusions, known, pairKeys(m.interactions));
      },
      repair(m) {
        const known = componentIds(m._v);
        m._v.interactions = normalPairs(m._v.interactions, known);
        m._v.exclusions = normalPairs(m._v.exclusions, known, pairKeys(m._v.interactions));
      },
    },
    uniqueFunctionIds: {
      fields: ['functions', 'labels'],
      test(m) {
        const ids = m.functions.map((f) => f.id);
        const known = new Set(ids);
        return distinctIds(ids) && Object.keys(m.labels).every((id) => known.has(id));
      },
      repair(m) {
        m._v.functions = dropBadIds(m._v.functions);
        dropUnknownPlaces(m._v.labels, new Set(m._v.functions.map((f) => f.id)));
      },
    },
    functionEnds: {
      fields: ['functions', 'components'],
      test(m) {
        const known = componentIds(m);
        const end = (id) => id === '' || known.has(id);
        return m.functions.every((f) => end(f.carrier) && end(f.object) && !(f.carrier && f.carrier === f.object));
      },
      repair(m) {
        const known = componentIds(m._v);
        for (const f of m._v.functions) {
          if (!known.has(f.carrier)) f.carrier = '';
          if (!known.has(f.object)) f.object = '';
          if (f.carrier && f.carrier === f.object) f.object = '';
        }
      },
    },
    levelByType: {
      fields: ['functions'],
      test(m) {
        return m.functions.every((f) => (f.type === 'harmful' ? f.level === null : LEVELS.includes(f.level)));
      },
      repair(m) {
        for (const f of m._v.functions) {
          if (f.type === 'harmful') f.level = null;
          else if (!LEVELS.includes(f.level)) f.level = 'adequate';
        }
      },
    },
  },
  commands: {
    addComponent: command({
      params: { kind: oneOf(['target', 'system', 'supersystem']), name: text({ optional: true }) },
      returns: text(),
      run({ kind, name = '' }) {
        requireForm('kind', kind, kind !== 'target' || !this.components.some((c) => c.kind === 'target'),
          'system or supersystem while a target exists (turn the target into a system component first)');
        const id = uid();
        this.components.push({ id, name, kind, note: '', cost: null });
        return id;
      },
    }),
    setComponentKind: command({
      params: { id: idOf('components'), kind: oneOf(['target', 'system', 'supersystem']) },
      returns: text({ nullable: true }),
      run({ id, kind }) {
        const c = this.components.find((x) => x.id === id);
        if (c.kind === kind) return null;
        let demoted = null;
        if (kind === 'target') {
          demoted = this.components.find((x) => x.kind === 'target') ?? null;
          if (demoted) demoted.kind = 'system';
        }
        c.kind = kind;
        return demoted ? demoted.id : null;
      },
    }),
    removeComponent: command({
      params: { id: idOf('components') },
      confirm({ id }) {
        const name = this.components.find((c) => c.id === id).name.trim();
        const count = impactOf(this, id).functions;
        if (!name) return { key: count ? 'confirm.deleteUsedUnnamed' : 'confirm.deleteUnnamed', params: { count } };
        return { key: count ? 'confirm.deleteUsed' : 'confirm.delete', params: { name, count } };
      },
      run({ id }) {
        this._removeComponentCascade(id);
      },
    }),
    discardComponentIfEmpty: command({
      params: { id: idOf('components') },
      returns: boolean(),
      run({ id }) {
        if (this.components.find((c) => c.id === id).name.trim()) return false;
        const use = impactOf(this, id);
        if (use.functions > 0 || use.interactions > 0) return false;
        this._removeComponentCascade(id);
        return true;
      },
    }),
    setPairState: command({
      params: {
        a: idOf('components'),
        b: idOf('components'),
        state: oneOf(['none', 'ticked', 'excluded']),
      },
      run({ a, b, state }) {
        requireForm('b', b, a !== b, 'a component other than a');
        const key = pairKey(a, b);
        const ticked = this.interactions.some((i) => pairKey(i.a, i.b) === key);
        if (ticked && state !== 'ticked') {
          const usedBy = this.functions.filter((f) => isComplete(f) && pairKey(f.carrier, f.object) === key).length;
          requireForm('state', state, usedBy === 0, `ticked while ${usedBy} function(s) use the pair (remove them first)`);
        }
        const sorted = a < b ? { a, b } : { a: b, b: a };
        this.interactions = this.interactions.filter((i) => pairKey(i.a, i.b) !== key);
        this.exclusions = this.exclusions.filter((x) => pairKey(x.a, x.b) !== key);
        if (state === 'ticked') this.interactions.push(sorted);
        if (state === 'excluded') this.exclusions.push(sorted);
      },
    }),
    addFunction: command({
      params: { carrier: idOf('components'), object: idOf('components') },
      returns: text(),
      run({ carrier, object }) {
        requireForm('object', object, carrier !== object, 'a component other than carrier');
        const id = uid();
        this.functions.push({
          id, carrier, verb: '', object, parameter: '', type: 'useful', level: 'adequate', note: '',
        });
        const key = pairKey(carrier, object);
        this.exclusions = this.exclusions.filter((x) => pairKey(x.a, x.b) !== key);
        if (!this.interactions.some((i) => pairKey(i.a, i.b) === key)) {
          this.interactions.push(carrier < object ? { a: carrier, b: object } : { a: object, b: carrier });
        }
        return id;
      },
    }),
    swapDirection: command({
      params: { id: idOf('functions') },
      run({ id }) {
        const f = this.functions.find((x) => x.id === id);
        [f.carrier, f.object] = [f.object, f.carrier];
      },
    }),
    setFunctionType: command({
      params: { id: idOf('functions'), type: oneOf(['useful', 'harmful']) },
      run({ id, type }) {
        const f = this.functions.find((x) => x.id === id);
        if (f.type === type) return;
        f.type = type;
        f.level = type === 'harmful' ? null : 'adequate';
      },
    }),
    setFunctionLevel: command({
      params: { id: idOf('functions'), level: oneOf(['adequate', 'insufficient', 'excessive']) },
      run({ id, level }) {
        const f = this.functions.find((x) => x.id === id);
        requireForm('level', level, f.type === 'useful', 'no level: a harmful function has none (make it useful first)');
        f.level = level;
      },
    }),
    removeFunction: command({
      params: { id: idOf('functions') },
      run({ id }) {
        this.functions = this.functions.filter((f) => f.id !== id);
        delete this.labels[id];
      },
    }),
    moveComponent: command({
      params: { id: idOf('components'), x: number({ min: 0 }), y: number({ min: 0 }) },
      run({ id, x, y }) {
        this.positions[id] = { x: Math.round(x), y: Math.round(y) };
      },
    }),
    moveLabel: command({
      params: { id: idOf('functions'), x: number({ min: 0 }), y: number({ min: 0 }) },
      run({ id, x, y }) {
        this.labels[id] = { x: Math.round(x), y: Math.round(y) };
      },
    }),
    resetLayout: command({
      run() {
        this.positions = {};
        this.labels = {};
      },
    }),
  },
  derived: {
    /**
     * Angekreuzte Paare, die keine vollständige Funktion nutzt (in keiner Richtung).
     * @this {import('./model.types.js').StateModel}
     * @returns {OpenPair[]}
     */
    openPairs() { return listOpenPairs(this); },
    /**
     * Rang jeder nützlichen, vollständigen Funktion, Hilfsfunktionen mit ihrer Stufe.
     * @this {import('./model.types.js').StateModel}
     * @returns {FunctionRank[]}
     */
    ranks() {
      return [...functionRanks(this)].map(([functionId, r]) => ({ functionId, rank: r.rank, level: r.level }));
    },
    /**
     * Funktionale Nachteile: schädliche, unzureichende und übermäßige Funktionen.
     * @this {import('./model.types.js').StateModel}
     * @returns {Disadvantage[]}
     */
    disadvantages() { return listDisadvantages(this); },
    /**
     * Wert & Kosten der Systemkomponenten in Eingabereihenfolge.
     * @this {import('./model.types.js').StateModel}
     * @returns {ValueCostRow[]}
     */
    valueCost() { return valueCostRows(this); },
  },
}) {
  /**
   * Gibt es Komponenten oder Funktionen (für die Rückfrage beim Laden eines Beispiels)?
   * @returns {boolean}
   */
  hasContent() {
    return this.components.length > 0 || this.functions.length > 0;
  }

  /**
   * Eine Komponente samt Paaren, Ausschlüssen, Funktionen und Lagen entfernen.
   * Nur aus `run` eines Kommandos rufen.
   * @param {string} id
   * @returns {void}
   */
  _removeComponentCascade(id) {
    const gone = this.functions.filter((f) => f.carrier === id || f.object === id).map((f) => f.id);
    this.components = this.components.filter((c) => c.id !== id);
    this.interactions = this.interactions.filter((i) => i.a !== id && i.b !== id);
    this.exclusions = this.exclusions.filter((x) => x.a !== id && x.b !== id);
    this.functions = this.functions.filter((f) => f.carrier !== id && f.object !== id);
    for (const fid of gone) delete this.labels[fid];
    delete this.positions[id];
  }
}

