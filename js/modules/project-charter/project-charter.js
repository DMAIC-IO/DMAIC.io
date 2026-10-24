/**
 * D.Mike — Project Charter Module (project-charter.js)
 *
 * Define phase: rich-text problem statement, numbered goals (target date,
 * metric, target value, goal-achievement level / ZEG), and a canvas-based
 * org chart with pan/zoom, drag, auto-layout, collapse, per-node styling,
 * undo, modebar (zoom/pan/reset/PNG/SVG/editor) and an editor panel.
 *
 * Migrated to createModule + Alpine CSP. The two form sections (problem
 * statement + goals table) are declarative in project-charter.html. The
 * org-chart canvas, modebar, editor panel, color picker and SVG/PNG export
 * are imperative widgets (pointer math + POM byte-parity) mounted in the
 * data-fn init() and disposed in destroy() — see .claude/MODULES.md.
 *
 * Spec: docs/modules/PROJECT-CHARTER.md
 *
 * @agent  Steuerbar über das Viewmodel: Problembeschreibung
 *   (setProblemStatement), Ziele (addGoal, setGoalField, deleteGoal,
 *   moveGoal), Organigramm (addOrgNode, updateOrgNode, setOrgNodeStyle,
 *   deleteOrgNode, moveOrgNode, setOrgStyle), Rückgängig (undo). Gelesen
 *   wird über read() mit erklärter Lesefläche (AgentRead).
 */

import { createModule } from '../../core/template-module.js';
import { State } from './project-charter-model.js';
import { createModebar } from '../../core/chart/modebar.js';
import { DASH_MAP, buildOrgDiagram } from './project-charter-org-diagram.js';
import { edSection, edInlineNum, edSelectRow, edColorPair, openColorPicker } from '../../core/chart/chart-editor.js';
import { h } from '../../core/dom.js';
import { markdownToFragment, domToMarkdown, normalizeProblemStatement } from './project-charter-richtext.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId, requireText, requireNumber } from '../../core/agent/agent-argcheck.js';
import { icon } from '../../core/icon.js';
import { resolveDateOffset } from '../../core/date-offset.js';
import { uid } from '../../core/uid.js';
import { draggableRows } from '../../ui/draggable-list.js';

const NW = 220;   // node width (px)
const HG = 44;    // horizontal gap between sibling subtrees
const VG = 36;    // vertical gap between parent and children
const ORG_PAD = 40;   // padding around content inside the org window (px)
const ORG_MIN_H = 420; // minimum / base height of the org window (px)
const UNDO_MAX = 50;

/**
 * Connector-overlay chart per component root. Kept outside Alpine's reactive
 * proxy: a chart instance holds DOM nodes and must not be made reactive.
 * @type {WeakMap<Element, import('../../core/chart/chart-base.js').default>}
 */
const orgLineCharts = new WeakMap();

/**
 * Rendered org node element per node id, per component root. Outside Alpine's
 * reactive proxy, like orgLineCharts; replaces a data attribute on the node.
 * @type {WeakMap<Element, Map<string, HTMLElement>>}
 */
const orgNodeEls = new WeakMap();

/** Convert stored Markdown content to a DocumentFragment for the editor. */
function prepareFragment(raw) {
  return markdownToFragment(raw);
}

export { prepareFragment };

/** Problem statement limit in plain-text characters (as charCountText counts). */
const PROBLEM_MAX = 10000;

