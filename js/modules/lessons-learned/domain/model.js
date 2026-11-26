/**
 * D.Mike — Lessons Learned: Model.
 *
 * Die Erfahrungen eines Projekts in Anlegereihenfolge, je mit Kategorie,
 * Phase, Wirkung, freien Texten, Maßnahmen und Zeitstempeln. Ohne DOM, ohne
 * i18n.
 *
 * Gespeichert: `{ _schema, lessons }`. Die Phase ist Text: ältere oder
 * importierte Projekte tragen auch Phasen anderer Zyklen, die bleiben; die
 * Kommandos schreiben nur Phasen des aktiven Zyklus. Dass ids nichtleer und
 * eindeutig sind, sichert die Invariante `uniqueIds`. Jedes Kommando, das
 * eine Erfahrung ändert, setzt deren `updatedAt`.
 */
import {
  defineModel, command, list, object, number, text, boolean, idOf, oneOf,
} from '../../../core/model.js';
import { requireForm, requireEnum, requireIndex } from '../../../core/validate.js';
import { getPhaseIds } from '../../../core/cycles/cycles.js';
import { uid } from '../../../core/uid.js';
import { from0 } from './migrations.js';
import { CATEGORIES, IMPACTS, lastPhase, statsOf, toLesson } from './lessons.js';

export { CATEGORIES, IMPACTS };

/** Die Angaben einer Erfahrung, die `updateLesson` ändern kann. */
const ENTRY_KEYS = ['title', 'category', 'impact', 'phase', 'owner', 'description', 'rootCause', 'recommendation', 'actions'];

/** @typedef {import('./model.types.js').StateFields['lessons'][number]} LessonEntry */

/**
 * Kennzahlen der Statistikleiste.
 *
 * @typedef {object} LessonStats
 * @property {number} total  number of lessons
 * @property {number} success  lessons of the category success
 * @property {number} problem  lessons of the category problem
 * @property {number} improve  lessons of the category improve
 * @property {number} openActions  actions not ticked off, over all lessons
 */

/**
 * True, wenn jede id nichtleer ist und nur einmal vorkommt.
 * @param {ReadonlyArray<{ id: string }>} items @returns {boolean}
 */
function validIds(items) {
  const ids = items.map((x) => x.id);
  return ids.every((id) => id !== '') && new Set(ids).size === ids.length;
}

/**
 * Die Erfahrung mit dieser id; eine unbekannte id lehnt ab (`param` `lessonId`).
 * @param {{ lessons: ReadonlyArray<LessonEntry> }} m @param {string|undefined} id
 * @returns {LessonEntry}
 */
function lessonOf(m, id) {
  const l = m.lessons.find((x) => x.id === id);
  requireForm('lessonId', id, l !== undefined, 'the id of a lesson');
  return /** @type {LessonEntry} */ (l);
}

/**
 * Eine Phase des aktiven Zyklus, sonst Ablehnung (`param` `phase`).
 * @param {{ context: { cycle: string } }} m @param {string} p @returns {string}
 */
function phaseOfCycle(m, p) {
  return /** @type {string} */ (requireEnum('phase', p, getPhaseIds(m.context.cycle)));
}

/**
 * Maßnahmen in gespeicherter Form; ohne Haken offen.
 * @param {ReadonlyArray<{ text: string, done?: boolean }>} actions
 * @returns {{ text: string, done: boolean }[]}
 */
