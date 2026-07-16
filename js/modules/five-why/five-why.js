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
 */

import { createModule } from '../../core/template-module.js';
import { downloadFile } from '../../core/export-utils.js';
import { State, MAX_LEVEL } from './five-why-model.js';

export default createModule({
  config: {
    id: 'five-why',
    engine: 'alpine',
    phase: 'define',
    icon: 'help-circle',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      /** Level cap surfaced from the model constant (template uses `maxLevel`). */
      maxLevel: MAX_LEVEL,

      // ── Hierarchical numbering ────────────────────────────────
      /** Root numbering string, 1-based: index 0 → "1". */
      num(i) { return String(i + 1); },
      /** Child numbering: parent "1.2" + child index → "1.2.3". */
      sub(parent, i) { return `${parent  }.${  i + 1}`; },
      /**
       * Hierarchical node number from an index path.
       * nodeNum([i1])           → "1"
       * nodeNum([i1, i2])       → "1.2"
       * nodeNum([i1, i2, i3])   → "1.2.3"  etc.
       * Renders identically to the nested sub(sub(…num(i1),i2)…) expressions.
       */
      nodeNum(...indices) {
        return indices.map((i) => i + 1).join('.');
      },

      // ── View transforms ───────────────────────────────────────
      /** @returns {boolean} true when node is at the root-cause level */
      isRootCause(node) { return node.level >= MAX_LEVEL; },
      /** Card class: adds the root-cause modifier at the max level. */
      cardClass(node) {
        return node.level >= MAX_LEVEL ? 'five-why__card--root-cause' : '';
      },
      /** Level clamped to 1..maxLevel for the data-level attribute. */
      clampLevel(node) { return Math.min(node.level, MAX_LEVEL); },
      /** Tag label: "◆ Root Cause" at max level, else "W{level}.{numbering}". */
      nodeTag(node, numbering) {
        return node.level >= MAX_LEVEL ? _t('modules.five-why.rootCause') : `W${  node.level  }.${  numbering}`;
      },
      /** Placeholder for the answer textarea (root-cause variant at max level). */
      answerPlaceholder(node) {
        return node.level >= MAX_LEVEL
          ? _t('modules.five-why.rootCausePlaceholder')
          : _t('modules.five-why.answerPlaceholder');
      },
      /** Collapse/expand toggle tooltip. */
      toggleTitle(node) {
        return node.collapsed ? _t('modules.five-why.expand') : _t('modules.five-why.collapse');
      },
      /** Collapse/expand toggle glyph (literal chars — avoid \u escapes in template). */
      toggleGlyph(node) { return node.collapsed ? '▸' : '▾'; },
      /** Delete button tooltip (shared "common.delete" key). */
      deleteTitle() { return _t('common.delete'); },
      /** Inline add-child button label: "＋ Add Why {nextLevel}". */
      addChildLabel(node) {
        const next = Math.min(node.level + 1, MAX_LEVEL);
        return `＋ ${  _t('modules.five-why.addWhyN', { n: next })}`;
      },
      /** Add-root button label: "＋ Add Why". */
      addRootLabel() {
        return `＋ ${  _t('modules.five-why.addWhy')}`;
      },
      /** Stats text: "{n} {label}" (single text node, mirrors legacy). */
      statText(n, key) {
        return `${n  } ${  _t(`modules.five-why.${  key}`)}`;
      },

      // ── Event handlers ────────────────────────────────────────
      addRoot() {
        this.model.addRootWhy();
        this.$nextTick(() => this._growAll());
      },
      addChild(parentId) {
        this.model.addChild(parentId);
        this.$nextTick(() => this._growAll());
      },
      toggleCollapse(id) {
        this.model.toggleCollapse(id);
        this.$nextTick(() => this._growAll());
      },
      deleteNode(node) {
        if (this.model.nodeHasChildren(node.id)) {
          module._context.confirmPopout(_t('modules.five-why.deleteConfirm'), { danger: true })
            .then((confirmed) => {
              if (confirmed) {
                this.model.deleteNode(node.id);
                this.$nextTick(() => this._growAll());
              }
            });
          return;
        }
        this.model.deleteNode(node.id);
        this.$nextTick(() => this._growAll());
      },
      collapseAll() {
        this.model.setCollapseAll(true);
      },
      expandAll() {
        this.model.setCollapseAll(false);
        this.$nextTick(() => this._growAll());
      },

      /** Auto-grow a textarea to fit its content. */
      autoGrow(event) {
        const el = event.target;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight  }px`;
      },

      // ── Export ────────────────────────────────────────────────
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
