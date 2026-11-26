/**
 * D.Mike — 5-Why: Model.
 *
 * Problemtext und Fragebaum. Ein Knoten trägt id, Ebene (1 bis 5), die id des
 * Elternknotens, die Antwort und seine Unterfragen; Ebene 5 ist die
 * Grundursache und hat keine. Welche Knoten eingeklappt sind, steht im
 * Ansichtsfeld `collapsed` (ids). Ohne DOM, ohne i18n.
 *
 * Gespeichert: `{ _schema, problem, nodes, collapsed }`. Dass ids eindeutig
 * sind, jede `parentId` auf den Elternknoten zeigt und `collapsed` nur
 * vorhandene Knoten nennt, sichern die Invarianten — beim Laden repariert,
 * beim Schreiben abgelehnt. Neue ids: größte id + 1.
 */
import {
  defineModel, command, cloneJSON, list, object, text, number, oneOf, boolean,
} from '../../../core/model.js';
import { requireKnownId, requireForm } from '../../../core/validate.js';
import { from0 } from './migrations.js';
import {
  MAX_LEVEL, walk, findNode, allIds, parentIds, nextId, removeSubtree, treeStats,
} from './tree.js';

export { MAX_LEVEL };

/** @typedef {import('./tree.js').TreeNode} TreeNode */

/**
 * Kennzahlen des Fragebaums.
 *
 * @typedef {object} FiveWhyStats
 * @property {number} totalNodes  number of questions in the tree
 * @property {number} maxDepth  deepest level that holds a question, 0 without questions
 * @property {number} branches  for every question with more than one sub-question, their count minus one, summed
 * @property {number} answered  questions whose answer is not blank
 */

