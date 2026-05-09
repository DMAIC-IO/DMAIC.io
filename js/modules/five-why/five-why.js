/**
 * D.Mike — 5-Why Module (five-why.js)
 * Root cause analysis using the 5-Why method with branching question trees.
 * DMAIC phase: Define
 *
 * Spec: docs/modules/FIVE-WHY.md
 */

/** @type {number} Auto-incrementing node ID counter */
let nodeIdCounter = 0;

/**
 * Create a new tree node.
 * @param {number} level - Why level (1–5)
 * @param {number|null} parentId - Parent node ID or null for root
 * @returns {object}
 */
function createNode(level, parentId) {
  return {
    id: ++nodeIdCounter,
    level,
    parentId,
    question: '',
    answer: '',
    children: [],
    collapsed: false,
  };
}

/**
 * Find a node by ID in a tree array.
 * @param {number} id
 * @param {object[]} nodes
 * @returns {object|null}
 */
function findNode(id, nodes) {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(id, n.children);
    if (found) return found;
  }
  return null;
}

/**
 * Find the parent array containing a node by ID.
 * @param {number} id
 * @param {object[]} nodes
 * @returns {object[]|null}
 */
function findParentArray(id, nodes) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return nodes;
    const found = findParentArray(id, nodes[i].children);
    if (found) return found;
  }
  return null;
}

/**
 * Calculate max ID in a tree (for restoring counter after import).
 * @param {object[]} nodes
 * @returns {number}
 */
function maxId(nodes) {
  let m = 0;
  for (const n of nodes) {
    if (n.id > m) m = n.id;
    m = Math.max(m, maxId(n.children || []));
  }
  return m;
}

/**
 * Walk the tree and compute stats.
 * @param {object[]} nodes
 * @returns {{ totalNodes: number, maxDepth: number, branches: number, answered: number }}
 */
function computeStats(nodes) {
  let totalNodes = 0, maxDepth = 0, branches = 0, answered = 0;
  function walk(list, depth) {
    for (const n of list) {
      totalNodes++;
      if (depth > maxDepth) maxDepth = depth;
      if (n.children.length > 1) branches += n.children.length - 1;
      if (n.answer.trim()) answered++;
      walk(n.children, depth + 1);
    }
  }
  walk(nodes, 1);
  return { totalNodes, maxDepth, branches, answered };
}

/**
 * Set collapsed state recursively.
 * @param {object[]} nodes
 * @param {boolean} collapsed
 */
function setCollapseAll(nodes, collapsed) {
  for (const n of nodes) {
    if (n.children.length > 0) n.collapsed = collapsed;
    setCollapseAll(n.children, collapsed);
  }
}