const GOAL_FIELDS = ['description', 'targetDate', 'metric', 'targetValue', 'achievementLevel'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Je Zielfeld der Prüfer; er gibt den Wert in der Form des Models zurück. */
const GOAL_CHECKS = {
  description: (v) => requireText('value', v),
  targetDate: (v) => {
    requireText('value', v);
    if (v !== '' && !ISO_DATE.test(v)) throw new Error(`invalid value ${JSON.stringify(v)}; allowed: "" or a date YYYY-MM-DD`);
    return v;
  },
  metric: (v) => requireText('value', v),
  targetValue: (v) => requireText('value', v),
  achievementLevel: (v) => requireNumber('value', v, { min: 0, max: 100, integer: true }),
};

const NODE_STYLE_PARAM_KEYS = ['bg', 'borderColor', 'borderStyle', 'borderWidth'];
const ORG_STYLE_PARAM_KEYS = ['nodeBg', 'nodeBorderColor', 'nodeBorderStyle', 'nodeBorderWidth', 'lineColor', 'lineStyle', 'lineWidth'];
// Per node "" is drawn solid and inherits the org chart style; the model
// stores an explicit 'solid' as "" too, so 'solid' is no own value here.
const NODE_BORDER_STYLES = ['', 'dashed', 'dotted'];
const LINE_STYLES = ['solid', 'dashed', 'dotted'];

/** Aufzählungsprüfer, der den Wert zurückgibt (requireEnum selbst liefert nichts). */
const enumValue = (allowed) => (v) => { requireEnum('value', v, allowed); return v; };

/** Je Knotenstil-Schlüssel der Prüfer. */
const NODE_STYLE_CHECKS = {
  bg: (v) => requireText('value', v),
  borderColor: (v) => requireText('value', v),
  borderStyle: enumValue(NODE_BORDER_STYLES),
  borderWidth: (v) => requireNumber('value', v, { min: 0, max: 8, integer: true }),
};

/** Je globalem Stilschlüssel der Prüfer. */
const ORG_STYLE_CHECKS = {
  nodeBg: (v) => requireText('value', v),
  nodeBorderColor: (v) => requireText('value', v),
  nodeBorderStyle: enumValue(LINE_STYLES),
  nodeBorderWidth: (v) => requireNumber('value', v, { min: 1, max: 8, integer: true }),
  lineColor: (v) => requireText('value', v),
  lineStyle: enumValue(LINE_STYLES),
  lineWidth: (v) => requireNumber('value', v, { min: 1, max: 8, integer: true }),
};

/**
 * Die Schlüsselfläche von `setGoalField`. Sätze unter `types.GoalFields.<schlüssel>`.
 * @typedef {object} GoalFields
 * @property {string} description  what the goal is
 * @property {string} targetDate  "" or YYYY-MM-DD
 * @property {string} metric  how the goal is measured
 * @property {string} targetValue  the value to reach
 * @property {number} achievementLevel  goal achievement 0..100
 */

/**
 * Die Schlüsselfläche von `setOrgNodeStyle`.
 * @typedef {object} OrgNodeStyle
 * @property {string} bg  background colour, "" inherits
 * @property {string} borderColor  border colour, "" inherits
 * @property {''|'dashed'|'dotted'} borderStyle  border style, "" inherits (drawn solid by default)
 * @property {number} borderWidth  border width 2..8, 0 or 1 inherits
 */

/**
 * Der globale Organigrammstil (`setOrgStyle`, `read().orgStyle`).
 * @typedef {object} OrgStyle
 * @property {string} nodeBg  node background, "" = theme
 * @property {string} nodeBorderColor  node border colour, "" = theme
 * @property {'solid'|'dashed'|'dotted'} nodeBorderStyle  node border style
 * @property {number} nodeBorderWidth  node border width 1..8
 * @property {string} lineColor  connector colour, "" = theme
 * @property {'solid'|'dashed'|'dotted'} lineStyle  connector style
 * @property {number} lineWidth  connector width 1..8
 */

/**
 * @typedef {object} Goal
 * @property {string} id  goal id
 * @property {string} description  what the goal is
 * @property {string} targetDate  "" or YYYY-MM-DD
 * @property {string} metric  how the goal is measured
 * @property {string} targetValue  the value to reach
 * @property {number} achievementLevel  goal achievement 0..100
 */

/**
 * @typedef {object} OrgNode
 * @property {string} id  node id
 * @property {string} title  position or unit
 * @property {string} desc  subtitle, e.g. the person
 * @property {string|null} pid  parent id, null for a root
 * @property {string} [bg]  own background colour
 * @property {string} [borderColor]  own border colour
 * @property {string} [borderStyle]  own border style
 * @property {number} [borderWidth]  own border width
 */

/**
 * Die Agenten-Lesefläche: genau die persistierte Form (`toJSON()`), ohne die
 * transienten Layoutfelder der Knoten.
 * @typedef {object} AgentRead
 * @property {string} problemStatement  the problem statement as Markdown
 * @property {Goal[]} goals  the goals in display order
 * @property {OrgNode[]} orgChart  the org chart, flat; sibling order = array order
 * @property {OrgStyle} orgStyle  the global org chart style
 */

export default createModule({
  config: {
    id: 'project-charter',
    engine: 'alpine',
    phase: 'define',
    icon: 'module.project-charter',
    version: '0.2.0',
    meta: import.meta,
  },
  Model: State,

  beforeLoadExample(data) {
    const result = JSON.parse(JSON.stringify(data));
    if (Array.isArray(result.goals)) {
      result.goals = result.goals.map(g => ({ ...g, targetDate: resolveDateOffset(g.targetDate) }));
    }
    return result;
  },

  data(module, _t) {
    return {
      // Goal row reorder: grip, Alt+Arrow keys and drop = "insert before".
      ...draggableRows({
        onMove({ group, sourceId, targetId }) {
          if (group !== 'goals') return;
          this.moveGoal(sourceId, targetId);
        },
        rowIds(group) {
          return group === 'goals' ? this.model.goals.map(g => g.id) : [];
        },
        t: (key, params) => module._context.i18n.t(key, params),
      }),

      // ── Transient view state (never persisted) ───────────────
      _orgSel: null,
      _orgPan: { x: 0, y: 0 },
      _orgZoom: 1,
      /** Beobachtet die Breite des Org-Fensters (siehe _orgBindPanZoom). */
      _orgResizeObs: null,
      /** Zuletzt beobachtete Breite — nur Breitenänderungen lösen ein Re-Fit aus. */
      _orgLastWidth: 0,
      /** true, sobald der Nutzer selbst geschoben/gezoomt hat — dann kein Auto-Fit mehr. */
      _orgUserAdjusted: false,
      _modebar: null,
      _orgEditorOpen: false,
      _undoStack: [],
      _confirmingDelete: {},
      _confirmTick: 0,

      // ── Modal draft state (bound to the in-template borrowed forms) ──
      nodeDraft: { title: '', desc: '' },
      nodeStyleDraft: {
        title: '', desc: '',
        bg: '', borderColor: '',
        bgDisplay: '', borderColorDisplay: '',
        borderStyle: '', borderWidth: 1,
      },

      // ── Lifecycle: mount/dispose imperative org-chart widgets ─
      /** @noagent lifecycle */
      init() {
        this._undoStack = [];
        this.dragRowsInit();
        // Initial contenteditable content (Alpine must not own it).
        this.$nextTick(() => {
          // Point the framework's _tmpl._state at THIS component's live reactive
          // model so module.getState() reflects the latest edits even after the
          // Alpine root is torn down (the workspace re-persists live instances via
          // getState() on tab switch / re-add — matches legacy behaviour).
          if (module._tmpl) module._tmpl._state = this.model;
          this._syncProblemEditor();
          this._orgMountLines();
          this._orgRender();
          this._orgInitModebar();
          this._orgApplyStyle();
          if (this._orgEditorOpen) this._orgBuildEditor();
          if (this.model.orgNodes.length) {
            requestAnimationFrame(() => this._orgFit());
          }
        });
      },

      /** @noagent lifecycle */
      destroy() {
        this._orgUnmounted = true;
        this.dragRowsDestroy();
        const lines = orgLineCharts.get(this.$root);
        if (lines) { module._context.chartManager.destroy(lines); orgLineCharts.delete(this.$root); }
        orgNodeEls.delete(this.$root);
        if (this._modebar) { this._modebar.destroy(); this._modebar = null; }
        if (this._orgResizeObs) { this._orgResizeObs.disconnect(); this._orgResizeObs = null; }
      },

      // ═══════════════════════════════════════════════════════
      // AGENT SURFACE
      // ═══════════════════════════════════════════════════════

      /** @noagent internal: fill the contenteditable from the model (Alpine does not own it) */
      _syncProblemEditor() {
        const editor = this.$root.querySelector('[data-ref="problemEditor"]');
        if (!editor) return;
        editor.replaceChildren(prepareFragment(this.model.problemStatement));
        editor.classList.toggle('pc__problem-editor--empty', !editor.textContent.trim());
      },

      /**
       * Den vollständigen Zustand lesen: Problembeschreibung, Ziele, Organigramm, Stil.
       * @agent
       * @param {object} [options] `{ fields?: string[] }`
       * @returns {AgentRead} die persistierte Form ohne Layoutfelder
       */
      read(options) {
        const j = this.model.toJSON();
        return readAgentState('project-charter', {
          problemStatement: j.problemStatement,
          goals: j.goals,
          orgChart: this.orgChart(),
          orgStyle: j.orgStyle,
        }, options);
      },

      /** @noagent derived; der Agent liest es über read().orgChart */
      orgChart() { return this.model.toJSON().orgChart; },

      /**
       * Die Problembeschreibung ersetzen.
       * @agent
       * @param {string} markdown die Beschreibung als Markdown (fett, kursiv, Listen), höchstens 10000 Zeichen Klartext
       * @returns {void}
       * @throws {Error} wenn `markdown` kein Text oder zu lang ist
       */
      setProblemStatement(markdown) {
        requireText('markdown', markdown);
        const clean = normalizeProblemStatement(markdown);
        if (markdownToFragment(clean).textContent.length > PROBLEM_MAX) {
          throw new Error(`invalid markdown (too long); allowed: at most ${PROBLEM_MAX} characters`);
        }
        this._pushUndo();
        this._editorUndoPushed = false; // later typing gets its own undo step
        this.model.problemStatement = clean;
        this._syncProblemEditor();
      },

      /** @param {string} title @param {string} desc */
      _checkNodeText(title, desc) {
        requireText('title', title);
        requireText('desc', desc);
        if (!title.trim() || title.length > 100) throw new Error(`invalid title ${JSON.stringify(title)}; allowed: 1 to 100 characters`);
        if (desc.length > 300) throw new Error('invalid desc (too long); allowed: at most 300 characters');
      },

      /**
       * Eine Position anlegen, als Wurzel oder unter einer bestehenden.
       * @agent
       * @param {string} title Bezeichnung der Position, 1 bis 100 Zeichen
       * @param {string} desc Untertitel, z. B. die Person, höchstens 300 Zeichen; "" für keinen
       * @param {string|null} parentId die id des übergeordneten Knotens aus read().orgChart, oder null für eine Wurzel
       * @returns {string} die id des neuen Knotens
       * @throws {Error} bei ungültigem Text oder unbekannter parentId
       */
      addOrgNode(title, desc, parentId) {
        this._checkNodeText(title, desc);
        if (parentId != null) requireKnownId('parentId', parentId, this.orgChart().map(n => n.id));
        this._pushUndo();
        const node = this.model.addOrgNode({ title: title.trim(), desc: desc.trim(), pid: parentId ?? null });
        this._orgRefresh();
        return node.id;
      },

      /**
       * Titel und Untertitel einer Position ändern.
       * @agent
       * @param {string} id die id des Knotens aus read().orgChart
       * @param {string} title Bezeichnung, 1 bis 100 Zeichen
       * @param {string} desc Untertitel, höchstens 300 Zeichen; "" für keinen
       * @returns {void}
       * @throws {Error} bei unbekannter id oder ungültigem Text
       */
      updateOrgNode(id, title, desc) {
        requireKnownId('node', id, this.orgChart().map(n => n.id));
        this._checkNodeText(title, desc);
        this._pushUndo();
        this.model.updateOrgNode(id, { title: title.trim(), desc: desc.trim() });
        this._orgRefresh();
      },

      /**
       * Einen Stilwert einer einzelnen Position setzen.
       * @agent
       * @param {string} id die id des Knotens aus read().orgChart
       * @param {keyof OrgNodeStyle} key welcher Stilwert
       * @param {string|number} value der Wert; Form je Schlüssel siehe `OrgNodeStyle`
       * @returns {void}
       * @throws {Error} bei unbekannter id, unbekanntem Schlüssel oder ungültigem Wert
       */
      setOrgNodeStyle(id, key, value) {
        requireKnownId('node', id, this.orgChart().map(n => n.id));
        requireEnum('key', key, NODE_STYLE_PARAM_KEYS);
        const v = NODE_STYLE_CHECKS[key](value);
        this._pushUndo();
        this.model.setOrgNodeStyle(id, key, v);
        this._orgRefresh();
      },

      /**
       * Eine Position samt allen untergeordneten löschen.
       * @agent
       * @param {string} id die id des Knotens aus read().orgChart
       * @returns {number} Anzahl der gelöschten Knoten
       * @throws {Error} bei unbekannter id
       */
      deleteOrgNode(id) {
        requireKnownId('node', id, this.orgChart().map(n => n.id));
        this._pushUndo();
        const removed = this.model.deleteOrgNode(id);
        if (this._orgSel && !this.model.orgNodes.some(n => n.id === this._orgSel)) this._orgSel = null;
        this._orgRefresh();
        return removed;
      },

      /**
       * Eine Position umhängen und unter ihren neuen Geschwistern einordnen.
       * @agent
       * @param {string} id die id des Knotens aus read().orgChart
       * @param {string|null} parentId der neue übergeordnete Knoten, oder null für eine Wurzel; nicht der Knoten selbst und keiner seiner untergeordneten
       * @param {number|null} index Position unter den neuen Geschwistern (0 = zuerst), oder null für das Ende
       * @returns {void}
       * @throws {Error} bei unbekannter id, Zyklus oder index außerhalb
       */
      moveOrgNode(id, parentId, index) {
        const ids = this.orgChart().map(n => n.id);
        requireKnownId('node', id, ids);
        if (parentId != null) {
          requireKnownId('parentId', parentId, ids);
          if (parentId === id || this.model.isOrgDescendant(parentId, id)) {
            throw new Error(`invalid parentId ${JSON.stringify(parentId)}; allowed: not the node itself or one of its descendants`);
          }
        }
        if (index != null) {
          const n = this.model.orgSiblings(parentId ?? null).filter(s => s.id !== id).length;
          requireNumber('index', index, { min: 0, max: n, integer: true });
        }
        this._pushUndo();
        this.model.moveOrgNode(id, parentId ?? null, index == null ? null : Number(index));
        this._orgRefresh();
      },

      /**
       * Einen Wert des globalen Organigrammstils setzen.
       * @agent
       * @param {keyof OrgStyle} key welcher Stilwert
       * @param {string|number} value der Wert; Form je Schlüssel siehe `OrgStyle`
       * @returns {void}
       * @throws {Error} bei unbekanntem Schlüssel oder ungültigem Wert
       */
      setOrgStyle(key, value) {
        requireEnum('key', key, ORG_STYLE_PARAM_KEYS);
        const v = ORG_STYLE_CHECKS[key](value);
        this._pushUndo();
        this.model.setOrgStyle(key, v);
        this._orgApplyStyle();
        this._orgDrawLines();
        if (this._orgEditorOpen) this._orgBuildEditor();
      },

      /**
       * Den letzten Schritt zurücknehmen (Problembeschreibung, Ziele, Organigramm).
       * Leere Historie ist eine fachliche Absage, kein Fehler.
       * @agent
       * @returns {boolean} true, wenn ein Schritt zurückgenommen wurde; false bei leerer Historie
       */
      undo() {
        if (!this._undoStack.length) return false;
        this._undo();
        return true;
      },

      /**
       * Ein leeres Ziel ans Ende anhängen.
       * @agent
       * @returns {string} die id des neuen Ziels
       */
      addGoal() {
        this._pushUndo();
        const goal = this.model.addGoal();
        this.$nextTick(() => {
          const rows = this.$root.querySelectorAll('.pc__goal-row');
          rows[rows.length - 1]?.querySelector('textarea[data-field="description"]')?.focus();
        });
        return goal.id;
      },

      /**
       * Ein Feld eines Ziels setzen.
       * @agent
       * @param {string} id die id des Ziels aus read().goals
       * @param {keyof GoalFields} key welches Feld
       * @param {string|number} value der Wert; Form je Schlüssel siehe `GoalFields`
       * @returns {void}
       * @throws {Error} bei unbekannter id, unbekanntem Schlüssel oder ungültigem Wert
       */
      setGoalField(id, key, value) {
        requireKnownId('goal', id, this.model.goals.map(g => g.id));
        requireEnum('key', key, GOAL_FIELDS);
        const v = GOAL_CHECKS[key](value);
        this._pushUndo();
        this._fieldUndoPushed = false; // later typing gets its own undo step
        this.model.setGoalField(id, key, v);
      },

      /**
       * Ein Ziel löschen.
       * @agent
       * @param {string} id die id des Ziels aus read().goals
       * @returns {void}
       * @throws {Error} bei unbekannter id
       */
      deleteGoal(id) {
        requireKnownId('goal', id, this.model.goals.map(g => g.id));
        this._pushUndo();
        this.model.deleteGoal(id);
        delete this._confirmingDelete[id];
        this._confirmTick++;
      },

      /**
       * Ein Ziel vor ein anderes schieben oder ans Ende.
       * @agent
       * @param {string} id die id des zu verschiebenden Ziels
       * @param {string|null} beforeId die id des Ziels, vor das es kommt, oder null für das Ende
       * @returns {void}
       * @throws {Error} bei unbekannter id oder wenn beforeId gleich id ist
       */
      moveGoal(id, beforeId) {
        const ids = this.model.goals.map(g => g.id);
        requireKnownId('goal', id, ids);
        if (beforeId != null) {
          requireKnownId('goal', beforeId, ids);
          if (beforeId === id) throw new Error(`invalid beforeId ${JSON.stringify(beforeId)}; allowed: another goal or null`);
        }
        this._pushUndo();
        if (beforeId == null) {
          const last = ids.filter(x => x !== id).pop();
          if (last) this.model.reorderGoal(id, last, true);
        } else {
          this.model.reorderGoal(id, beforeId, false);
        }
      },

      // ═══════════════════════════════════════════════════════
      // PROBLEM STATEMENT (contenteditable, rich-text)
      // ═══════════════════════════════════════════════════════

      /** @noagent DOM event of the editor; the agent uses setProblemStatement */
      problemFocus() { this._editorUndoPushed = false; },

      /** @noagent DOM event of the editor; the agent uses setProblemStatement */
      problemInput(event) {
        const editor = event.target;
        if (!this._editorUndoPushed) { this._pushUndo(); this._editorUndoPushed = true; }
        this.model.problemStatement = domToMarkdown(editor);
        editor.classList.toggle('pc__problem-editor--empty', !editor.textContent.trim());
      },

      /** @noagent DOM event of the editor; the agent uses setProblemStatement */
      problemPaste(event) {
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain');
        if (text) document.execCommand('insertText', false, text);
      },

      /** @noagent DOM event of the editor; the agent uses setProblemStatement */
      fmtMouseDown(cmd, event) {
        event.preventDefault();
        document.execCommand(cmd, false, null);
      },

      /** @noagent view derivation */
      charCountText() {
        const len = markdownToFragment(this.model.problemStatement).textContent.length;
        return _t('charCount', { current: len, max: PROBLEM_MAX });
      },

      // ═══════════════════════════════════════════════════════
      // GOALS
      // ═══════════════════════════════════════════════════════

      /** @noagent view derivation */
      zegClamped(level) {
        return Math.max(0, Math.min(100, parseInt(level, 10) || 0));
      },

      /** @noagent view derivation */
      zegColor(level) {
        const zeg = this.zegClamped(level);
        return zeg === 100 ? 'var(--color-success)'
          : zeg >= 75 ? 'var(--color-info)'
          : zeg >= 25 ? 'var(--color-warning)'
          : 'var(--color-error)';
      },

      /** @noagent view derivation */
      zegBarStyle(level) {
        return `width:${  this.zegClamped(level)  }%; background:${  this.zegColor(level)}`;
      },

      /** @noagent view derivation */
      isDateInPast(date) {
        return Boolean(date) && new Date(date) < new Date(new Date().toDateString());
      },

      /** @noagent DOM event */
      autoGrow(event) {
        const el = event.target;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight  }px`;
      },

      // Reset the per-edit undo guard whenever focus enters a goal field, so
      // each distinct edit (after a focus) pushes its own undo snapshot
      // (matches legacy per-input focus reset).
      /** @noagent DOM event */
      goalFieldFocus() { this._fieldUndoPushed = false; },

      /** @noagent DOM event after x-model; the agent uses setGoalField */
      goalChanged(id, field, event) {
        if (!this._fieldUndoPushed) { this._pushUndo(); this._fieldUndoPushed = true; }
        // x-model already wrote the raw string to the model; re-apply
        // through the model so achievementLevel is clamped.
        this.model.setGoalField(id, field, event.target.value);
      },

      // delete (two-click confirm)
      /** @noagent view derivation */
      isConfirmingDelete(id) {
        this._confirmTick; // reactive dependency
        return Boolean(this._confirmingDelete[id]);
      },

      /** @noagent two-click confirmation; the agent uses deleteGoal */
      goalDeleteClick(id, event) {
        if (this._confirmingDelete[id]) {
          this.deleteGoal(id);
        } else {
          this._confirmingDelete[id] = true;
          this._confirmTick++;
          const row = event.target.closest('.pc__goal-row');
          const cancel = (e) => {
            if (!row || !row.contains(e.target)) {
              delete this._confirmingDelete[id];
              this._confirmTick++;
              document.removeEventListener('click', cancel);
            }
          };
          setTimeout(() => document.addEventListener('click', cancel), 0);
        }
      },

      // ═══════════════════════════════════════════════════════
      // ORG CHART — imperative canvas (pan/zoom/drag/layout)
      // ═══════════════════════════════════════════════════════

      /** @noagent only opens the dialog; the agent uses addOrgNode */
      orgAddRoot() { this._orgOpenAdd(null); },
      /** @noagent re-arrange and fit the view */
      orgLayoutBtn() { this._orgRefresh(); requestAnimationFrame(() => this._orgFit()); },
      /** @noagent view derivation */
      canUndo() { this._confirmTick; return this._undoStack.length > 0; },

      _orgEl(id) {
        return orgNodeEls.get(this.$root)?.get(id);
      },

      _orgChildren(pid) {
        return this.model.orgNodes.filter(n => n.pid === pid && !n._h);
      },

      _orgNodeHeight(id) {
        const el = this._orgEl(id);
        return el ? el.offsetHeight : 70;
      },

      _orgSubtreeWidth(id) {
        const n = this.model.orgNodes.find(x => x.id === id);
        if (!n || n._col) return NW;
        const ch = this._orgChildren(id);
        if (!ch.length) return NW;
        let w = 0;
        ch.forEach((c, i) => {
          w += this._orgSubtreeWidth(c.id);
          if (i < ch.length - 1) w += HG;
        });
        return Math.max(NW, w);
      },

      _orgLayNode(id, x, y) {
        const n = this.model.orgNodes.find(nd => nd.id === id);
        if (!n) return;
        n._x = x; n._y = y;
        const ch = this._orgChildren(id);
        if (!ch.length || n._col) return;
        const cy = y + this._orgNodeHeight(id) + VG;
        const ws = ch.map(c => this._orgSubtreeWidth(c.id));
        let total = 0;
        ws.forEach((w, i) => { total += w; if (i < ws.length - 1) total += HG; });
        let cx = x + NW / 2 - total / 2;
        ch.forEach((nd, i) => {
          this._orgLayNode(nd.id, cx + ws[i] / 2 - NW / 2, cy);
          cx += ws[i] + HG;
        });
      },

      _orgLayoutAll() {
        this.model.orgNodes.forEach(n => n._h = false);
        const markHidden = (pid) => {
          const p = this.model.orgNodes.find(n => n.id === pid);
          if (!p || !p._col) return;
          this.model.orgNodes.filter(n => n.pid === pid).forEach(c => {
            c._h = true;
            markHidden(c.id);
          });
        };
        this.model.orgNodes.forEach(n => { if (n._col) markHidden(n.id); });

        const roots = this.model.orgNodes.filter(n => n.pid === null && !n._h);
        let ox = 0;
        roots.forEach(r => {
          const w = this._orgSubtreeWidth(r.id);
          this._orgLayNode(r.id, ox + w / 2 - NW / 2, 60);
          ox += w + HG * 2;
        });
      },

      _orgRenderNodes() {
        const canvas = this.$root.querySelector('[data-ref="orgCanvas"]');        if (!canvas) return;
        canvas.querySelectorAll('.pc__org-node').forEach(e => e.remove());
        const els = new Map();
        orgNodeEls.set(this.$root, els);

        const visible = this.model.orgNodes.filter(n => !n._h);
        visible.forEach(n => {
          const childCount = this.model.orgNodes.filter(c => c.pid === n.id).length;
          const isSel = n.id === this._orgSel;

          const div = document.createElement('div');
          div.className = `pc__org-node${  isSel ? ' pc__org-node--sel' : ''}`;
          div.style.left = `${n._x  }px`;
          div.style.top = `${n._y  }px`;
          div.style.width = `${NW  }px`;
          if (n.bg) div.style.background = n.bg;
          if (n.borderColor) div.style.borderColor = n.borderColor;
          if (n.borderStyle) div.style.borderStyle = n.borderStyle;
          if (n.borderWidth) div.style.borderWidth = `${n.borderWidth  }px`;

          // Native ParentNode.append() coerces a bare null child into a "null"
          // text node — so an empty subtitle (n.desc) must be filtered out here,
          // not passed as null. filter(Boolean) drops the absent-subtitle slot.
          div.append(...[
            h('div', { class: 'pc__org-dot-t' }),
            h('div', { class: 'pc__org-node-title' }, n.title),
            n.desc ? h('div', { class: 'pc__org-node-desc' }, n.desc) : null,
            h('div', { class: 'pc__org-node-bar' },
              h('button', { class: 'pc__org-node-btn', 'data-action': 'add', title: _t('addChild') },
                icon('action.add', { cls: 'pc__org-node-ico' })),
              h('button', { class: 'pc__org-node-btn', 'data-action': 'edit', title: module._context.i18n.t('common.edit') },
                icon('action.edit', { cls: 'pc__org-node-ico' })),
              childCount
                ? h('button', { class: 'pc__org-node-btn', 'data-action': 'toggle' },
                    icon(n._col ? 'nav.expand-down' : 'nav.collapse-up', { cls: 'pc__org-node-ico' }),
                    n._col ? String(childCount) : null)
                : null,
              h('button', { class: 'pc__org-node-btn pc__org-node-btn--del', 'data-action': 'del', title: module._context.i18n.t('common.delete') },
                icon('action.delete', { cls: 'pc__org-node-ico' })),
            ),
            h('div', { class: 'pc__org-dot-b' }),
          ].filter(Boolean));

          div.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.pc__org-node-btn')) return;
            e.stopPropagation();
            this._orgSelect(n.id);
            this._orgStartDrag(n.id, e);
          });

          div.querySelectorAll('.pc__org-node-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              const action = btn.dataset.action;
              if (action === 'add') this._orgOpenAdd(n.id);
              else if (action === 'edit') this._orgOpenEdit(n.id);
              else if (action === 'toggle') this._orgToggleCollapse(n.id);
              else if (action === 'del') this._orgDeleteNode(n.id);
            });
          });

          canvas.appendChild(div);
          els.set(n.id, div);
        });

        const empty = this.$root.querySelector('[data-ref="orgEmpty"]');
        if (empty) empty.classList.toggle('pc__org-empty--hidden', this.model.orgNodes.length > 0);
      },

      _orgPosDom() {
        this.model.orgNodes.filter(n => !n._h).forEach(n => {
          const el = this._orgEl(n.id);
          if (el) { el.style.left = `${n._x  }px`; el.style.top = `${n._y  }px`; }
        });
      },

      /** Create the links-only node-diagram that draws the connector lines. */
      _orgMountLines() {
        const host = this.$root.querySelector('[data-ref="orgLines"]');
        if (!host) return;
        const root = this.$root;
        const cm = module._context.chartManager;
        cm.create(host, 'node-diagram', {
          showModebar: false, origin: 'zero', padding: 0,
          nodes: [], links: [], highlightClass: 'pc__org-line--hl',
        }).then((chart) => {
          if (!chart) return;
          // Unmounted while the type was loading: do not keep an orphan.
          if (this._orgUnmounted || !root.isConnected) { cm.destroy(chart); return; }
          orgLineCharts.set(root, chart);
          this._orgDrawLines();
        });
      },

      _orgDrawLines() {
        const chart = orgLineCharts.get(this.$root);
        if (!chart) return;
        const { links } = buildOrgDiagram(this.model.orgNodes, this.model.orgStyle, this._orgHeights(),
          { selectedId: this._orgSel, width: NW });
        module._context.chartManager.update(chart, { links });
      },

      _orgApplyTransform() {
        const canvas = this.$root.querySelector('[data-ref="orgCanvas"]');
        if (!canvas) return;
        canvas.style.transform = `translate(${this._orgPan.x}px,${this._orgPan.y}px) scale(${this._orgZoom})`;
      },

      /** Full org render: layout, nodes, lines, transform, pan/zoom binding. */
      _orgRender() {
        this._orgRenderNodes();
        this._orgLayoutAll();
        this._orgPosDom();
        this._orgDrawLines();
        this._orgUpdateWrapHeight();
        this._orgApplyStyle();
        if (!this._panZoomBound) { this._orgBindPanZoom(); this._panZoomBound = true; }
      },

      /** Re-layout, re-render nodes, re-draw lines (after a mutation). */
      _orgRefresh() {
        this._orgLayoutAll();
        this._orgRenderNodes();
        requestAnimationFrame(() => {
          this._orgLayoutAll();
          this._orgPosDom();
          this._orgDrawLines();
          this._orgUpdateWrapHeight();
        });
      },

      // ─── Pan / Zoom ─────────────────────────────────────────

      _orgBindPanZoom() {
        const wrap = this.$root.querySelector('[data-ref="orgWrap"]');
        if (!wrap) return;
        let panning = false, startX = 0, startY = 0;

        wrap.addEventListener('pointerdown', (e) => {
          if (e.target.closest('.pc__org-node')) return;
          panning = true;
          startX = e.clientX - this._orgPan.x;
          startY = e.clientY - this._orgPan.y;
          this._orgDeselect();
        });
        const onMove = (e) => {
          if (!panning) return;
          this._orgUserAdjusted = true;
          this._orgPan.x = e.clientX - startX;
          this._orgPan.y = e.clientY - startY;
          this._orgApplyTransform();
        };
        const onUp = () => { panning = false; };
        wrap.addEventListener('pointermove', onMove);
        wrap.addEventListener('pointerup', onUp);
        wrap.addEventListener('pointerleave', onUp);
        wrap.addEventListener('wheel', (e) => {
          e.preventDefault();
          this._orgUserAdjusted = true;
          const rect = wrap.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const oz = this._orgZoom;
          this._orgZoom = Math.min(3, Math.max(0.1, this._orgZoom * (e.deltaY > 0 ? 0.92 : 1.08)));
          this._orgPan.x = mx - (mx - this._orgPan.x) * (this._orgZoom / oz);
          this._orgPan.y = my - (my - this._orgPan.y) * (this._orgZoom / oz);
          this._orgUpdateWrapHeight();
        }, { passive: false });

        // Neu einpassen, wenn sich die Breite des Fensters ändert.
        //
        // `_orgFit()` leitet Zoom UND Pan aus `wrap.clientWidth` ab, lief aber
        // nur einmal beim Mount in einem einzelnen requestAnimationFrame. Landet
        // das, bevor das Split-Panel seine Endbreite hat, sitzt das Organigramm
        // dauerhaft verschoben und falsch skaliert — sichtbar für Nutzer beim
        // Öffnen in einem schmalen Fenster, und als lastabhängig fehlschlagender
        // Visual-Test.
        //
        // NUR auf Breitenänderungen reagieren: `_orgFit()` ruft
        // `_orgUpdateWrapHeight()`, das `wrap.style.height` setzt — auf jede
        // Höhenänderung zu reagieren wäre eine Endlosschleife.
        //
        // Nach manuellem Schieben/Zoomen bleibt die Nutzeransicht stehen; der
        // „Ausrichten"-Knopf ruft `_orgFit()` und gibt die Automatik wieder frei.
        if (typeof ResizeObserver === 'function') {
          this._orgLastWidth = wrap.clientWidth;
          this._orgResizeObs = new ResizeObserver(() => {
            const w = wrap.clientWidth;
            if (w === this._orgLastWidth) return;
            this._orgLastWidth = w;
            if (this._orgUserAdjusted) return;
            this._orgFit();
          });
          this._orgResizeObs.observe(wrap);
        }
      },

      _orgZoomIn() {
        const wrap = this.$root.querySelector('[data-ref="orgWrap"]');
        if (!wrap) return;
        this._orgUserAdjusted = true;
        const cx = wrap.clientWidth / 2, cy = wrap.clientHeight / 2;
        const oz = this._orgZoom;
        this._orgZoom = Math.min(3, this._orgZoom * 1.2);
        this._orgPan.x = cx - (cx - this._orgPan.x) * (this._orgZoom / oz);
        this._orgPan.y = cy - (cy - this._orgPan.y) * (this._orgZoom / oz);
        this._orgUpdateWrapHeight();
      },

      _orgFit() {
        const wrap = this.$root.querySelector('[data-ref="orgWrap"]');
        if (!wrap || !this.model.orgNodes.length) return;
        const visible = this.model.orgNodes.filter(n => !n._h);
        if (!visible.length) return;

        // Einpassen ist die Rückkehr zur automatischen Ansicht — ab hier darf
        // eine Breitenänderung wieder neu einpassen.
        this._orgUserAdjusted = false;
        this._orgLastWidth = wrap.clientWidth;

        let x1 = Infinity, x2 = -Infinity;
        visible.forEach(n => {
          x1 = Math.min(x1, n._x);
          x2 = Math.max(x2, n._x + NW);
        });
        const tw = x2 - x1;
        const aw = wrap.clientWidth - ORG_PAD * 2;
        // Fit horizontally only — never scale down to squeeze the height into a
        // fixed box. The window grows vertically to fit the content instead
        // (see _orgUpdateWrapHeight), so the vertical axis is never a
        // constraint and nothing is clipped. Cap at 1 to keep natural size.
        this._orgZoom = Math.max(0.1, Math.min(1, aw / tw));
        this._orgPan.x = (wrap.clientWidth - tw * this._orgZoom) / 2 - x1 * this._orgZoom;
        this._orgUpdateWrapHeight();
      },

      /**
       * Size the org-chart window to its laid-out content so it grows
       * vertically instead of clipping at a fixed height. The vertical offset
       * is pinned to the top padding (content is always fully visible on the
       * vertical axis); horizontal pan/zoom stay user-controlled. Called after
       * every layout change (add / remove / collapse / zoom / fit).
       */
      _orgUpdateWrapHeight() {
        const wrap = this.$root.querySelector('[data-ref="orgWrap"]');
        if (!wrap) return;
        const visible = this.model.orgNodes.filter(n => !n._h);
        if (!visible.length) {
          wrap.style.height = '';   // empty → fall back to CSS min-height
          this._orgApplyTransform();
          return;
        }
        let y1 = Infinity, y2 = -Infinity;
        visible.forEach(n => {
          const nodeH = this._orgNodeHeight(n.id);
          y1 = Math.min(y1, n._y);
          y2 = Math.max(y2, n._y + nodeH);
        });
        const contentH = (y2 - y1) * this._orgZoom;
        wrap.style.height = `${Math.max(ORG_MIN_H, contentH + ORG_PAD * 2)}px`;
        this._orgPan.y = ORG_PAD - y1 * this._orgZoom;
        this._orgApplyTransform();
      },

      // ─── Drag ───────────────────────────────────────────────

      _orgStartDrag(id, ev) {
        const n = this.model.orgNodes.find(x => x.id === id);
        if (!n) return;
        const startX = ev.clientX, startY = ev.clientY;
        const origX = n._x, origY = n._y;
        let moved = false, siblingReordered = false, undoPushed = false;
        const wrap = this.$root.querySelector('[data-ref="orgWrap"]');

        const onMove = (e) => {
          const dx = (e.clientX - startX) / this._orgZoom;
          const dy = (e.clientY - startY) / this._orgZoom;
          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
          if (!moved) return;
          if (!undoPushed) { this._pushUndo(); undoPushed = true; }
          n._x = origX + dx;
          n._y = origY + dy;
          const el = this._orgEl(id);
          if (el) {
            el.style.left = `${n._x  }px`;
            el.style.top = `${n._y  }px`;
            el.classList.add('pc__org-node--drag');
          }
          if (wrap && !wrap.classList.contains('pc__org-wrap--reordering')) {
            wrap.classList.add('pc__org-wrap--reordering');
          }
          siblingReordered = this._orgTryReorderSiblings(id) || siblingReordered;
          if (!this._orgIsNearSiblings(id)) siblingReordered = false;
          this._orgDrawLines();
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          const el = this._orgEl(id);
          if (el) el.classList.remove('pc__org-node--drag');
          if (wrap) wrap.classList.remove('pc__org-wrap--reordering');
          this._orgHideDropIndicator();
          if (moved) {
            if (!siblingReordered) this._orgReparent(id);
            this._orgRefresh();
          }
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      },

      _orgTryReorderSiblings(dragId) {
        const dragNode = this.model.orgNodes.find(n => n.id === dragId);
        if (!dragNode) return false;
        const pid = dragNode.pid;
        const siblings = this.model.orgNodes.filter(n => n.pid === pid && !n._h);
        if (siblings.length < 2) { this._orgHideDropIndicator(); return false; }

        const dragCenterX = dragNode._x + NW / 2;
        const others = siblings.filter(n => n.id !== dragId);
        if (others.length > 0) {
          const refY = others[0]._y;
          const refH = this._orgNodeHeight(others[0].id);
          const tolerance = refH + VG / 2;
          if (Math.abs(dragNode._y - refY) > tolerance) {
            this._orgHideDropIndicator();
            return false;
          }
        }
        let insertIdx = others.length;
        for (let i = 0; i < others.length; i++) {
          if (dragCenterX < others[i]._x + NW / 2) { insertIdx = i; break; }
        }
        const desired = [...others];
        desired.splice(insertIdx, 0, dragNode);
        const changed = desired.some((n, i) => n.id !== siblings[i].id);
        this._orgShowDropIndicator(dragId, pid, insertIdx, others);
        if (!changed) return false;

        const sibIndices = [];
        this.model.orgNodes.forEach((n, i) => {
          if (siblings.some(s => s.id === n.id)) sibIndices.push(i);
        });
        desired.forEach((node, i) => { this.model.orgNodes[sibIndices[i]] = node; });

        const savedX = dragNode._x, savedY = dragNode._y;
        this._orgLayoutAll();
        dragNode._x = savedX;
        dragNode._y = savedY;
        this._orgPosDom();
        return true;
      },

      _orgShowDropIndicator(dragId, pid, insertIdx, others) {
        let indicator = this.$root.querySelector('.pc__org-drop-line');
        if (!indicator) {
          indicator = document.createElement('div');
          indicator.className = 'pc__org-drop-line';
          this.$root.querySelector('[data-ref="orgCanvas"]')?.appendChild(indicator);
        }
        if (others.length === 0) { indicator.style.display = 'none'; return; }
        let gapX;
        if (insertIdx === 0) {
          gapX = others[0]._x - HG / 2;
        } else if (insertIdx >= others.length) {
          gapX = others[others.length - 1]._x + NW + HG / 2;
        } else {
          gapX = (others[insertIdx - 1]._x + NW + others[insertIdx]._x) / 2;
        }
        const refNode = others[0];
        const refEl = this._orgEl(refNode.id);
        const nodeH = refEl ? refEl.offsetHeight : 70;
        indicator.style.left = `${gapX - 1  }px`;
        indicator.style.top = `${refNode._y  }px`;
        indicator.style.height = `${nodeH  }px`;
        indicator.style.display = 'block';
      },

      _orgHideDropIndicator() {
        const indicator = this.$root.querySelector('.pc__org-drop-line');
        if (indicator) indicator.style.display = 'none';
      },

      _orgIsNearSiblings(dragId) {
        const dragNode = this.model.orgNodes.find(n => n.id === dragId);
        if (!dragNode) return false;
        const siblings = this.model.orgNodes.filter(n => n.pid === dragNode.pid && !n._h && n.id !== dragId);
        if (!siblings.length) return false;
        const refY = siblings[0]._y;
        const refH = this._orgNodeHeight(siblings[0].id);
        return Math.abs(dragNode._y - refY) <= refH + VG / 2;
      },

      _orgReparent(id) {
        const n = this.model.orgNodes.find(x => x.id === id);
        const el = this._orgEl(id);
        if (!n || !el) return;
        for (const o of this.model.orgNodes) {
          if (o.id === id || o._h || o.id === n.pid) continue;
          if (this.model.isOrgDescendant(o.id, id)) continue;
          const oe = this._orgEl(o.id);
          if (!oe) continue;
          if (n._x < o._x + NW && n._x + NW > o._x &&
              n._y < o._y + oe.offsetHeight && n._y + el.offsetHeight > o._y) {
            this.model.moveOrgNode(id, o.id, null);
            return;
          }
        }
      },

      // ─── Select ─────────────────────────────────────────────

      _orgSelect(id) {
        this._orgSel = id;
        for (const [nid, el] of orgNodeEls.get(this.$root) || []) {
          el.classList.toggle('pc__org-node--sel', nid === id);
        }
        this._orgDrawLines();
      },

      _orgDeselect() {
        this._orgSel = null;
        this.$root.querySelectorAll('.pc__org-node').forEach(e =>
          e.classList.remove('pc__org-node--sel'));
        this._orgDrawLines();
      },

      // ─── CRUD (modals) ──────────────────────────────────────

      async _orgOpenAdd(parentId) {
        const t = (k, p) => _t(k, p);
        const parent = parentId ? this.model.orgNodes.find(n => n.id === parentId) : null;
        const heading = parent
          ? `${t('addChild')} — ${parent.title}`
          : t('orgNew');

        this.nodeDraft.title = '';
        this.nodeDraft.desc = '';

        await module._context.dialog.form({
          title: heading,
          content: this.$refs.nodeForm,
          confirmLabel: module._context.i18n.t('common.save'),
          onMount: (el) => el.querySelector('[data-field="title"]')?.focus(),
          onConfirm: (el) => {
            const title = this.nodeDraft.title.trim();
            if (!title) { el.querySelector('[data-field="title"]')?.focus(); return false; }
            const newId = this.addOrgNode(title, this.nodeDraft.desc, parentId ?? null);
            this._orgSelect(newId);
            requestAnimationFrame(() => this._orgFit());
            return true;
          },
        });
      },

      /** Open the colour picker for a node-style swatch, writing the chosen
       *  colour (and its display value) back into nodeStyleDraft.
       *  @noagent colour picker in the dialog */
      nodeStylePickColor(which, event) {
        const d = this.nodeStyleDraft;
        const cur = which === 'bg'
          ? (d.bg || d.bgDisplay)
          : (d.borderColor || d.borderColorDisplay);
        openColorPicker(event, cur, (c) => {
          if (which === 'bg') { d.bg = c; d.bgDisplay = c; }
          else { d.borderColor = c; d.borderColorDisplay = c; }
        });
      },

      async _orgOpenEdit(id) {
        const n = this.model.orgNodes.find(x => x.id === id);
        if (!n) return;

        const cs = getComputedStyle(document.documentElement);
        const defBg = this.model.orgStyle.nodeBg || cs.getPropertyValue('--color-bg-secondary').trim() || '#f8fafc';
        const defBorder = this.model.orgStyle.nodeBorderColor || cs.getPropertyValue('--color-border-secondary').trim() || '#e2e8f0';

        const d = this.nodeStyleDraft;
        d.title = n.title;
        d.desc = n.desc;
        d.bg = n.bg || '';
        d.borderColor = n.borderColor || '';
        d.bgDisplay = n.bg || defBg;
        d.borderColorDisplay = n.borderColor || defBorder;
        d.borderStyle = n.borderStyle || this.model.orgStyle.nodeBorderStyle || '';
        d.borderWidth = n.borderWidth || this.model.orgStyle.nodeBorderWidth || 1;

        await module._context.dialog.form({
          title: module._context.i18n.t('common.edit'),
          content: this.$refs.nodeStyleForm,
          confirmLabel: module._context.i18n.t('common.save'),
          onMount: (el) => el.querySelector('[data-field="title"]')?.focus(),
          onConfirm: () => {
            const title = d.title.trim();
            if (!title) return false;
            this._pushUndo();
            this.model.updateOrgNode(id, { title, desc: d.desc.trim() });
            this.model.setOrgNodeStyle(id, 'bg', d.bg);
            this.model.setOrgNodeStyle(id, 'borderColor', d.borderColor);
            this.model.setOrgNodeStyle(id, 'borderStyle', d.borderStyle);
            this.model.setOrgNodeStyle(id, 'borderWidth', d.borderWidth);
            this._orgRefresh();
            return true;
          },
        });
      },

      async _orgDeleteNode(id) {
        const t = (k, p) => _t(k, p);
        const node = this.model.orgNodes.find(n => n.id === id);
        if (!node) return;
        const confirmed = await module._context.dialog.confirm({
          message: t('orgDeleteConfirm', { name: node.title || t('nodeTitle') }),
          danger: true,
        });
        if (!confirmed) return;
        this.deleteOrgNode(id);
      },

      _orgToggleCollapse(id) {
        const n = this.model.orgNodes.find(x => x.id === id);
        if (n) {
          n._col = !n._col;
          this._orgRefresh();
        }
      },

      // ─── Modebar ────────────────────────────────────────────

      _orgInitModebar() {
        if (this._modebar) { this._modebar.destroy(); this._modebar = null; }
        const wrap = this.$root.querySelector('[data-ref="orgWrap"]');
        if (!wrap) return;
        this._modebar = createModebar({
          onZoom: () => this._orgZoomIn(),
          onPan: () => {},
          onReset: () => this._orgFit(),
          onExportPNG: () => this._orgExportPNG(),
          onExportSVG: () => this._orgExportSVG(),
          onEditorToggle: (isOpen) => {
            this._orgEditorOpen = isOpen;
            const panel = this.$root.querySelector('[data-ref="orgEditor"]');
            if (panel) panel.classList.toggle('pc__org-editor--open', isOpen);
            if (isOpen) this._orgBuildEditor();
          },
        });
        if (this._orgEditorOpen) this._modebar.setEditorOpen(true);
        wrap.appendChild(this._modebar.el);
      },

      // ─── Editor panel ───────────────────────────────────────

      _orgApplyStyle() {
        const section = this.$root.querySelector('.pc__org-section');
        if (!section) return;
        const s = this.model.orgStyle;
        const setOrRemove = (name, val) => {
          if (val) section.style.setProperty(name, val);
          else section.style.removeProperty(name);
        };
        setOrRemove('--pc-org-node-bg', s.nodeBg);
        setOrRemove('--pc-org-node-border-color', s.nodeBorderColor);
        section.style.setProperty('--pc-org-node-border-style', s.nodeBorderStyle || 'solid');
        section.style.setProperty('--pc-org-node-border-width', `${s.nodeBorderWidth  }px`);
        setOrRemove('--pc-org-line-color', s.lineColor);
        section.style.setProperty('--pc-org-line-width', String(s.lineWidth));
        section.style.setProperty('--pc-org-line-dasharray', DASH_MAP[s.lineStyle] || 'none');
      },

      _orgBuildEditor() {
        const inner = this.$root.querySelector('[data-ref="orgEditorInner"]');
        if (!inner) return;
        inner.replaceChildren();

        const t = (key) => _t(`editor.${  key}`);
        const style = this.model.orgStyle;
        let editorUndoPushed = false;
        const ensureUndo = () => { if (!editorUndoPushed) { this._pushUndo(); editorUndoPushed = true; } };
        const apply = () => { this._orgApplyStyle(); this._orgDrawLines(); };
        const set = (key) => (v) => { ensureUndo(); this.model.setOrgStyle(key, v); };

        const resolveColor = (value, cssProp) => {
          if (value) return value;
          const cs = getComputedStyle(document.documentElement);
          return cs.getPropertyValue(cssProp).trim() || 'rgba(255,255,255,1)';
        };

        const colorRow = (label, value, cssProp, onChange) => {
          const current = resolveColor(value, cssProp);
          const { el, swatch } = edColorPair(label, current, (e) => {
            openColorPicker(e, resolveColor(value, cssProp), (c) => {
              onChange(c);
              swatch.style.background = c;
              apply();
            });
          });
          return el;
        };

        const styleOpts = [
          { value: 'solid', label: t('solid') },
          { value: 'dashed', label: t('dashed') },
          { value: 'dotted', label: t('dotted') },
        ];

        const nodeSec = edSection(t('nodeAppearance'));
        nodeSec.appendChild(colorRow(t('bgColor'), style.nodeBg, '--color-bg-secondary', set('nodeBg')));
        nodeSec.appendChild(colorRow(t('borderColor'), style.nodeBorderColor, '--color-border-secondary', set('nodeBorderColor')));
        nodeSec.appendChild(edSelectRow(t('borderStyle'), styleOpts, style.nodeBorderStyle, (v) => { set('nodeBorderStyle')(v); apply(); }));
        nodeSec.appendChild(edInlineNum(t('borderWidth'), style.nodeBorderWidth, (v) => { set('nodeBorderWidth')(v); apply(); }, 1, 8, 1));
        inner.appendChild(nodeSec);

        const lineSec = edSection(t('connectorLines'));
        lineSec.appendChild(colorRow(t('lineColor'), style.lineColor, '--color-border-secondary', set('lineColor')));
        lineSec.appendChild(edSelectRow(t('lineStyle'), styleOpts, style.lineStyle, (v) => { set('lineStyle')(v); apply(); }));
        lineSec.appendChild(edInlineNum(t('lineWidth'), style.lineWidth, (v) => { set('lineWidth')(v); apply(); }, 1, 8, 1));
        inner.appendChild(lineSec);
      },

      // ─── SVG / PNG export ───────────────────────────────────

      /** Rendered heights of the visible nodes (the layout is measured from the DOM). */
      _orgHeights() {
        return new Map(this.model.orgNodes.filter(n => !n._h).map(n => [n.id, this._orgNodeHeight(n.id)]));
      },

      /** Image export through the chart framework (theme-aware). */
      async _orgExportImage(fmt) {
        if (!this.model.orgNodes.some(n => !n._h)) return;
        const diagram = buildOrgDiagram(this.model.orgNodes, this.model.orgStyle, this._orgHeights(),
          { selectedId: null, width: NW });
        await module._context.chartManager.exportOffscreen('node-diagram', { ...diagram, padding: 30 }, fmt, 'organigramm');
      },

      _orgExportPNG() { return this._orgExportImage('png'); },
      _orgExportSVG() { return this._orgExportImage('svg'); },

      // ─── Undo ───────────────────────────────────────────────

      _pushUndo() {
        this._undoStack.push(JSON.stringify(this.model.toJSON()));
        if (this._undoStack.length > UNDO_MAX) this._undoStack.shift();
        this._confirmTick++; // refresh undo-button disabled state
      },

      _undo() {
        if (!this._undoStack.length) return;
        const snapshot = JSON.parse(this._undoStack.pop());
        const restored = State.fromJSON(snapshot);
        this.model.problemStatement = restored.problemStatement;
        this.model.goals = restored.goals;
        this.model.orgNodes = restored.orgNodes;
        this.model.orgStyle = restored.orgStyle;
        this._orgSel = null;
        this._confirmTick++;
        // Re-sync contenteditable + org chart imperatively (synchronously, so
        // the node count reflects the undo immediately — matches legacy _render).
        this._syncProblemEditor();
        this._orgRefresh();
        this._orgApplyStyle();
        if (this._orgEditorOpen) this._orgBuildEditor();
      },
    };
  },
});