/** Eine eigene Kopie der Knotenliste. @param {ReadonlyArray<any>} nodes @returns {TreeNode[]} */
const copyNodes = (nodes) => cloneJSON(/** @type {any} */ (nodes));

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    /** der beobachtete Problemtext */
    problem: text(),
    /** der Fragebaum, Ebene 1 bis 5 ausgeschrieben; Ebene 5 hat keine Unterfragen */
    nodes: list(object({
      id: number({ integer: true, min: 1 }),
      level: oneOf([1]),
      parentId: number({ integer: true, nullable: true }),
      answer: text(),
      children: list(object({
        id: number({ integer: true, min: 1 }),
        level: oneOf([2]),
        parentId: number({ integer: true, nullable: true }),
        answer: text(),
        children: list(object({
          id: number({ integer: true, min: 1 }),
          level: oneOf([3]),
          parentId: number({ integer: true, nullable: true }),
          answer: text(),
          children: list(object({
            id: number({ integer: true, min: 1 }),
            level: oneOf([4]),
            parentId: number({ integer: true, nullable: true }),
            answer: text(),
            children: list(object({
              id: number({ integer: true, min: 1 }),
              level: oneOf([5]),
              parentId: number({ integer: true, nullable: true }),
              answer: text(),
            })),
          })),
        })),
      })),
    }), { bulk: true, bulkKind: 'tree' }),
  },
  view: {
    /** die ids der eingeklappten Knoten */
    collapsed: list(number({ integer: true }), { unique: true }),
  },
  invariants: {
    uniqueIds: {
      fields: ['nodes'],
      test(m) {
        const ids = allIds(m.nodes);
        return new Set(ids).size === ids.length;
      },
      repair(m) {
        const seen = new Set();
        let next = nextId(m._v.nodes);
        walk(m._v.nodes, (n) => {
          if (seen.has(n.id)) n.id = next++;
          seen.add(n.id);
        });
      },
    },
    parentLinks: {
      fields: ['nodes'],
      test(m) {
        let ok = true;
        walk(m.nodes, (n, _d, parent) => { if (n.parentId !== (parent ? parent.id : null)) ok = false; });
        return ok;
      },
      repair(m) {
        walk(m._v.nodes, (n, _d, parent) => { n.parentId = parent ? parent.id : null; });
      },
    },
    knownCollapsed: {
      fields: ['collapsed'],
      test(m) {
        const ids = new Set(allIds(m.nodes));
        return m.collapsed.every((id) => ids.has(id));
      },
      repair(m) {
        const ids = new Set(allIds(m._v.nodes));
        m._v.collapsed = m._v.collapsed.filter((id) => ids.has(id));
      },
    },
  },
  commands: {
    addRoot: command({
      returns: number(),
      run() {
        const id = nextId(this.nodes);
        this.nodes = [...copyNodes(this.nodes), { id, level: 1, parentId: null, answer: '', children: [] }];
        // Eine veraltete id (eines gelöschten Knotens) gilt nicht für den neuen.
        if (this.collapsed.includes(id)) this.collapsed = this.collapsed.filter((x) => x !== id);
        return id;
      },
    }),
    addChild: command({
      params: { parentId: number({ integer: true }) },
      returns: number(),
      run({ parentId }) {
        requireKnownId('parentId', parentId, allIds(this.nodes));
        const nodes = copyNodes(this.nodes);
        const parent = /** @type {TreeNode} */ (findNode(nodes, parentId));
        requireForm('parentId', parentId, parent.level < MAX_LEVEL,
          `the id of a question below level ${MAX_LEVEL}; a root cause has no sub-questions`);
        const id = nextId(nodes);
        const level = parent.level + 1;
        const child = level < MAX_LEVEL
          ? { id, level, parentId, answer: '', children: [] }
          : { id, level, parentId, answer: '' };
        /** @type {TreeNode[]} */ (parent.children).push(child);
        this.nodes = nodes;
        if (this.collapsed.some((x) => x === parentId || x === id)) {
          this.collapsed = this.collapsed.filter((x) => x !== parentId && x !== id);
        }
        return id;
      },
    }),
    setAnswer: command({
      params: { nodeId: number({ integer: true }), text: text() },
      run({ nodeId, text: answer }) {
        requireKnownId('nodeId', nodeId, allIds(this.nodes));
        const nodes = copyNodes(this.nodes);
        /** @type {TreeNode} */ (findNode(nodes, nodeId)).answer = answer;
        this.nodes = nodes;
      },
    }),
    removeNode: command({
      params: { nodeId: number({ integer: true }) },
      confirm({ nodeId }) {
        const node = findNode(this.nodes, nodeId);
        return node && (node.children?.length ?? 0) > 0 ? { key: 'deleteConfirm' } : null;
      },
      run({ nodeId }) {
        requireKnownId('nodeId', nodeId, allIds(this.nodes));
        const nodes = copyNodes(this.nodes);
        const parentId = /** @type {TreeNode} */ (findNode(nodes, nodeId)).parentId;
        const removed = new Set(removeSubtree(nodes, nodeId));
        this.nodes = nodes;
        // Ein Elternknoten ohne Kinder hat nichts mehr einzuklappen.
        const parent = parentId == null ? null : findNode(nodes, parentId);
        if (parent && (parent.children?.length ?? 0) === 0) removed.add(parentId);
        if (this.collapsed.some((x) => removed.has(x))) this.collapsed = this.collapsed.filter((x) => !removed.has(x));
      },
    }),
    toggleCollapse: command({
      params: { nodeId: number({ integer: true, agentWrite: false }) },
      run({ nodeId }) {
        requireKnownId('nodeId', nodeId, allIds(this.nodes));
        this.collapsed = this.collapsed.includes(nodeId)
          ? this.collapsed.filter((x) => x !== nodeId)
          : [...this.collapsed, nodeId];
      },
    }),
    setCollapseAll: command({
      params: { collapsed: boolean({ agentWrite: false }) },
      run({ collapsed }) {
        if (!collapsed) {
          if (this.collapsed.length > 0) this.collapsed = [];
          return;
        }
        const withKids = parentIds(this.nodes);
        this.collapsed = [...this.collapsed, ...withKids.filter((id) => !this.collapsed.includes(id))];
      },
    }),
  },
  derived: {
    /**
     * Kennzahlen des Baums wie in der Statistikleiste.
     *
     * @this {import('./model.types.js').StateModel}
     * @returns {FiveWhyStats}
     */
    stats() {
      return treeStats(/** @type {any} */ (this.nodes));
    },
  },
});
