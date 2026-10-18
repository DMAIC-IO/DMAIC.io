import { uid as coreUid } from '../../core/uid.js';

export const CATEGORIES = ['success', 'problem', 'improve'];
export const IMPACTS = ['high', 'medium', 'low'];

/**
 * Eine Maßnahme einer Erfahrung, wie `toJSON()` sie liefert.
 *
 * @typedef {object} LessonAction
 * @property {string} text  die Maßnahme
 * @property {boolean} done  erledigt
 */
export class Action {
  text = ''
  done = false

  toJSON() {
    return { text: this.text, done: this.done };
  }

  static fromJSON(d) {
    const a = new Action();
    if (d) {
      a.text = typeof d.text === 'string' ? d.text : '';
      a.done = typeof d.done === 'boolean' ? d.done : false;
    }
    return a;
  }
}

/**
 * Eine Erfahrung, wie `toJSON()` sie liefert und `read().lessons` sie zeigt.
 * Sätze je Eigenschaft unter `types.LessonEntry.<name>`, dieselben an den
 * Formularbeschriftungen (Alt-Taste).
 *
 * @typedef {object} LessonEntry
 * @property {string} id  Kennung
 * @property {string} title  Titel
 * @property {'success'|'problem'|'improve'} category  Kategorie
 * @property {string} phase  Phase des Zyklus
 * @property {'high'|'medium'|'low'} impact  Auswirkung
 * @property {string} owner  verantwortlich
 * @property {string} description  Beschreibung
 * @property {string} rootCause  Ursache
 * @property {string} recommendation  Empfehlung
 * @property {LessonAction[]} actions  Maßnahmen
 * @property {number} createdAt  angelegt, Zeitstempel in Millisekunden
 * @property {number} updatedAt  zuletzt geändert, Zeitstempel in Millisekunden
 */
export class Lesson {
  id = ''
  title = ''
  category = 'success'
  phase = 'control'
  impact = 'medium'
  owner = ''
  description = ''
  rootCause = ''
  recommendation = ''
  actions = []
  createdAt = 0
  updatedAt = 0

  static uid() {
    return coreUid();
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      category: this.category,
      phase: this.phase,
      impact: this.impact,
      owner: this.owner,
      description: this.description,
      rootCause: this.rootCause,
      recommendation: this.recommendation,
      actions: this.actions.map(a => a.toJSON()),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  static fromJSON(d) {
    const l = new Lesson();
    if (!d) return l;
    l.id = typeof d.id === 'string' ? d.id : Lesson.uid();
    l.title = typeof d.title === 'string' ? d.title : '';
    l.category = CATEGORIES.includes(d.category) ? d.category : 'success';
    l.phase = typeof d.phase === 'string' ? d.phase : 'control';
    l.impact = IMPACTS.includes(d.impact) ? d.impact : 'medium';
    l.owner = typeof d.owner === 'string' ? d.owner : '';
    l.description = typeof d.description === 'string' ? d.description : '';
    l.rootCause = typeof d.rootCause === 'string' ? d.rootCause : '';
    l.recommendation = typeof d.recommendation === 'string' ? d.recommendation : '';
    l.actions = Array.isArray(d.actions) ? d.actions.map(a => Action.fromJSON(a)) : [];
    l.createdAt = typeof d.createdAt === 'number' ? d.createdAt : 0;
    l.updatedAt = typeof d.updatedAt === 'number' ? d.updatedAt : 0;
    return l;
  }
}

export class State {
  /**
   * @type {LessonEntry[]} die erfassten Erfahrungen in Anlegereihenfolge; je
   *   Erfahrung `id` (zum Ansprechen), `title`, `category` (`success`,
   *   `problem` oder `improve`), `phase` (eine Phase des aktiven Zyklus),
   *   `impact` (`high`, `medium` oder `low`), `owner`, `description`,
   *   `rootCause`, `recommendation`, `actions` (je Maßnahme `text` und
   *   `done`) sowie `createdAt` und `updatedAt` als Zeitstempel in
   *   Millisekunden
   * @agentBulk
   */
  lessons = []

  computeStats() {
    let total = 0, success = 0, problem = 0, improve = 0, openActions = 0;
    for (const l of this.lessons) {
      total++;
      if (l.category === 'success') success++;
      else if (l.category === 'problem') problem++;
      else if (l.category === 'improve') improve++;
      openActions += l.actions.filter(a => !a.done).length;
    }
    return { total, success, problem, improve, openActions };
  }

  hasContent() {
    return this.lessons.length > 0;
  }

  toJSON() {
    return { lessons: this.lessons.map(l => l.toJSON()) };
  }

  static fromJSON(d) {
    const s = new State();
    if (!d) return s;
    s.lessons = Array.isArray(d.lessons) ? d.lessons.map(l => Lesson.fromJSON(l)) : [];
    return s;
  }
}

/**
 * High-impact lessons with at least one open action, in stored order.
 * @param {Lesson[]} lessons
 * @param {number} n
 * @returns {Lesson[]}
 */
export function openHighImpact(lessons, n) {
  return lessons.filter(l => l.impact === 'high' && l.actions.some(a => !a.done)).slice(0, n);
}
