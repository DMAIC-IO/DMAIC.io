/**
 * D.Mike — Project Charter Model (project-charter-model.js)
 *
 * Pure state + business logic for the Project Charter module:
 * - problemStatement (rich-text Markdown string)
 * - goals[] (description / targetDate / metric / targetValue / achievementLevel)
 * - orgNodes[] (flat org-chart nodes; transient layout fields _col/_h/_x/_y
 *   live on the node objects but are never serialized)
 * - orgStyle (global node/line styling overrides)
 *
 * No DOM, no i18n, no view logic. Persistence shape matches the legacy
 * getState() exactly: { problemStatement, goals, orgChart, orgStyle }.
 */

import { normalizeProblemStatement } from './project-charter-richtext.js';
import { uid } from '../../core/uid.js';

/** Default org chart style values */
export const ORG_STYLE_DEFAULTS = {
  nodeBg: '',
  nodeBorderColor: '',
  nodeBorderStyle: 'solid',
  nodeBorderWidth: 1,
  lineColor: '',
  lineStyle: 'solid',
  lineWidth: 2,
};

/** Per-node style keys (setOrgNodeStyle). */
export const ORG_NODE_STYLE_KEYS = ['bg', 'borderColor', 'borderStyle', 'borderWidth'];

/** Global org style keys (setOrgStyle). */
export const ORG_STYLE_KEYS = Object.keys(ORG_STYLE_DEFAULTS);

const clampWidth = (v) => Math.max(1, Math.min(8, parseInt(v, 10) || 1));

/**
 * Per-node border style: 'solid' is stored as '' (inherit the org chart
 * style), mirroring borderWidth 1 → 0 and the persisted form, which never
 * carries 'solid'. Keeps the in-memory node equal to its reloaded form.
 */
const nodeBorderStyle = (v) => (v && v !== 'solid' ? v : '');

/** Create a fresh org node with initialized transient layout fields. */
function makeNode(d) {
  return {
    id: d.id,
    title: d.title ?? '',
    desc: d.desc ?? d.description ?? '',
    pid: d.pid ?? null,
    bg: d.bg || '',
    borderColor: d.borderColor || '',
    borderStyle: nodeBorderStyle(d.borderStyle),
    borderWidth: d.borderWidth || 0,
    _col: false,
    _h: false,
    _x: 0,
    _y: 0,
  };
}

/**
 * Import org chart data — handles both the flat format and the recursive
 * (children) format. Returns a flat array of normalized node objects.
 * @param {Array} data
 * @returns {Array}
 */
export function importOrgChart(data) {
  if (!Array.isArray(data) || !data.length) return [];

  // Detect recursive format (has `children` key)
  if (data[0].children !== undefined) {
    const flat = [];
    const walk = (nodes, pid) => {
      for (const n of nodes) {
        flat.push(makeNode({
          id: n.id,
          title: n.title ?? '',
          desc: n.description ?? n.desc ?? '',
          pid,
          bg: n.bg || '',
          borderColor: n.borderColor || '',
          borderStyle: n.borderStyle || '',
          borderWidth: n.borderWidth || 0,
        }));
        if (n.children?.length) walk(n.children, n.id);
      }
    };
    walk(data, null);
    return flat;
  }

  // Flat format — normalize internal fields
  return data.map(n => makeNode(n));
}

export class State {
  problemStatement = '';
  /** @type {Array<object>} */
  goals = [];
  /** @type {Array<object>} flat org nodes */
  orgNodes = [];
  /** @type {object} global org chart style overrides */
  orgStyle = { ...ORG_STYLE_DEFAULTS };

  // ─── Goals business logic ──────────────────────────────────

  /** Append a new empty goal and return it. */
  addGoal() {
    const goal = {
      id: uid(),
      description: '',
      targetDate: '',
      metric: '',
      targetValue: '',
      achievementLevel: 0,
    };
    this.goals.push(goal);
    return goal;
  }

  /** Remove a goal by id. */
  deleteGoal(id) {
    this.goals = this.goals.filter(g => g.id !== id);
  }

  /**
   * Move a goal (srcId) relative to a target goal (targetId).
   * @param {string} srcId
   * @param {string} targetId
   * @param {boolean} after - insert after the target instead of before
   */
  reorderGoal(srcId, targetId, after) {
    const srcIdx = this.goals.findIndex(g => g.id === srcId);
    if (srcIdx < 0) return;
    const [moved] = this.goals.splice(srcIdx, 1);
    let targetIdx = this.goals.findIndex(g => g.id === targetId);
    if (targetIdx < 0) {
      this.goals.push(moved);
    } else {
      if (after) targetIdx += 1;
      this.goals.splice(targetIdx, 0, moved);
    }
  }

  // ─── Org chart business logic ──────────────────────────────

  /** Siblings under `pid` (null = roots), in array order. */
  orgSiblings(pid) {
    return this.orgNodes.filter(n => (n.pid ?? null) === (pid ?? null));
  }

  /** True if `targetId` lies in the subtree below `ancestorId`. */
  isOrgDescendant(targetId, ancestorId) {
    for (const c of this.orgNodes.filter(n => n.pid === ancestorId)) {
      if (c.id === targetId || this.isOrgDescendant(targetId, c.id)) return true;
    }
    return false;
  }

