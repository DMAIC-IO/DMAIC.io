/**
 * D.Mike — Kano: Model.
 *
 * Woher die Merkmale stammen (Instanz und Ebene eines VoC→CTx-Baums), die
 * Erfassungsoptionen, die Merkmale, die Befragten und je Befragter und
 * Merkmal die drei Antworten. Ansicht: die angezeigte Befragte und die
 * Editor-Einstellungen des Better/Worse-Diagramms. Die Auswertung ist die
 * Ableitung `evaluation`, ein Hinweis auf eine verschwundene Baum-Instanz die
 * Ableitung `sourceHint`. Ohne DOM, ohne Dienste; den Baum liest das
 * Viewmodel, `syncItems` bekommt die Kandidaten.
 *
 * Gespeichert: `{ _schema, source, options, items, respondents, answers,
 * activeRespondentId, scatterEdits }`. Eindeutige ids und eine bekannte
 * aktive Befragte sichern Invarianten. Neue ids: `uid()`.
 */
import {
  defineModel, command, list, map, object, idOf, number, text, oneOf, boolean,
} from '../../../core/model.js';
import { requireNumber, requireForm } from '../../../core/validate.js';
import { uid } from '../../../core/uid.js';
import scatterChart from '../../../widgets/scatter-chart/schema.js';
import { from0 } from './migrations.js';
import { diff, applyDiff } from './link.js';
import { evaluation } from './evaluate.js';

/** @typedef {import('./evaluate.js').KanoEvaluation} KanoEvaluation */

/** Obergrenze der Skala je Antwortfeld. */
export const ANSWER_MAX = Object.freeze({ f: 5, d: 5, w: 9 });

/**
 * Doppelte ids einer Liste: die späteren Einträge entfallen.
 * @template {{ id: string }} T @param {T[]} xs @returns {T[]}
 */
