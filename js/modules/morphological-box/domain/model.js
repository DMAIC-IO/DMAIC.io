/**
 * D.Mike — Morphologischer Kasten: Model.
 *
 * Parameter mit alternativen Optionen, paarweise Unverträglichkeiten zwischen
 * Optionen verschiedener Parameter (Konsistenzprüfung) und benannte Konzepte,
 * die je Parameter eine Option wählen. Ohne DOM, ohne i18n.
 *
 * Gespeichert: `{ _schema, parameters, conflicts, concepts, activeConceptId, view }`.
 * Options-ids sind freier Text; dass Konflikte und Picks auf vorhandene
 * Optionen zeigen, sichern die Invarianten — beim Laden repariert, beim
 * Schreiben abgelehnt.
 */
import {
  defineModel, command, list, object, map, text, idOf, oneOf, boolean,
} from '../../../core/model.js';
import { requireKnownId, requireForm } from '../../../core/validate.js';
import { uid } from '../../../core/uid.js';
import { pairKey, countConsistent } from './counting.js';

/** Die Ansichten in Reiterreihenfolge (gleich den Werten von `view` im Schema). */
export const VIEWS = Object.freeze(['box', 'consistency']);

/**
 * Option-id → id des Parameters, der sie hält (bei Dubletten der erste).
 * @param {{ parameters: ReadonlyArray<{ id: string, options: ReadonlyArray<{ id: string }> }> }} m
 * @returns {Map<string, string>}
 */
function optionOwners(m) {
  const owners = new Map();
  for (const p of m.parameters) for (const o of p.options) if (!owners.has(o.id)) owners.set(o.id, p.id);
  return owners;
}

/**
 * True, wenn keine id leer ist und keine doppelt vorkommt.
 * @param {string[]} ids @returns {boolean}
 */
function distinctIds(ids) {
  return ids.every(id => id !== '') && new Set(ids).size === ids.length;
}

/**
 * Eine neue id, die in `taken` noch nicht vorkommt; wird dort eingetragen.
 * @param {Set<string>} taken @returns {string}
 */
function freshId(taken) {
  let id = uid();
  while (taken.has(id)) id = uid();
  taken.add(id);
  return id;
}

/**
 * Einträge mit leerer id bekommen eine neue, spätere Dubletten entfallen.
 * @template {{ id: string }} T
 * @param {T[]} items @param {Set<string>} [dropped] nimmt die ids verworfener Dubletten auf
 * @returns {T[]}
 */
function dedupeIds(items, dropped) {
  const taken = new Set(items.map(x => x.id));
  const seen = new Set();
  return items.filter((x) => {
    if (x.id === '') x.id = freshId(taken);
    if (seen.has(x.id)) { dropped?.add(x.id); return false; }
    seen.add(x.id);
    return true;
  });
}

/**
 * Ein Konfliktpaar ist gültig: zwei vorhandene Optionen verschiedener Parameter.
 * @param {string[]} pair @param {Map<string, string>} owners @returns {boolean}
 */
function validPair(pair, owners) {
  if (pair.length !== 2) return false;
  const pa = owners.get(pair[0]);
  const pb = owners.get(pair[1]);
  return pa !== undefined && pb !== undefined && pa !== pb;
}

