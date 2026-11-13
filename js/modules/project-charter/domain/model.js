/**
 * D.Mike — Project charter: Model.
 *
 * Problembeschreibung (Markdown-Teilmenge), Ziele, Organigramm als flache
 * Knotenliste mit `pid` (Geschwisterfolge = Listenfolge) und der globale
 * Organigrammstil. Ohne DOM, ohne i18n.
 *
 * Gespeichert: `{ _schema, problemStatement, goals, orgChart, orgStyle }`.
 * Stilschlüssel eines Knotens stehen nur, wenn sie gesetzt sind (fehlend =
 * erbt vom globalen Stil). Dass ids und Baum stimmig sind, sichern die
 * Invarianten — beim Laden repariert, beim Schreiben abgelehnt.
 */
import {
  defineModel, list, object, text, number, oneOf, richText,
} from '../../../core/model.js';
import { uid } from '../../../core/uid.js';
import { isIsoDate } from '../../../core/local-date.js';
import { from0 } from './migrations.js';
import { childrenOf, isDescendant } from './tree.js';

/** Eine Zielzeile. @typedef {{ id: string, description: string, targetDate: string, metric: string, targetValue: string, achievementLevel: number }} Goal */

/**
 * Ein Organigrammknoten.
 * @typedef {object} OrgNode
 * @property {string} id
 * @property {string} title
 * @property {string} desc
 * @property {string|null} pid
 * @property {string} [bg]
 * @property {string} [borderColor]
 * @property {''|'dashed'|'dotted'} [borderStyle]
 * @property {number} [borderWidth]
 */

/**
 * Knoten im Zyklus: ein Kind, das zugleich Vorfahre des Knotens ist.
 * @param {OrgNode[]} nodes @returns {Set<string>}
 */
function cycleMembers(nodes) {
  const out = new Set();
  for (const n of nodes) {
    if (childrenOf(nodes, n.id).some((c) => c.id === n.id || isDescendant(nodes, n.id, c.id))) out.add(n.id);
  }
  return out;
}

/**
 * Doppelte ids: der erste Eintrag behält seine, spätere bekommen eine neue.
 * @param {Array<{ id: string }>} items @returns {void}
 */
function renewDuplicateIds(items) {
  const seen = new Set();
  for (const it of items) {
    if (seen.has(it.id)) it.id = uid();
    seen.add(it.id);
  }
}

/** @param {string[]} ids @returns {boolean} */
const distinct = (ids) => new Set(ids).size === ids.length;

export class State extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    problemStatement: richText({ maxLength: 10000 }),
    goals: list(object({
      id: text(),
      description: text(),
      targetDate: text(),
      metric: text(),
      targetValue: text(),
      achievementLevel: number({ integer: true, min: 0, max: 100 }),
    })),
    orgChart: list(object({
      id: text(),
      title: text(),
      desc: text(),
      pid: text({ nullable: true }),
      bg: text({ optional: true }),
      borderColor: text({ optional: true }),
      borderStyle: oneOf(['', 'dashed', 'dotted'], { optional: true }),
      borderWidth: number({ integer: true, min: 0, max: 8, optional: true }),
    })),
    orgStyle: object({
      nodeBg: text(),
      nodeBorderColor: text(),
      nodeBorderStyle: oneOf(['solid', 'dashed', 'dotted'], { default: 'solid' }),
      nodeBorderWidth: number({ integer: true, min: 1, max: 8, default: 1 }),
      lineColor: text(),
      lineStyle: oneOf(['solid', 'dashed', 'dotted'], { default: 'solid' }),
      lineWidth: number({ integer: true, min: 1, max: 8, default: 2 }),
    }),
  },
  invariants: {
    uniqueIds: {
      fields: ['goals', 'orgChart'],
      test(m) {
        return distinct(m.goals.map((g) => g.id)) && distinct(m.orgChart.map((n) => n.id));
      },
      repair(m) {
        renewDuplicateIds(m._v.goals);
        renewDuplicateIds(m._v.orgChart);
      },
    },
    validParents: {
      fields: ['orgChart'],
      test(m) {
        const ids = new Set(m.orgChart.map((n) => n.id));
        return m.orgChart.every((n) => n.pid === null || ids.has(n.pid));
      },
      repair(m) {
        const ids = new Set(m._v.orgChart.map((n) => n.id));
        for (const n of m._v.orgChart) if (n.pid !== null && !ids.has(n.pid)) n.pid = null;
      },
    },
    noCycles: {
      fields: ['orgChart'],
      test(m) {
        return cycleMembers(m.orgChart).size === 0;
      },
      repair(m) {
        // Je Durchgang wird nur der erste betroffene Knoten zur Wurzel; die
        // übrigen Mitglieder hängen danach wieder an einer Wurzel.
        for (let guard = m._v.orgChart.length; guard > 0; guard--) {
          const cyc = cycleMembers(m._v.orgChart);
          const first = m._v.orgChart.find((n) => cyc.has(n.id));
          if (!first) return;
          first.pid = null;
        }
      },
    },
    goalDates: {
      fields: ['goals'],
      test(m) {
        return m.goals.every((g) => g.targetDate === '' || isIsoDate(g.targetDate));
      },
      repair(m) {
        for (const g of m._v.goals) if (g.targetDate !== '' && !isIsoDate(g.targetDate)) g.targetDate = '';
      },
    },
  },
}) {
  /**
   * Hat irgendein gespeichertes Feld Inhalt (für die Rückfrage beim Laden eines Beispiels)?
   * @returns {boolean}
   */
  hasContent() {
    return this.problemStatement !== '' || this.goals.length > 0 || this.orgChart.length > 0;
  }
}
