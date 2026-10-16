/**
 * D.Mike — 5-Why Module (five-why.js)
 * Root-cause analysis using the 5-Why method with branching question trees.
 * DMAIC phase: Define.
 *
 * Migrated to createModule + Alpine CSP. The Model (five-why-model.js) holds the
 * persisted state (problem + branching node tree) plus all tree business logic.
 * The data-fn owns the view transforms (tag labels, glyphs, placeholders,
 * hierarchical numbering), the tree event handlers (add / delete / toggle /
 * collapse-all), the textarea auto-grow, and the JSON export.
 *
 * Spec: docs/modules/FIVE-WHY.md
 *
 * @agent  Vollständig über das Viewmodel steuerbar: Problemtext, Fragebaum,
 *   Antworten, Einklappen. Der Dateidownload und die Rückfrage beim Löschen
 *   eines Teilbaums bleiben der UI vorbehalten.
 */

import { createModule } from '../../core/template-module.js';
import { downloadFile } from '../../core/export-utils.js';
import { agentReadMixin } from '../../core/agent/agent-read-mixin.js';
import { requireKnownId } from '../../core/agent/agent-argcheck.js';
import { State, MAX_LEVEL } from './five-why-model.js';

/**
 * Die vorhandenen nodeIds in Anzeigereihenfolge (Tiefe zuerst) — die Liste,
 * die `requireKnownId` in die Fehlermeldung schreibt, damit ein Agent seinen
 * Tippfehler sieht statt zu raten.
 * @param {{ nodes: object[] }} model
 * @returns {number[]}
 */
function nodeIds(model) {
  const ids = [];
  const walk = (list) => {
    for (const n of list ?? []) { ids.push(n.id); walk(n.children); }
  };
  walk(model.nodes);
  return ids;
}