export class State extends defineModel({
  version: '1.0',
  fields: {
    parameters: list(object({
      id: text(),
      name: text(),
      options: list(object({ id: text(), label: text() })),
    })),
    conflicts: list(list(text())),
    concepts: list(object({
      id: text(),
      name: text(),
      picks: map(idOf('parameters'), text()),
    })),
  },
  view: {
    view: oneOf(['box', 'consistency']),
    activeConceptId: text(),
  },
  commands: {
    addParameter: command({
      returns: text(),
      run() {
        const id = uid();
        this.parameters.push({ id, name: '', options: [{ id: uid(), label: '' }] });
        return id;
      },
    }),
    setParameterName: command({
      params: { parameterId: idOf('parameters'), name: text() },
      run({ parameterId, name }) {
        this.findParameter(parameterId).name = name;
      },
    }),
    removeParameter: command({
      params: { parameterId: idOf('parameters') },
      run({ parameterId }) {
        const p = this.findParameter(parameterId);
        const gone = new Set(p.options.map(o => o.id));
        this.parameters.splice(this.parameters.indexOf(p), 1);
        this.conflicts = this.conflicts.filter(([a, b]) => !gone.has(a) && !gone.has(b));
        for (const c of this.concepts) delete c.picks[parameterId];
      },
    }),
    addOption: command({
      params: { parameterId: idOf('parameters') },
      returns: text(),
      run({ parameterId }) {
        const id = uid();
        this.findParameter(parameterId).options.push({ id, label: '' });
        return id;
      },
    }),
    setOptionLabel: command({
      params: { optionId: text(), label: text() },
      run({ optionId, label }) {
        requireKnownId('optionId', optionId, this.optionIds());
        this.findOption(optionId).label = label;
      },
    }),
    removeOption: command({
      params: { optionId: text() },
      run({ optionId }) {
        requireKnownId('optionId', optionId, this.optionIds());
        const p = this.parameterOf(optionId);
        p.options.splice(p.options.findIndex(o => o.id === optionId), 1);
        this.conflicts = this.conflicts.filter(([a, b]) => a !== optionId && b !== optionId);
        for (const c of this.concepts) if (c.picks[p.id] === optionId) delete c.picks[p.id];
      },
    }),
    setConflict: command({
      params: { optionA: text(), optionB: text(), incompatible: boolean() },
      run({ optionA, optionB, incompatible }) {
        const ids = this.optionIds();
        requireKnownId('optionA', optionA, ids);
        requireKnownId('optionB', optionB, ids);
        requireForm('optionB', optionB, this.parameterOf(optionA) !== this.parameterOf(optionB),
          'an option of another parameter than optionA');
        const key = pairKey(optionA, optionB);
        const next = this.conflicts.filter(([x, y]) => pairKey(x, y) !== key);
        if (incompatible) next.push(optionA < optionB ? [optionA, optionB] : [optionB, optionA]);
        this.conflicts = next;
      },
    }),
    addConcept: command({
      returns: text(),
      run() {
        const id = uid();
        this.concepts.push({ id, name: '', picks: {} });
        this.activeConceptId = id;
        return id;
      },
    }),
    setConceptName: command({
      params: { conceptId: idOf('concepts'), name: text() },
      run({ conceptId, name }) {
        this.findConcept(conceptId).name = name;
      },
    }),
    removeConcept: command({
      params: { conceptId: idOf('concepts') },
      run({ conceptId }) {
        this.concepts.splice(this.concepts.findIndex(c => c.id === conceptId), 1);
        if (this.activeConceptId === conceptId) this.activeConceptId = this.concepts[0]?.id ?? '';
      },
    }),
    setConceptPick: command({
      params: { conceptId: idOf('concepts'), parameterId: idOf('parameters'), optionId: text() },
      run({ conceptId, parameterId, optionId }) {
        const picks = this.findConcept(conceptId).picks;
        if (optionId === '') { delete picks[parameterId]; return; }
        requireKnownId('optionId', optionId, ['', ...this.findParameter(parameterId).options.map(o => o.id)]);
        picks[parameterId] = optionId;
      },
    }),
  },
  invariants: {
    uniqueIds: {
      fields: ['parameters', 'concepts'],
      test(m) {
        return distinctIds(m.parameters.map(p => p.id))
          && distinctIds(m.parameters.flatMap(p => p.options.map(o => o.id)))
          && distinctIds(m.concepts.map(c => c.id));
      },
      repair(m) {
        const parameters = dedupeIds(m._v.parameters);
        const options = parameters.flatMap(p => p.options);
        const taken = new Set(options.map(o => o.id));
        const seen = new Set();
        const dropped = new Set();
        for (const p of parameters) {
          p.options = p.options.filter((o) => {
            if (o.id === '') o.id = freshId(taken);
            if (seen.has(o.id)) { dropped.add(o.id); return false; }
            seen.add(o.id);
            return true;
          });
        }
        m._v.parameters = parameters;
        m._v.conflicts = m._v.conflicts.filter(pair => !pair.some(id => dropped.has(id)));
        m._v.concepts = dedupeIds(m._v.concepts);
      },
    },
    validConflicts: {
      fields: ['conflicts', 'parameters'],
      test(m) {
        const owners = optionOwners(m);
        const seen = new Set();
        return m.conflicts.every((pair) => {
          if (!validPair(pair, owners) || !(pair[0] < pair[1])) return false;
          const key = pairKey(pair[0], pair[1]);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      },
      repair(m) {
        const owners = optionOwners(m);
        const seen = new Set();
        const out = [];
        for (const pair of m._v.conflicts) {
          if (!validPair(pair, owners)) continue;
          const key = pairKey(pair[0], pair[1]);
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(pair[0] < pair[1] ? [pair[0], pair[1]] : [pair[1], pair[0]]);
        }
        m._v.conflicts = out;
      },
    },
    validPicks: {
      fields: ['concepts', 'parameters'],
      test(m) {
        const owners = optionOwners(m);
        return m.concepts.every(c => Object.entries(c.picks).every(([p, o]) => owners.get(o) === p));
      },
      repair(m) {
        const owners = optionOwners(m);
        for (const c of m._v.concepts) {
          for (const [p, o] of Object.entries(c.picks)) if (owners.get(o) !== p) delete c.picks[p];
        }
      },
    },
    activeConcept: {
      fields: ['activeConceptId'],
      test(m) {
        return m.concepts.length === 0
          ? m.activeConceptId === ''
          : m.concepts.some(c => c.id === m.activeConceptId);
      },
      repair(m) {
        m._v.activeConceptId = m.concepts[0]?.id ?? '';
      },
    },
  },
}) {
  /**
   * @param {string} id
   * @returns {{ id: string, name: string, options: Array<{ id: string, label: string }> }|undefined}
   */
  findParameter(id) {
    return this.parameters.find(p => p.id === id);
  }

  /**
   * Der Parameter, der eine Option hält.
   * @param {string} optionId
   * @returns {{ id: string, name: string, options: Array<{ id: string, label: string }> }|undefined}
   */
  parameterOf(optionId) {
    return this.parameters.find(p => p.options.some(o => o.id === optionId));
  }

  /**
   * @param {string} optionId
   * @returns {{ id: string, label: string }|undefined}
   */
  findOption(optionId) {
    return this.parameterOf(optionId)?.options.find(o => o.id === optionId);
  }

  /** @returns {string[]} alle Options-ids in Kastenreihenfolge */
  optionIds() {
    return this.parameters.flatMap(p => p.options.map(o => o.id));
  }

  /**
   * @param {string} a Options-id
   * @param {string} b Options-id
   * @returns {boolean} true, wenn das Paar als unverträglich markiert ist
   */
  isConflict(a, b) {
    const key = pairKey(a, b);
    return this.conflicts.some(([x, y]) => pairKey(x, y) === key);
  }

  /** @returns {number} alle Kombinationen aus je einer Option je Parameter mit Optionen */
  combinationCount() {
    const sizes = this.parameters.map(p => p.options.length).filter(n => n > 0);
    return sizes.length ? sizes.reduce((n, k) => n * k, 1) : 0;
  }

  /** @returns {{ count: number, exact: boolean }} Kombinationen ohne unverträgliches Paar */
  consistentCount() {
    return countConsistent(this.parameters, new Set(this.conflicts.map(([a, b]) => pairKey(a, b))));
  }

  /**
   * @param {string} id
   * @returns {{ id: string, name: string, picks: Record<string, string> }|undefined}
   */
  findConcept(id) {
    return this.concepts.find(c => c.id === id);
  }

  /**
   * Die gewählten Options-ids eines Konzepts in Kastenreihenfolge.
   * @param {string} conceptId
   * @returns {string[]}
   */
  conceptOptionIds(conceptId) {
    const c = this.findConcept(conceptId);
    if (!c) return [];
    return this.parameters.map(p => c.picks[p.id]).filter(Boolean);
  }

  /**
   * Die unverträglichen Paare innerhalb eines Konzepts in Kastenreihenfolge.
   * @param {string} conceptId
   * @returns {string[][]}
   */
  conceptConflicts(conceptId) {
    const ids = this.conceptOptionIds(conceptId);
    const out = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (this.isConflict(ids[i], ids[j])) out.push([ids[i], ids[j]]);
      }
    }
    return out;
  }

  /**
   * True, wenn das Konzept in jedem Parameter mit Optionen eine Option wählt.
   * @param {string} conceptId
   * @returns {boolean}
   */
  isConceptComplete(conceptId) {
    const c = this.findConcept(conceptId);
    return !!c && this.parameters.every(p => p.options.length === 0 || !!c.picks[p.id]);
  }
}