export default {
  id: 'five-why',
  phase: 'define',
  icon: 'help-circle',
  i18nKey: 'modules.five-why',
  version: '1.0.0',

  /** @type {object|null} */
  _context: null,
  /** @type {HTMLElement|null} */
  _container: null,
  /** @type {string} */
  _problem: '',
  /** @type {object[]} */
  _nodes: [],

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;
    this._problem = '';
    this._nodes = [];
    nodeIdCounter = 0;

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) this._importState(saved);

    this._render();
  },

  async destroy() {
    this._container.innerHTML = '';
  },

  onLanguageChange(_lang) {
    this._render();
  },

  onThemeChange(_theme) {
    // CSS custom properties handle theme
  },

  // ─── Data hooks ─────────────────────────────────────────────

  getState() {
    return {
      problem: this._problem,
      nodes: JSON.parse(JSON.stringify(this._nodes)),
    };
  },

  setState(data) {
    this._importState(data);
    this._render();
  },

  // ─── Help ───────────────────────────────────────────────────

  help: () => import('./five-why-help.js'),

  // ─── Internal: state import ─────────────────────────────────

  _importState(saved) {
    if (!saved) return;
    if (typeof saved.problem === 'string') this._problem = saved.problem;
    if (Array.isArray(saved.nodes)) {
      this._nodes = saved.nodes;
      nodeIdCounter = maxId(this._nodes);
    }
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const t = (key, params) => this._context.i18n.t(`modules.five-why.${key}`, params);
    const stats = computeStats(this._nodes);

    this._container.innerHTML = `
      <div class="module-container five-why">
        <div class="module-container__header">
          <h2 class="module-container__title">${t('name')}</h2>
          <div class="five-why__toolbar">
            <div class="five-why__toolbar-spacer"></div>
            <button class="btn btn--sm five-why__collapse-btn" type="button">${t('collapseAll')}</button>
            <button class="btn btn--sm five-why__expand-btn" type="button">${t('expandAll')}</button>
            <button class="btn btn--sm five-why__export-json-btn" type="button">${t('exportJSON')}</button>
          </div>
        </div>

        <div class="module-container__body">
          <!-- Problem statement -->
          <div class="five-why__problem">
            <label class="five-why__problem-label">${t('problem')}</label>
            <input
              type="text"
              class="field five-why__problem-input"
              data-ref="problemInput"
              placeholder="${t('problemPlaceholder')}"
              value="${this._escapeAttr(this._problem)}"
            />
          </div>

          <!-- Tree -->
          <div class="five-why__tree" data-ref="tree">
            ${this._nodes.length === 0
              ? ''
              : this._nodes.map((n, i) => this._renderNode(n, t, String(i + 1))).join('')
            }
          </div>

          <!-- Add root button -->
          <button class="five-why__add-root-btn" data-ref="addRoot">
            ＋ ${t('addWhy')}
          </button>

          <!-- Stats bar -->
          <div class="five-why__stats">
            <span class="five-why__stat">
              <span class="five-why__stat-dot five-why__stat-dot--nodes"></span>
              ${stats.totalNodes} ${t('statsNodes')}
            </span>
            <span class="five-why__stat">
              <span class="five-why__stat-dot five-why__stat-dot--depth"></span>
              ${stats.maxDepth} ${t('statsDepth')}
            </span>
            <span class="five-why__stat">
              <span class="five-why__stat-dot five-why__stat-dot--branches"></span>
              ${stats.branches} ${t('statsBranches')}
            </span>
            <span class="five-why__stat">
              <span class="five-why__stat-dot five-why__stat-dot--answered"></span>
              ${stats.answered} ${t('statsAnswered')}
            </span>
          </div>
        </div>
      </div>
    `;

    this._bindEvents(t);
  },

  /**
   * Render a single tree node recursively.
   * @param {object} node
   * @param {Function} t - Translation helper
   * @param {string} numbering - Hierarchical number, e.g. "1", "1.2", "1.2.3"
   * @returns {string} HTML string
   */
  _renderNode(node, t, numbering) {
    const clampedLevel = Math.min(node.level, 5);
    const isRootCause = node.level >= 5;
    const cardClass = isRootCause ? 'five-why__card five-why__card--root-cause' : 'five-why__card';
    const tagLabel = isRootCause ? t('rootCause') : `W${node.level}.${numbering}`;
    const childrenHidden = node.collapsed ? ' style="display:none"' : '';

    let childrenHTML = '';
    if (node.children.length > 0 || node.level < 5) {
      const kids = node.children.map((c, i) => this._renderNode(c, t, `${numbering}.${i + 1}`)).join('');
      const nextLevel = Math.min(node.level + 1, 5);
      childrenHTML = `
        <div class="five-why__children" data-level="${clampedLevel}" data-parent="${node.id}"${childrenHidden}>
          ${kids}
          ${node.level < 5 ? `
            <button class="five-why__add-child-btn" data-parent="${node.id}">
              ＋ ${t('addWhyN', { n: nextLevel })}
            </button>
          ` : ''}
        </div>
      `;
    }

    return `
      <div class="five-why__node" data-node-id="${node.id}">
        <div class="${cardClass}">
          <span class="five-why__tag" data-level="${clampedLevel}">${tagLabel}</span>
          <textarea
            class="five-why__answer"
            placeholder="${isRootCause ? t('rootCausePlaceholder') : t('answerPlaceholder')}"
            data-field="answer" data-id="${node.id}"
          >${this._escapeHtml(node.answer)}</textarea>
          <div class="five-why__card-actions">
            ${node.children.length > 0 ? `
              <button class="btn btn--icon-sm five-why__icon-btn" data-action="toggle" data-id="${node.id}"
                title="${node.collapsed ? t('expand') : t('collapse')}">
                ${node.collapsed ? '▸' : '▾'}
              </button>
            ` : ''}
            ${node.level < 5 ? `
              <button class="btn btn--icon-sm five-why__icon-btn five-why__icon-btn--add" data-action="add-child" data-id="${node.id}"
                title="${t('addSubQuestion')}">＋</button>
            ` : ''}
            <button class="btn btn--icon-sm five-why__icon-btn five-why__icon-btn--delete" data-action="delete" data-id="${node.id}"
              title="${this._context.i18n.t('common.delete')}">✕</button>
          </div>
        </div>
        ${childrenHTML}
      </div>
    `;
  },

  // ─── Events ─────────────────────────────────────────────────

  _bindEvents(t) {
    const el = this._container;

    // Problem input
    const problemInput = el.querySelector('[data-ref="problemInput"]');
    if (problemInput) {
      problemInput.addEventListener('input', () => {
        this._problem = problemInput.value;
        this._save();
      });
    }

    // Add root why
    el.querySelector('[data-ref="addRoot"]')?.addEventListener('click', () => {
      this._addRootWhy();
    });

    // Add child buttons (inline)
    el.querySelectorAll('.five-why__add-child-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._addChild(parseInt(btn.dataset.parent, 10));
      });
    });

    // Icon button actions (toggle, add-child, delete)
    el.querySelectorAll('.five-why__icon-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id, 10);
        const action = btn.dataset.action;
        if (action === 'toggle') this._toggleCollapse(id);
        else if (action === 'add-child') this._addChild(id);
        else if (action === 'delete') this._deleteNode(id, t);
      });
    });

    // Answer textareas: auto-grow + save on input
    el.querySelectorAll('.five-why__answer').forEach(ta => {
      this._autoGrow(ta);
      ta.addEventListener('input', () => {
        const id = parseInt(ta.dataset.id, 10);
        const field = ta.dataset.field;
        const node = findNode(id, this._nodes);
        if (node) {
          node[field] = ta.value;
          this._save();
          // Update stats without full re-render
          this._updateStatsBar(t);
        }
        this._autoGrow(ta);
      });
      ta.addEventListener('focus', () => this._autoGrow(ta));
    });

    // Toolbar buttons
    el.querySelector('.five-why__collapse-btn')?.addEventListener('click', () => {
      setCollapseAll(this._nodes, true);
      this._save();
      this._render();
    });
    el.querySelector('.five-why__expand-btn')?.addEventListener('click', () => {
      setCollapseAll(this._nodes, false);
      this._save();
      this._render();
    });
    el.querySelector('.five-why__export-json-btn')?.addEventListener('click', () => this._exportJSON(t));
  },

  // ─── Tree operations ────────────────────────────────────────

  _addRootWhy() {
    this._nodes.push(createNode(1, null));
    this._save();
    this._render();
    // Focus the last added textarea
    setTimeout(() => {
      const textareas = this._container.querySelectorAll('.five-why__question');
      if (textareas.length) textareas[textareas.length - 1].focus();
    }, 50);
  },

  _addChild(parentId) {
    const parent = findNode(parentId, this._nodes);
    if (!parent || parent.level >= 5) return;
    parent.collapsed = false;
    const child = createNode(parent.level + 1, parentId);
    parent.children.push(child);
    this._save();
    this._render();
    setTimeout(() => {
      const nodeEl = this._container.querySelector(`[data-node-id="${child.id}"] .five-why__question`);
      if (nodeEl) nodeEl.focus();
    }, 50);
  },

  _deleteNode(id, t) {
    const arr = findParentArray(id, this._nodes);
    if (!arr) return;
    const node = findNode(id, this._nodes);
    // If node has children, ask confirmation
    if (node && node.children.length > 0) {
      this._context.confirmPopout(t('deleteConfirm'), { danger: true }).then(confirmed => {
        if (!confirmed) return;
        const idx = arr.findIndex(n => n.id === id);
        if (idx > -1) arr.splice(idx, 1);
        this._save();
        this._render();
      });
      return;
    }
    const idx = arr.findIndex(n => n.id === id);
    if (idx > -1) arr.splice(idx, 1);
    this._save();
    this._render();
  },

  _toggleCollapse(id) {
    const node = findNode(id, this._nodes);
    if (node) {
      node.collapsed = !node.collapsed;
      this._save();
      this._render();
    }
  },

  // ─── Stats update (without full re-render) ─────────────────

  _updateStatsBar(t) {
    const stats = computeStats(this._nodes);
    const bar = this._container.querySelector('.five-why__stats');
    if (!bar) return;
    const spans = bar.querySelectorAll('.five-why__stat');
    if (spans.length >= 4) {
      spans[0].innerHTML = `<span class="five-why__stat-dot five-why__stat-dot--nodes"></span>${stats.totalNodes} ${t('statsNodes')}`;
      spans[1].innerHTML = `<span class="five-why__stat-dot five-why__stat-dot--depth"></span>${stats.maxDepth} ${t('statsDepth')}`;
      spans[2].innerHTML = `<span class="five-why__stat-dot five-why__stat-dot--branches"></span>${stats.branches} ${t('statsBranches')}`;
      spans[3].innerHTML = `<span class="five-why__stat-dot five-why__stat-dot--answered"></span>${stats.answered} ${t('statsAnswered')}`;
    }
  },

  // ─── Export ─────────────────────────────────────────────────

  _exportJSON(t) {
    const out = {
      tool: '5-Why',
      timestamp: new Date().toISOString(),
      problem: this._problem,
      nodes: this._nodes,
    };
    this._downloadFile(
      JSON.stringify(out, null, 2),
      '5why-export.json',
      'application/json'
    );
    this._context.notify(t('exportedJSON'));
  },

  _downloadFile(content, filename, type) {
    const blob = new Blob(['\uFEFF' + content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  // ─── Persistence ────────────────────────────────────────────

  _save() {
    this._context.stateManager.setModuleState(
      this._context.instanceId,
      this.getState()
    );
  },

  // ─── Helpers ────────────────────────────────────────────────

  _autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  },

  _escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  _escapeAttr(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },
};
