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
  defineModel, command, list, object, text, number, oneOf, idOf, richText,
} from '../../../core/model.js';
import { requireForm } from '../../../core/validate.js';
import { uid } from '../../../core/uid.js';
import { isIsoDate } from '../../../core/local-date.js';
import { from0 } from './migrations.js';
import { childrenOf, isDescendant, moveNode, subtreeIds } from './tree.js';

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

const TITLE_MAX = 100;
const DESC_MAX = 300;
const NODE_STYLE_KEYS = ['bg', 'borderColor', 'borderStyle'];
const BORDER_STYLES = ['', 'solid', 'dashed', 'dotted'];

/**
 * Titel und Beschreibung eines Knotens gegen ihre Längen prüfen.
 * @param {string|undefined} title getrimmt @param {string|undefined} desc getrimmt
 * @throws {Error} mit `param` `title` bzw. `desc`
 */
function requireNodeText(title, desc) {
  if (title !== undefined) requireForm('title', title, title.length >= 1 && title.length <= TITLE_MAX, `a text of 1 to ${TITLE_MAX} characters`);
  if (desc !== undefined) requireForm('desc', desc, desc.length <= DESC_MAX, `a text of at most ${DESC_MAX} characters`);
}

/** @param {string|undefined} v @returns {''|'dashed'|'dotted'} `'solid'` und leer erben den globalen Stil (`''`) */
const nodeBorderStyle = (v) => (v === 'dashed' || v === 'dotted' ? v : '');

/** @param {number|undefined} v @returns {number} 0 und 1 erben (`0`), sonst 2..8 */
/** Setzt `key`; ein leerer Wert (`''`, 0) entfernt ihn — der Knoten erbt dann. */
const setOrDrop = (n, key, value) => { if (value === '' || value === 0) delete n[key]; else n[key] = value; };
const nodeBorderWidth = (v) => (v && v !== 1 ? v : 0);

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
  commands: {
    addGoal: command({
      returns: text(),
      run() {
        const id = uid();
        this.goals.push({ id, description: '', targetDate: '', metric: '', targetValue: '', achievementLevel: 0 });
        return id;
      },
    }),
    removeGoal: command({
      params: { id: idOf('goals') },
      run({ id }) {
        this.goals = this.goals.filter((g) => g.id !== id);
      },
    }),
    moveGoal: command({
      params: { id: idOf('goals'), beforeId: idOf('goals', { nullable: true }) },
      run({ id, beforeId }) {
        if (id === beforeId) return;
        const goal = this.goals.find((g) => g.id === id);
        const rest = this.goals.filter((g) => g.id !== id);
        const at = beforeId === null ? rest.length : rest.findIndex((g) => g.id === beforeId);
        rest.splice(at, 0, goal);
        this.goals = rest;
      },
    }),
    addOrgNode: command({
      params: {
        title: text({ trim: true, nonEmpty: true }),
        desc: text({ trim: true, optional: true }),
        parentId: idOf('orgChart', { nullable: true, optional: true }),
      },
      returns: text(),
      run({ title, desc = '', parentId = null }) {
        requireNodeText(title, desc);
        const id = uid();
        this.orgChart.push({ id, title, desc, pid: parentId });
        return id;
      },
    }),
    updateOrgNode: command({
      params: {
        id: idOf('orgChart'),
        title: text({ trim: true, nonEmpty: true }),
        desc: text({ trim: true, optional: true }),
        bg: text({ optional: true }),
        borderColor: text({ optional: true }),
        borderStyle: oneOf(BORDER_STYLES, { optional: true }),
        borderWidth: number({ integer: true, min: 0, max: 8, optional: true }),
      },
      current({ id }) {
        const n = this.orgChart.find((x) => x.id === id);
        return {
          title: n.title,
          desc: n.desc,
          bg: n.bg ?? '',
          borderColor: n.borderColor ?? '',
          borderStyle: n.borderStyle ?? '',
          borderWidth: n.borderWidth ?? 0,
        };
      },
      run({ id, title, desc, bg, borderColor, borderStyle, borderWidth }) {
        requireNodeText(title, desc);
        const n = this.orgChart.find((x) => x.id === id);
        n.title = title;
        if (desc !== undefined) n.desc = desc;
        // Leer heißt erben: der Schlüssel fehlt dann, statt leer zu stehen.
        setOrDrop(n, 'bg', bg || '');
        setOrDrop(n, 'borderColor', borderColor || '');
        setOrDrop(n, 'borderStyle', nodeBorderStyle(borderStyle));
        setOrDrop(n, 'borderWidth', nodeBorderWidth(borderWidth));
      },
    }),
    setOrgNodeStyle: command({
      params: { id: idOf('orgChart'), key: oneOf(NODE_STYLE_KEYS), value: text() },
      run({ id, key, value }) {
        const n = this.orgChart.find((x) => x.id === id);
        if (key === 'borderStyle') {
          requireForm('value', value, BORDER_STYLES.includes(value), BORDER_STYLES.map((v) => `"${v}"`).join(', '));
          n.borderStyle = nodeBorderStyle(value);
        } else n[key] = value;
      },
    }),
    setOrgNodeBorderWidth: command({
      params: { id: idOf('orgChart'), value: number({ integer: true, min: 0, max: 8 }) },
      run({ id, value }) {
        this.orgChart.find((x) => x.id === id).borderWidth = nodeBorderWidth(value);
      },
    }),
    removeOrgNode: command({
      params: { id: idOf('orgChart') },
      returns: number({ integer: true }),
      confirm({ id }) {
        const n = this.orgChart.find((x) => x.id === id);
        return { key: 'confirm.orgDeleteConfirm', params: { name: n.title } };
      },
      run({ id }) {
        const gone = new Set(subtreeIds(this.orgChart, id));
        this.orgChart = this.orgChart.filter((n) => !gone.has(n.id));
        return gone.size;
      },
    }),
    moveOrgNode: command({
      params: {
        id: idOf('orgChart'),
        parentId: idOf('orgChart', { nullable: true }),
        index: number({ integer: true, min: 0, nullable: true }),
      },
      run({ id, parentId, index }) {
        requireForm('parentId', parentId, parentId === null || (parentId !== id && !isDescendant(this.orgChart, parentId, id)),
          'null or a node that is neither the moved node nor one of its descendants');
        const count = childrenOf(this.orgChart.filter((n) => n.id !== id), parentId).length;
        requireForm('index', index, index === null || index <= count, `null or a number from 0 to ${count}`);
        this.orgChart = moveNode(this.orgChart, id, parentId, index);
      },
    }),
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