export default createModule({
  config: {
    id: 'five-why',
    engine: 'alpine',
    phase: 'define',
    icon: 'module.five-why',
    version: '1.0.0',
    meta: import.meta,
    // `agentAction` nennt die Agentenmethode hinter der Aktion AUSDRÜCKLICH.
    // `title` ist ein Beschriftungsschlüssel und hier nur zufällig gleich dem
    // Methodennamen. `exportJSON` trägt keines: die Methode steht nicht in
    // `core/agent/agent-registry.generated.js` und hat damit keinen Hilfesatz.
    actions: [
      { icon: 'nav.collapse-up', title: 'collapseAll', agentAction: 'collapseAll', onClick: (d) => d.collapseAll() },
      { icon: 'nav.expand-down', title: 'expandAll',   agentAction: 'expandAll',   onClick: (d) => d.expandAll() },
      { icon: 'action.download', title: 'exportJSON',  onClick: (d) => d.exportJSON() },
    ],
  },
  Model: State,

  data(module, _t) {
    return {
      ...agentReadMixin(module),

      /** Level cap surfaced from the model constant (template uses `maxLevel`). */
      maxLevel: MAX_LEVEL,

      // ── View transforms ───────────────────────────────────────
      /**
       * @noagent view transform
       * @returns {boolean} true when node is at the root-cause level
       */
      isRootCause(node) { return node.level >= MAX_LEVEL; },
      /** @noagent view transform — card class: root-cause modifier at the max level. */
      cardClass(node) {
        return node.level >= MAX_LEVEL ? 'five-why__card--root-cause' : '';
      },
      /** @noagent view transform — level clamped to 1..maxLevel for data-level. */
      clampLevel(node) { return Math.min(node.level, MAX_LEVEL); },
      /**
       * @noagent view transform
       *
       * Node tag from the render index path (1-based), NOT the stored `node.level`.
       * Depth = indices.length. At the deepest level (== MAX_LEVEL) it's the root cause.
       * nodeTag(0)             → "W1"
       * nodeTag(0, 0)          → "W1.1"
       * nodeTag(0, 0, 0, 0, 0) → "Root Cause"
       * Deriving the label from render depth (rather than the persisted `level`)
       * keeps it correct regardless of how the tree was loaded (Bug 020).
       */
      nodeTag(...indices) {
        const depth = indices.length;
        if (depth >= MAX_LEVEL) return _t('modules.five-why.rootCause');
        const num = indices.map((i) => i + 1).join('.');
        return `W${num}`;
      },
      /** @noagent view transform — placeholder for the answer textarea. */
      answerPlaceholder(node) {
        return node.level >= MAX_LEVEL
          ? _t('modules.five-why.rootCausePlaceholder')
          : _t('modules.five-why.answerPlaceholder');
      },
      /** @noagent view transform — collapse/expand toggle tooltip. */
      toggleTitle(node) {
        return node.collapsed ? _t('modules.five-why.expand') : _t('modules.five-why.collapse');
      },
      /** @noagent view transform — collapse/expand toggle icon. */
      toggleIcon(node) { return node.collapsed ? 'nav.expand-right' : 'nav.expand-down'; },
      /** @noagent view transform — delete button tooltip (shared "common.delete" key). */
      deleteTitle() { return _t('common.delete'); },
      /** @noagent view transform — inline add-child label: "＋ Add Why {nextLevel}". */
      addChildLabel(node) {
        const next = Math.min(node.level + 1, MAX_LEVEL);
        return `＋ ${  _t('modules.five-why.addWhyN', { n: next })}`;
      },
      /** @noagent view transform — add-root button label: "＋ Add Why". */
      addRootLabel() {
        return `＋ ${  _t('modules.five-why.addWhy')}`;
      },
      /** @noagent view transform — stats text: "{n} {label}" (single text node). */
      statText(n, key) {
        return `${n  } ${  _t(`modules.five-why.${  key}`)}`;
      },

      // ── State actions (UI handlers AND agent surface — one sink) ───
      /**
       * Set the observed problem statement.
       * @agent
       * @param {string} text the problem statement
       * @returns {void}
       */
      setProblem(text) {
        this.model.problem = String(text ?? '');
      },
      /**
       * Set the answer of a Why node.
       * @agent
       * @param {number} nodeId id of the node
       * @param {string} text the answer text
       * @returns {void}
       * @throws {Error} if no node has this id
       */
      setAnswer(nodeId, text) {
        // Eine nodeId, zu der es keine Frage gibt, ist ein UNGÜLTIGES
        // ARGUMENT und wirft — nicht `false`. Die Regel gilt für alle
        // freigegebenen Module gleich (ungültiges Argument: Fehler;
        // fachliche Absage: dokumentierter Rückgabewert), sonst müsste ein
        // Agent drei Protokolle lernen, von denen `module.describe` keines
        // nennt.
        requireKnownId('nodeId', nodeId, nodeIds(this.model));
        const node = this.model.findNode(nodeId);
        node.answer = String(text ?? '');
        this.$nextTick(() => this._growAll());
      },
      /**
       * Append a new level-1 Why node.
       * @agent
       * @returns {number} id of the created node
       */
      addRoot() {
        const node = this.model.addRootWhy();
        this.$nextTick(() => this._growAll());
        return node.id;
      },
      /**
       * Append a child Why below a node.
       * @agent
       * @param {number} parentId id of the node to append to
       * @returns {number|null} id of the created child, or null when the node
       *   is already at the root-cause level (level 5)
       * @throws {Error} if no node has this id
       */
      addChild(parentId) {
        // Die beiden Fälle, in denen `State.addChild` null liefert, sind
        // NICHT dasselbe: eine parentId ohne Frage ist ein ungültiges
        // Argument und wirft; „schon auf der Grundursachen-Ebene" ist eine
        // fachliche Absage und behält ihren Rückgabewert `null`.
        requireKnownId('nodeId', parentId, nodeIds(this.model));
        const child = this.model.addChild(parentId);
        this.$nextTick(() => this._growAll());
        return child ? child.id : null;
      },
      /**
       * Collapse or expand a node.
       * @agent
       * @param {number} id id of the node to toggle
       * @returns {void}
       * @throws {Error} if no node has this id
       */
      toggleCollapse(id) {
        // `State.toggleCollapse` kehrt bei unbekannter id STILL zurück; der
        // Aufruf meldete Erfolg, ohne etwas umgeschaltet zu haben.
        requireKnownId('nodeId', id, nodeIds(this.model));
        this.model.toggleCollapse(id);
        this.$nextTick(() => this._growAll());
      },
      /**
       * Remove a node and its subtree. The UI handler `deleteNode()` asks the
       * user first and then calls this — one sink, two callers.
       * @agent
       * @param {number} nodeId id of the node to remove
       * @returns {void}
       * @throws {Error} if no node has this id
       */
      removeNode(nodeId) {
        requireKnownId('nodeId', nodeId, nodeIds(this.model));
        this.model.deleteNode(nodeId);
        this.$nextTick(() => this._growAll());
      },
      /**
       * @noagent  UI handler: asks the user before deleting a subtree and then
       *   delegates to removeNode(). An agent must not be able to trigger a
       *   confirmation dialog — it would block the batch.
       */
      deleteNode(node) {
        if (this.model.nodeHasChildren(node.id)) {
          module._context.dialog.confirm({ message: _t('modules.five-why.deleteConfirm'), danger: true })
            .then((confirmed) => { if (confirmed) this.removeNode(node.id); });
          return;
        }
        this.removeNode(node.id);
      },
      /**
       * Collapse every node that has children.
       * @agent
       * @returns {void}
       */
      collapseAll() {
        this.model.setCollapseAll(true);
      },
      /**
       * Expand every node.
       * @agent
       * @returns {void}
       */
      expandAll() {
        this.model.setCollapseAll(false);
        this.$nextTick(() => this._growAll());
      },

      /** @noagent DOM event handler (textarea auto-grow) */
      autoGrow(event) {
        const el = event.target;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight  }px`;
      },

      // ── Export ────────────────────────────────────────────────
      /** @noagent downloads a file; an agent reads the state via read() */
      exportJSON() {
        const out = {
          tool: '5-Why',
          timestamp: new Date().toISOString(),
          problem: this.model.problem,
          nodes: this.model.toJSON().nodes,
        };
        downloadFile(JSON.stringify(out, null, 2), '5why-export.json', 'application/json');
        module._context.notify(_t('modules.five-why.exportedJSON'));
      },

      // ── Lifecycle (per Alpine instance) ───────────────────────
      /** @noagent per-instance lifecycle */
      init() {
        // Mirror the legacy render: auto-grow all answer textareas on mount.
        // Subsequent grows are triggered directly by the mutation handlers
        // (addRoot, addChild, deleteNode, toggleCollapse, expandAll) via
        // $nextTick — avoiding a redundant $watch on the expensive toJSON clone.
        this.$nextTick(() => this._growAll());
      },
      _growAll() {
        this.$el.querySelectorAll('.five-why__answer').forEach((el) => {
          el.style.height = 'auto';
          el.style.height = `${el.scrollHeight  }px`;
        });
      },

    };
  },
});
