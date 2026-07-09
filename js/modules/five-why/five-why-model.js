/**
 * D.Mike — 5-Why Model (five-why-model.js)
 *
 * Pure state + business logic for the 5-Why root-cause analysis.
 * No DOM, no i18n, no CSS classes, no view getters — those live in the data-fn.
 *
 * Persisted shape (toJSON / fromJSON), unchanged from the legacy module:
 *   { problem: string, nodes: Node[] }
 *
 * Node shape (persisted, unchanged):
 *   { id, level, parentId, question, answer, children: Node[], collapsed }
 *
 * Why levels run 1..5; adding a child beyond level 5 is blocked (root-cause level).
 */

/** Maximum Why level (level 5 == root cause). Exported for use in the data-fn. */
export const MAX_LEVEL = 5;

export class State {
  /** @type {string} the observed problem statement */
  problem = '';
  /** @type {object[]} branching tree of Why nodes */
  nodes = [];
  /** @type {number} instance-scoped auto-increment node id counter */
  _idCounter = 0;

  // ─── Node factory ───────────────────────────────────────────

  /**
   * Create a new tree node (does not attach it).
   * @param {number} level - Why level (1..5)
   * @param {number|null} parentId - Parent node id or null for root
   * @returns {object}
   */
  createNode(level, parentId) {
    return {
      id: ++this._idCounter,
      level,
      parentId,
      question: '',
      answer: '',
      children: [],
      collapsed: false,
    };
  }

  // ─── Lookup ─────────────────────────────────────────────────

  /**
   * Find a node by id anywhere in the tree.
   * @param {number} id
   * @param {object[]} [nodes]
   * @returns {object|null}
   */
  findNode(id, nodes = this.nodes) {
    for (const n of nodes) {
      if (n.id === id) return n;
      const found = this.findNode(id, n.children);
      if (found) return found;
    }
    return null;
  }

  /**
   * Find the array (siblings) that directly contains a node by id.
   * @param {number} id
   * @param {object[]} [nodes]
   * @returns {object[]|null}
   */
  findParentArray(id, nodes = this.nodes) {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) return nodes;
      const found = this.findParentArray(id, nodes[i].children);
      if (found) return found;
    }
    return null;
  }

  /**
   * @param {number} id
   * @returns {boolean} true when the node exists and has at least one child
   */
  nodeHasChildren(id) {
    const n = this.findNode(id);
    return Boolean(n && n.children.length > 0);
  }

  // ─── Tree mutations ─────────────────────────────────────────

  /**
   * Append a new level-1 root Why node.
   * @returns {object} the created node
   */
  addRootWhy() {
    const node = this.createNode(1, null);
    this.nodes.push(node);
    return node;
  }

  /**
   * Append a child to a parent node. Un-collapses the parent.
   * Blocked when the parent is already at level 5.
   * @param {number} parentId
   * @returns {object|null} the created child or null when not added
   */
  addChild(parentId) {
    const parent = this.findNode(parentId);
    if (!parent || parent.level >= MAX_LEVEL) return null;
    parent.collapsed = false;
    const child = this.createNode(parent.level + 1, parentId);
    parent.children.push(child);
    return child;
  }

  /**
   * Remove a node (and its subtree) by id.
   * @param {number} id
   * @returns {boolean} true when a node was removed
   */
  deleteNode(id) {
    const arr = this.findParentArray(id);
    if (!arr) return false;
    const idx = arr.findIndex((n) => n.id === id);
    if (idx === -1) return false;
    arr.splice(idx, 1);
    return true;
  }

  /**
   * Toggle the collapsed flag of a node.
   * @param {number} id
   */
  toggleCollapse(id) {
    const node = this.findNode(id);
    if (node) node.collapsed = !node.collapsed;
  }

  /**
   * Set collapsed state on every node that has children.
   * @param {boolean} collapsed
   * @param {object[]} [nodes]
   */
  setCollapseAll(collapsed, nodes = this.nodes) {
    for (const n of nodes) {
      if (n.children.length > 0) n.collapsed = collapsed;
      this.setCollapseAll(collapsed, n.children);
    }
  }

  // ─── Stats ──────────────────────────────────────────────────

  /**
   * Walk the tree and compute summary stats.
   * @returns {{ totalNodes: number, maxDepth: number, branches: number, answered: number }}
   */
  stats() {
    let totalNodes = 0, maxDepth = 0, branches = 0, answered = 0;
    const walk = (list, depth) => {
      for (const n of list) {
        totalNodes++;
        if (depth > maxDepth) maxDepth = depth;
        if (n.children.length > 1) branches += n.children.length - 1;
        if (String(n.answer || '').trim()) answered++;
        walk(n.children, depth + 1);
      }
    };
    walk(this.nodes, 1);
    return { totalNodes, maxDepth, branches, answered };
  }

  // ─── loadExample guard ──────────────────────────────────────

  /** @returns {boolean} true when a problem or any node is present */
  hasContent() {
    return Boolean(this.problem) || (this.nodes?.length || 0) > 0;
  }

  // ─── Serialization ──────────────────────────────────────────

  toJSON() {
    return {
      problem: this.problem,
      nodes: JSON.parse(JSON.stringify(this.nodes)),
    };
  }

  /**
   * Compute the largest id used in a node tree (to restore the counter).
   * @param {object[]} nodes
   * @returns {number}
   */
  static maxId(nodes) {
    let m = 0;
    for (const n of nodes) {
      if (typeof n.id === 'number' && n.id > m) m = n.id;
      m = Math.max(m, State.maxId(n.children || []));
    }
    return m;
  }

  /**
   * Deserialize, validating each field and always returning a usable default.
   * @param {object|null|undefined} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    if (typeof d.problem === 'string') s.problem = d.problem;
    if (Array.isArray(d.nodes)) {
      s.nodes = JSON.parse(JSON.stringify(d.nodes));
      s._idCounter = State.maxId(s.nodes);
    }
    return s;
  }
}