function firstOfEachId(xs) {
  const seen = new Set();
  return xs.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

/** @param {ReadonlyArray<{ id: string }>} xs @returns {boolean} */
const distinctIds = (xs) => new Set(xs.map((x) => x.id)).size === xs.length;

/**
 * Eine neue id, die in der Liste noch nicht vorkommt.
 * @param {ReadonlyArray<{ id: string }>} xs @returns {string}
 */
function newId(xs) {
  const taken = new Set(xs.map((x) => x.id));
  let id = uid();
  while (taken.has(id)) id = uid();
  return id;
}

/**
 * Ob irgendeine Antwort gesetzt ist.
 * @param {Readonly<Record<string, Record<string, { f: number|null, d: number|null, w: number|null }>>>} answers
 * @returns {boolean}
 */
export function hasAnswers(answers) {
  return Object.values(answers).some((byItem) => Object.values(byItem)
    .some((a) => a.f !== null || a.d !== null || a.w !== null));
}

export class State extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    /** woher die Merkmale stammen: Instanz des VoC→CTx-Baums (`null`: ohne Baumbezug) und Ebene */
    source: object({
      instanceId: text({ nullable: true }),
      level: oneOf(['need', 'driver', 'req']),
    }, { agentWrite: false }),
    /** die Erfassungsoptionen: die dritte Frage nach der Wichtigkeit an oder aus */
    options: object({ importance: boolean({ default: true }) }),
    /** die zu bewertenden Merkmale in Erfassungsreihenfolge */
    items: list(object({
      id: text({ nonEmpty: true }),
      nodeId: text({ nullable: true }),
      label: text(),
      path: text(),
      missing: boolean(),
    }), { bulk: true, agentWrite: false }),
    /** die Befragten in Anlegereihenfolge */
    respondents: list(object({
      id: text({ nonEmpty: true }),
      name: text(),
    }), { agentWrite: false }),
    /** die Antworten je Befragter und darin je Merkmal */
    answers: map(idOf('respondents'), map(idOf('items'), object({
      f: number({ nullable: true, integer: true, min: 1, max: 5 }),
      d: number({ nullable: true, integer: true, min: 1, max: 5 }),
      w: number({ nullable: true, integer: true, min: 1, max: 9 }),
    })), { agentWrite: false }),
  },
  view: {
    /** die Befragte, deren Antworten das Erfassungsraster zeigt */
    activeRespondentId: text({ nullable: true, agentWrite: false }),
    /** die Editor-Einstellungen des Better/Worse-Diagramms */
    scatterEdits: scatterChart.edits(),
  },
  invariants: {
    uniqueItemIds: {
      fields: ['items'],
      test(m) { return distinctIds(m.items); },
      repair(m) { m._v.items = firstOfEachId(m._v.items); },
    },
    uniqueRespondentIds: {
      fields: ['respondents'],
      test(m) { return distinctIds(m.respondents); },
      repair(m) { m._v.respondents = firstOfEachId(m._v.respondents); },
    },
    knownActive: {
      fields: ['activeRespondentId'],
      test(m) {
        return m.activeRespondentId === null || m.respondents.some((r) => r.id === m.activeRespondentId);
      },
      repair(m) {
        m._v.activeRespondentId = m._v.respondents.length ? m._v.respondents[0].id : null;
      },
    },
  },
  derived: {
    /**
     * Die Auswertung je Merkmal und insgesamt (Engine `kano-engine.js`).
     * @this {import('./model.types.js').StateModel}
     * @returns {KanoEvaluation}
     */
    evaluation() {
      return evaluation(this);
    },
    /**
     * Ein Hinweis, wenn die gespeicherte Baum-Instanz im Projekt fehlt;
     * sonst `null`.
     * @param {import('../../../core/source-reader.js').Source} src Leser fremder Instanzen
     * @param {object} _d andere Ableitungen
     * @param {(key: string) => string} t Übersetzer des Moduls
     * @this {import('./model.types.js').StateModel}
     * @returns {string|null}
     */
    sourceHint(src, _d, t) {
      const id = this.source.instanceId;
      if (id === null) return null;
      const known = src.list().some((i) => i.instanceId === id && i.moduleId === 'voc-ctx-tree');
      return known ? null : t('sourceHint.unknownTree');
    },
  },
  commands: {
    setSourceTree: command({
      params: { instanceId: text({ nullable: true }) },
      run({ instanceId }) {
        this.source.instanceId = instanceId;
      },
    }),
    setSourceLevel: command({
      params: { level: oneOf(['need', 'driver', 'req']) },
      /** @type {import('./model.types.js').SetSourceLevelConfirm} */
      confirm() {
        return hasAnswers(this.answers) ? { key: 'confirm.setSourceLevel' } : null;
      },
      run({ level }) {
        this.source.level = level;
        this.items = [];
        this.answers = {};
      },
    }),
    syncItems: command({
      params: {
        instanceId: text({ nonEmpty: true }),
        candidates: list(object({ nodeId: text(), label: text(), path: text() })),
      },
      returns: number(),
      run({ instanceId, candidates }) {
        this.source.instanceId = instanceId;
        const items = this.items.map((i) => ({ ...i }));
        const taken = [...items];
        this.items = applyDiff(items, diff(items, candidates), () => {
          const id = newId(taken);
          taken.push({ id });
          return id;
        });
        return this.items.length;
      },
    }),
    setItems: command({
      params: {
        items: list(object({
          id: text({ nonEmpty: true }),
          nodeId: text({ nullable: true, optional: true }),
          label: text({ optional: true }),
          path: text({ optional: true }),
          missing: boolean({ optional: true }),
        })),
      },
      returns: number(),
      run({ items }) {
        // Vor dem Schreiben prüfen: die Antworten stehen in keiner Invariante
        // und würden bei einer späteren Ablehnung nicht zurückgesetzt.
        requireForm('items', items, distinctIds(items), 'a list with distinct ids');
        this.items = items.map((i) => ({
          id: i.id, nodeId: i.nodeId ?? null, label: i.label ?? '', path: i.path ?? '', missing: i.missing ?? false,
        }));
        const ids = new Set(this.items.map((i) => i.id));
        for (const byItem of Object.values(this.answers)) {
          for (const iid of Object.keys(byItem)) if (!ids.has(iid)) delete byItem[iid];
        }
        return this.items.length;
      },
    }),
    removeItem: command({
      params: { id: idOf('items') },
      run({ id }) {
        this.items.splice(this.items.findIndex((i) => i.id === id), 1);
        for (const byItem of Object.values(this.answers)) delete byItem[id];
      },
    }),
    addRespondent: command({
      params: { name: text({ trim: true, nonEmpty: true }) },
      returns: text(),
      run({ name }) {
        const id = newId(this.respondents);
        this.respondents.push({ id, name });
        if (this.activeRespondentId === null) this.activeRespondentId = id;
        return id;
      },
    }),
    renameRespondent: command({
      params: { id: idOf('respondents'), name: text({ trim: true, nonEmpty: true }) },
      run({ id, name }) {
        const r = this.respondents.find((x) => x.id === id);
        if (r) r.name = name;
      },
    }),
    removeRespondent: command({
      params: { id: idOf('respondents') },
      /** @type {import('./model.types.js').RemoveRespondentConfirm} */
      confirm() {
        return { key: 'confirm.removeRespondent' };
      },
      run({ id }) {
        this.respondents.splice(this.respondents.findIndex((r) => r.id === id), 1);
        delete this.answers[id];
        if (this.activeRespondentId === id) {
          this.activeRespondentId = this.respondents.length ? this.respondents[0].id : null;
        }
      },
    }),
    setAnswer: command({
      params: {
        respondentId: idOf('respondents'),
        itemId: idOf('items'),
        field: oneOf(['f', 'd', 'w']),
        value: number({ nullable: true, integer: true, min: 1, max: 9 }),
      },
      run({ respondentId, itemId, field, value }) {
        if (value !== null) requireNumber('value', value, { min: 1, max: ANSWER_MAX[field], integer: true });
        if (!this.answers[respondentId]) this.answers[respondentId] = {};
        const byItem = this.answers[respondentId];
        if (!byItem[itemId]) byItem[itemId] = { f: null, d: null, w: null };
        byItem[itemId][field] = value;
      },
    }),
  },
}) {}
