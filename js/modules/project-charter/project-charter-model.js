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

/** Create a fresh org node with initialized transient layout fields. */
function makeNode(d) {
  return {
    id: d.id,
    title: d.title ?? '',
    desc: d.desc ?? d.description ?? '',
    pid: d.pid ?? null,
    bg: d.bg || '',
    borderColor: d.borderColor || '',
    borderStyle: d.borderStyle || '',
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
      id: (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `g-${  Math.random().toString(36).slice(2)}`,
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