  /**
   * Append a node; a collapsed parent is expanded so the new node shows.
   * @param {{ title: string, desc?: string, pid?: string|null }} d
   * @returns {object} the new node
   */
  addOrgNode({ title, desc = '', pid = null }) {
    const node = makeNode({ id: uid(), title, desc, pid });
    this.orgNodes.push(node);
    if (pid) {
      const p = this.orgNodes.find(n => n.id === pid);
      if (p) p._col = false;
    }
    return node;
  }

  /**
   * @param {string} id
   * @param {{ title: string, desc: string }} fields
   * @returns {boolean} false for an unknown id
   */
  updateOrgNode(id, { title, desc }) {
    const n = this.orgNodes.find(x => x.id === id);
    if (!n) return false;
    n.title = title;
    n.desc = desc;
    return true;
  }

  /**
   * Per-node style; borderWidth 1 or invalid → 0 and borderStyle 'solid' → ''
   * (both inherit the global style), borderWidth otherwise clamped to 1..8.
   * @returns {boolean} false for an unknown id or key
   */
  setOrgNodeStyle(id, key, value) {
    const n = this.orgNodes.find(x => x.id === id);
    if (!n || !ORG_NODE_STYLE_KEYS.includes(key)) return false;
    if (key === 'borderWidth') {
      const bw = parseInt(value, 10);
      n.borderWidth = (bw && bw !== 1) ? Math.max(1, Math.min(8, bw)) : 0;
    } else if (key === 'borderStyle') {
      n.borderStyle = nodeBorderStyle(value);
    } else {
      n[key] = value || '';
    }
    return true;
  }

  /**
   * Remove a node with its subtree.
   * @returns {number} removed count (0 for an unknown id)
   */
  deleteOrgNode(id) {
    if (!this.orgNodes.some(n => n.id === id)) return 0;
    const doomed = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of this.orgNodes) {
        if (!doomed.has(n.id) && doomed.has(n.pid)) { doomed.add(n.id); grew = true; }
      }
    }
    this.orgNodes = this.orgNodes.filter(n => !doomed.has(n.id));
    return doomed.size;
  }

  /**
   * Re-parent `id` under `pid` (null = root) at sibling position `index`
   * (0..n; index >= sibling count or null = end).
   * @returns {boolean} false for unknown ids or a cycle
   */
  moveOrgNode(id, pid, index) {
    const node = this.orgNodes.find(n => n.id === id);
    if (!node) return false;
    if (pid != null) {
      if (pid === id || !this.orgNodes.some(n => n.id === pid)) return false;
      if (this.isOrgDescendant(pid, id)) return false;
    }
    const rest = this.orgNodes.filter(n => n.id !== id);
    node.pid = pid ?? null;
    const siblings = rest.filter(n => (n.pid ?? null) === node.pid);
    const at = (index == null || index >= siblings.length) ? null : siblings[Math.max(0, index)];
    if (at) {
      rest.splice(rest.indexOf(at), 0, node);
    } else if (siblings.length) {
      rest.splice(rest.indexOf(siblings[siblings.length - 1]) + 1, 0, node);
    } else {
      rest.push(node);
    }
    this.orgNodes = rest;
    return true;
  }

  /**
   * Global org style; widths clamped to 1..8. Replaces the object so the
   * reactive watcher persists the change.
   * @returns {boolean} false for an unknown key
   */
  setOrgStyle(key, value) {
    if (!ORG_STYLE_KEYS.includes(key)) return false;
    const v = (key === 'nodeBorderWidth' || key === 'lineWidth') ? clampWidth(value) : value;
    this.orgStyle = { ...this.orgStyle, [key]: v };
    return true;
  }

  /**
   * Set a goal field by id, clamping achievementLevel to 0..100.
   * @param {string} id
   * @param {string} field
   * @param {*} value
   */
  setGoalField(id, field, value) {
    const goal = this.goals.find(g => g.id === id);
    if (!goal) return;
    const nextValue = field === 'achievementLevel'
      ? Math.max(0, Math.min(100, parseInt(value, 10) || 0))
      : value;
    goal[field] = nextValue;
  }

  // ─── Content / persistence ─────────────────────────────────

  /** True if any persistable field carries content (for loadExample confirm). */
  hasContent() {
    return Boolean(this.problemStatement)
      || (this.goals?.length || 0) > 0
      || (this.orgNodes?.length || 0) > 0;
  }

  toJSON() {
    return {
      problemStatement: this.problemStatement,
      goals: this.goals.map(g => ({
        id: g.id,
        description: g.description ?? '',
        targetDate: g.targetDate ?? '',
        metric: g.metric ?? '',
        targetValue: g.targetValue ?? '',
        achievementLevel: g.achievementLevel ?? 0,
      })),
      orgChart: this.orgNodes.map(n => {
        const o = { id: n.id, title: n.title, desc: n.desc, pid: n.pid };
        if (n.bg) o.bg = n.bg;
        if (n.borderColor) o.borderColor = n.borderColor;
        if (n.borderStyle && n.borderStyle !== 'solid') o.borderStyle = n.borderStyle;
        if (n.borderWidth && n.borderWidth !== 1) o.borderWidth = n.borderWidth;
        return o;
      }),
      orgStyle: { ...this.orgStyle },
    };
  }

  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;
    s.problemStatement = normalizeProblemStatement(d.problemStatement);
    s.goals = Array.isArray(d.goals) ? d.goals : [];
    s.orgNodes = importOrgChart(d.orgChart);
    s.orgStyle = Object.assign(
      { ...ORG_STYLE_DEFAULTS },
      (d.orgStyle && typeof d.orgStyle === 'object') ? d.orgStyle : {},
    );
    return s;
  }
}