const actionsOf = (actions) => actions.map((a) => ({ text: a.text, done: a.done === true }));

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    /** die Erfahrungen in Anlegereihenfolge, je mit id, Titel, Kategorie, Phase, Wirkung, Verantwortlich, Beschreibung, Ursache, Empfehlung, Maßnahmen und Zeitstempeln */
    lessons: list(object({
      id: text(),
      title: text(),
      category: oneOf(['success', 'problem', 'improve']),
      phase: text(),
      impact: oneOf(['high', 'medium', 'low']),
      owner: text(),
      description: text(),
      rootCause: text(),
      recommendation: text(),
      actions: list(object({ text: text(), done: boolean() })),
      createdAt: number(),
      updatedAt: number(),
    }), { bulk: true, agentWrite: false }),
  },
  view: {},
  invariants: {
    uniqueIds: {
      fields: ['lessons'],
      test(m) { return validIds(m.lessons); },
      repair(m) {
        const seen = new Set();
        m._v.lessons = m._v.lessons.filter((l) => {
          if (l.id === '' || seen.has(l.id)) return false;
          seen.add(l.id);
          return true;
        });
      },
    },
  },
  commands: {
    addLesson: command({
      params: {
        title: text({ trim: true, nonEmpty: true }),
        category: oneOf(['success', 'problem', 'improve'], { default: 'success', optional: true }),
        impact: oneOf(['high', 'medium', 'low'], { default: 'medium', optional: true }),
        phase: text({ optional: true }),
        owner: text({ trim: true, optional: true }),
        description: text({ trim: true, optional: true }),
        rootCause: text({ trim: true, optional: true }),
        recommendation: text({ trim: true, optional: true }),
        actions: list(object({ text: text({ trim: true }), done: boolean({ optional: true }) }), { optional: true }),
      },
      returns: text(),
      run({
        title, category = 'success', impact = 'medium', phase, owner = '', description = '', rootCause = '',
        recommendation = '', actions = [],
      }) {
        const p = phase === undefined ? lastPhase(this.context.cycle) : phaseOfCycle(this, phase);
        const id = uid();
        const now = Date.now();
        this.lessons.push({
          id, title, category, phase: p, impact, owner, description, rootCause, recommendation,
          actions: actionsOf(actions), createdAt: now, updatedAt: now,
        });
        return id;
      },
    }),
    updateLesson: command({
      params: {
        lessonId: idOf('lessons'),
        title: text({ trim: true, nonEmpty: true, optional: true }),
        category: oneOf(['success', 'problem', 'improve'], { optional: true }),
        impact: oneOf(['high', 'medium', 'low'], { optional: true }),
        phase: text({ optional: true }),
        owner: text({ trim: true, optional: true }),
        description: text({ trim: true, optional: true }),
        rootCause: text({ trim: true, optional: true }),
        recommendation: text({ trim: true, optional: true }),
        actions: list(object({ text: text({ trim: true }), done: boolean({ optional: true }) }), { optional: true }),
      },
      /** @type {import('./model.types.js').UpdateLessonCurrent} */
      current({ lessonId }) {
        const l = lessonOf(this, lessonId);
        const phases = getPhaseIds(this.context.cycle);
        return {
          title: l.title,
          category: l.category,
          impact: l.impact,
          phase: phases.includes(l.phase) ? l.phase : lastPhase(this.context.cycle),
          owner: l.owner,
          description: l.description,
          rootCause: l.rootCause,
          recommendation: l.recommendation,
          actions: actionsOf(l.actions),
        };
      },
      run({ lessonId, ...changes }) {
        const given = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
        requireForm('command', 'updateLesson', ENTRY_KEYS.some((k) => k in given),
          `an object with lessonId and at least one of ${ENTRY_KEYS.join(', ')}`);
        if (given.phase !== undefined) phaseOfCycle(this, given.phase);
        if (given.actions !== undefined) given.actions = actionsOf(given.actions);
        const l = lessonOf(this, lessonId);
        Object.assign(l, given);
        l.updatedAt = Date.now();
      },
    }),
    removeLesson: command({
      params: { lessonId: idOf('lessons') },
      /** @type {import('./model.types.js').RemoveLessonConfirm} */
      confirm({ lessonId }) {
        lessonOf(this, lessonId);
        return { key: 'confirm.removeLesson' };
      },
      run({ lessonId }) {
        this.lessons.splice(this.lessons.findIndex((l) => l.id === lessonId), 1);
      },
    }),
    addAction: command({
      params: { lessonId: idOf('lessons'), text: text({ trim: true, nonEmpty: true }) },
      returns: number({ integer: true }),
      run({ lessonId, text: t }) {
        const l = lessonOf(this, lessonId);
        l.actions.push({ text: t, done: false });
        l.updatedAt = Date.now();
        return l.actions.length - 1;
      },
    }),
    removeAction: command({
      params: { lessonId: idOf('lessons'), actionIndex: number({ integer: true, min: 0 }) },
      run({ lessonId, actionIndex }) {
        const l = lessonOf(this, lessonId);
        requireIndex('actionIndex', actionIndex, l.actions.length, { existing: true });
        l.actions.splice(actionIndex, 1);
        l.updatedAt = Date.now();
      },
    }),
    setActionDone: command({
      params: { lessonId: idOf('lessons'), actionIndex: number({ integer: true, min: 0 }), done: boolean() },
      run({ lessonId, actionIndex, done }) {
        const l = lessonOf(this, lessonId);
        requireIndex('actionIndex', actionIndex, l.actions.length, { existing: true });
        l.actions[actionIndex].done = done;
        l.updatedAt = Date.now();
      },
    }),
    importLessons: command({
      params: { json: text() },
      returns: object({ count: number({ integer: true }) }),
      run({ json }) {
        let data;
        try { data = JSON.parse(json); } catch { data = undefined; }
        if (!Array.isArray(data)) {
          throw Object.assign(new Error('invalid json; allowed: the text of a JSON list of lessons'), { param: 'json', hintKey: 'importError' });
        }
        const used = new Set(this.lessons.map((l) => l.id));
        let count = 0;
        for (const raw of data) {
          const lesson = toLesson(raw);
          if (lesson === null) continue;
          const own = /** @type {any} */ (raw).id;
          const id = typeof own === 'string' && own !== '' && !used.has(own) ? own : uid();
          used.add(id);
          this.lessons.push({ id, ...lesson });
          count++;
        }
        return { count };
      },
    }),
  },
  derived: {
    /**
     * Kennzahlen wie in der Statistikleiste.
     *
     * @this {import('./model.types.js').StateModel}
     * @returns {LessonStats}
     */
    stats() {
      return statsOf(this.lessons);
    },
  },
});
