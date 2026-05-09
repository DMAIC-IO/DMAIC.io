/**
 * D.Mike — Pairwise Comparison (pairwise-comparison.js)
 * Prioritize a set of criteria by comparing every pair and ranking
 * them by their total win score (1 = win, 0.5 = tie, 0 = loss).
 *
 * DMAIC phase: Analyze
 */

const MAX_CRITERIA = 15;
const MIN_CRITERIA = 3;

/**
 * Fisher–Yates shuffle (in place).
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Build an n×n zero matrix.
 * @param {number} n
 * @returns {number[][]}
 */
function makeMatrix(n) {
  return Array.from({ length: n }, () => Array(n).fill(0));
}

/**
 * Build a randomized list of all unique index pairs [i,j] with i<j.
 * @param {number} n
 * @returns {[number, number][]}
 */
function makePairs(n) {
  const pairs = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) pairs.push([i, j]);
  }
  return shuffle(pairs);
}

/**
 * Compute row sums (ignoring the diagonal).
 * @param {number[][]} matrix
 * @returns {number[]}
 */
function computeScores(matrix) {
  const n = matrix.length;
  return Array.from({ length: n }, (_, i) => {
    let s = 0;
    for (let j = 0; j < n; j++) if (i !== j) s += matrix[i][j];
    return s;
  });
}

export default {
  id: 'pairwise-comparison',
  phase: 'analyze',
  icon: 'scale',
  i18nKey: 'modules.pairwise-comparison',
  version: '1.0.0',

  /** @type {HTMLElement|null} */
  _container: null,
  /** @type {object|null} */
  _context: null,
  /** @type {string[]} */
  _criteria: [],
  /** @type {number[][]} */
  _matrix: [],
  /** @type {[number, number][]} */
  _pairs: [],
  /** @type {number} */
  _currentPair: 0,
  /** @type {'input'|'compare'|'results'} */
  _viewPhase: 'input',
  /** @type {Function|null} */
  _keyHandler: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;
    this._criteria = [];
    this._matrix = [];
    this._pairs = [];
    this._currentPair = 0;
    this._viewPhase = 'input';

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) this._importState(saved);

    this._render();
  },

  async destroy() {
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    if (this._container) this._container.innerHTML = '';
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
      criteria: this._criteria.slice(),
      matrix: this._matrix.map((row) => row.slice()),
      pairs: this._pairs.map((p) => p.slice()),
      currentPair: this._currentPair,
      viewPhase: this._viewPhase,
    };
  },

  setState(data) {
    this._importState(data);
    this._render();
  },

  // ─── Help ───────────────────────────────────────────────────

  help: () => import('./pairwise-comparison-help.js'),

  // ─── State import ──────────────────────────────────────────

  _importState(saved) {
    if (!saved) return;
    if (Array.isArray(saved.criteria)) this._criteria = saved.criteria.slice();
    if (Array.isArray(saved.matrix)) this._matrix = saved.matrix.map((r) => r.slice());
    if (Array.isArray(saved.pairs)) this._pairs = saved.pairs.map((p) => p.slice());
    if (Number.isInteger(saved.currentPair)) this._currentPair = saved.currentPair;
    if (saved.viewPhase === 'input' || saved.viewPhase === 'compare' || saved.viewPhase === 'results') {
      this._viewPhase = saved.viewPhase;
    }
  },

  _save() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  _t(key, params) {
    return this._context.i18n.t(`modules.pairwise-comparison.${key}`, params);
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const t = (k, p) => this._t(k, p);
    const order = ['input', 'compare', 'results'];
    const active = order.indexOf(this._viewPhase);
    const tabClass = (i) => {
      if (i === active) return 'pairwise__tab--active';
      if (i < active) return 'pairwise__tab--done';
      return '';
    };
    const tabLabel = (num, key) => `<span class="pairwise__tab-num">${num}</span>${t(key)}`;

    this._container.innerHTML = `
      <div class="module-container pairwise">
        <div class="module-container__header">
          <h2 class="module-container__title">${t('name')}</h2>
        </div>
        <div class="module-container__body">
          <div class="pairwise__tabs">
            <div class="pairwise__tab ${tabClass(0)}" data-tab="input">${tabLabel('01', 'tabInput')}</div>
            <div class="pairwise__tab ${tabClass(1)}" data-tab="compare">${tabLabel('02', 'tabCompare')}</div>
            <div class="pairwise__tab ${tabClass(2)}" data-tab="results">${tabLabel('03', 'tabResults')}</div>
          </div>
          <div class="pairwise__content" data-ref="content"></div>
        </div>
      </div>
    `;

    this._renderContent();
  },

  _renderContent() {
    const host = this._container.querySelector('[data-ref="content"]');
    if (!host) return;

    if (this._viewPhase === 'input') {
      host.innerHTML = this._renderInputPhase();
    } else if (this._viewPhase === 'compare') {
      host.innerHTML = this._renderComparePhase();
    } else {
      host.innerHTML = this._renderResultsPhase();
    }

    this._bindEvents();
  },

  _renderInputPhase() {
    const t = (k, p) => this._t(k, p);
    const n = this._criteria.length;
    const startDisabled = n < MIN_CRITERIA;
    const pairCount = n * (n - 1) / 2;
    const startLabel = startDisabled
      ? t('startBtnNeed', { n: MIN_CRITERIA - n })
      : t('startBtnReady', { n: pairCount });

    const chips = n === 0
      ? ''
      : this._criteria.map((c, i) => `
          <span class="pairwise__chip">
            <span class="pairwise__chip-num">${String(i + 1).padStart(2, '0')}</span>
            <span class="pairwise__chip-label">${this._escapeHtml(c)}</span>
            <button class="pairwise__chip-remove" type="button"
                    data-action="remove" data-idx="${i}"
                    title="${this._escapeAttr(t('removeCriterion'))}"
                    aria-label="${this._escapeAttr(t('removeCriterion'))}">×</button>
          </span>
        `).join('');

    const empty = n === 0
      ? `<div class="pairwise__empty">
           <strong>${t('emptyTitle')}</strong>
           <span>${t('emptyHint', { n: MIN_CRITERIA })}</span>
         </div>`
      : '';

    return `
      <div class="pairwise__section">
        <div class="pairwise__section-label">${t('addSectionLabel')}</div>
        <div class="pairwise__input-row">
          <input
            type="text"
            class="field pairwise__input"
            data-ref="criterionInput"
            placeholder="${this._escapeAttr(t('criterionPlaceholder'))}"
            maxlength="60"
            ${n >= MAX_CRITERIA ? 'disabled' : ''}
          />
          <button class="pairwise__btn pairwise__btn--accent" type="button"
                  data-action="add" ${n >= MAX_CRITERIA ? 'disabled' : ''}>
            + ${t('addBtn')}
          </button>
        </div>
        <div class="pairwise__chips">${chips}</div>
        ${empty}
        ${n >= MAX_CRITERIA ? `<div class="pairwise__hint">${t('maxReached', { n: MAX_CRITERIA })}</div>` : ''}
        <button class="pairwise__btn pairwise__btn--start" type="button"
                data-action="start" ${startDisabled ? 'disabled' : ''}>
          ${startLabel}
        </button>
      </div>
    `;
  },

  _renderComparePhase() {
    const t = (k, p) => this._t(k, p);
    const total = this._pairs.length;
    const pct = total > 0 ? (this._currentPair / total) * 100 : 0;

    if (this._currentPair >= total) {
      // Should not normally happen — safeguard by jumping to results.
      this._viewPhase = 'results';
      this._save();
      return this._renderResultsPhase();
    }

    const [a, b] = this._pairs[this._currentPair];

    return `
      <div class="pairwise__progress">
        <div class="pairwise__progress-bar">
          <div class="pairwise__progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="pairwise__progress-text">${this._currentPair} / ${total}</div>
      </div>

      <div class="pairwise__card">
        <div class="pairwise__vs-label">${t('vsPrompt')}</div>
        <div class="pairwise__vs">
          <button class="pairwise__vs-option" type="button"
                  data-action="choose" data-winner="${a}" data-loser="${b}">
            <span class="pairwise__vs-hotkey">←</span>
            <span class="pairwise__vs-name">${this._escapeHtml(this._criteria[a])}</span>
          </button>
          <div class="pairwise__vs-divider">vs</div>
          <button class="pairwise__vs-option" type="button"
                  data-action="choose" data-winner="${b}" data-loser="${a}">
            <span class="pairwise__vs-hotkey">→</span>
            <span class="pairwise__vs-name">${this._escapeHtml(this._criteria[b])}</span>
          </button>
        </div>
        <button class="pairwise__vs-tie" type="button"
                data-action="tie" data-a="${a}" data-b="${b}">
          <span class="pairwise__vs-hotkey">␣</span>
          = ${t('tie')}
        </button>
      </div>

      <div class="pairwise__compare-actions">
        <button class="pairwise__btn pairwise__btn--outline" type="button" data-action="back-to-input">
          ← ${t('backToInput')}
        </button>
      </div>
    `;
  },

  _renderResultsPhase() {
    const t = (k, p) => this._t(k, p);
    const n = this._criteria.length;
    if (n === 0) {
      return `<div class="pairwise__empty"><strong>${t('noResults')}</strong></div>`;
    }

    const scores = computeScores(this._matrix);
    const maxScore = Math.max(0, ...scores);
    const ranked = this._criteria
      .map((name, i) => ({ name, score: scores[i], idx: i }))
      .sort((a, b) => b.score - a.score);

    const rankingItems = ranked.map((r, pos) => {
      const pct = maxScore > 0 ? (r.score / maxScore) * 100 : 0;
      const medalClass = pos < 3 ? `pairwise__rank-item--${['gold','silver','bronze'][pos]}` : '';
      return `
        <li class="pairwise__rank-item ${medalClass}" style="animation-delay:${pos * 0.05}s">
          <span class="pairwise__rank-pos">${pos + 1}</span>
          <span class="pairwise__rank-name">${this._escapeHtml(r.name)}</span>
          <span class="pairwise__rank-bar-wrap">
            <span class="pairwise__rank-bar" style="width:${pct}%"></span>
          </span>
          <span class="pairwise__rank-score">${r.score.toFixed(1)}</span>
        </li>
      `;
    }).join('');

    // Matrix table
    let rows = '';
    for (let i = 0; i < n; i++) {
      let cells = '';
      for (let j = 0; j < n; j++) {
        if (i === j) {
          cells += `<td class="pairwise__matrix-cell pairwise__matrix-cell--diag">—</td>`;
        } else {
          const v = this._matrix[i][j];
          const cls = v === 1 ? 'pairwise__matrix-cell--win'
                   : v === 0.5 ? 'pairwise__matrix-cell--tie'
                   : 'pairwise__matrix-cell--lose';
          cells += `<td class="pairwise__matrix-cell pairwise__matrix-cell--editable ${cls}"
                        data-action="cycle-cell" data-i="${i}" data-j="${j}"
                        title="${this._escapeAttr(t('matrixCellHint'))}">${v}</td>`;
        }
      }
      rows += `
        <tr>
          <th class="pairwise__matrix-row-label">${this._escapeHtml(this._criteria[i])}</th>
          ${cells}
          <td class="pairwise__matrix-cell pairwise__matrix-cell--sum">${scores[i].toFixed(1)}</td>
        </tr>
      `;
    }

    const headerCells = this._criteria
      .map((c) => `<th>${this._escapeHtml(c)}</th>`)
      .join('');

    return `
      <div class="pairwise__results-grid">
        <div class="pairwise__results-col">
          <div class="pairwise__section-label">${t('rankingLabel')}</div>
          <ol class="pairwise__rank-list">${rankingItems}</ol>
        </div>
        <div class="pairwise__results-col">
          <div class="pairwise__section-label">${t('matrixLabel')}</div>
          <div class="pairwise__matrix-wrap">
            <table class="pairwise__matrix">
              <thead>
                <tr>
                  <th></th>
                  ${headerCells}
                  <th>Σ</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <div class="pairwise__matrix-hint">
            <span>${t('matrixHint')}</span>
            <span class="pairwise__matrix-legend">
              <span class="pairwise__dot pairwise__dot--win"></span> 1 = ${t('legendWin')}
            </span>
            <span class="pairwise__matrix-legend">
              <span class="pairwise__dot pairwise__dot--tie"></span> 0.5 = ${t('legendTie')}
            </span>
            <span class="pairwise__matrix-legend">
              <span class="pairwise__dot pairwise__dot--lose"></span> 0 = ${t('legendLose')}
            </span>
          </div>
        </div>
      </div>

      <div class="pairwise__actions">
        <button class="pairwise__btn pairwise__btn--outline" type="button" data-action="export-csv">
          ⬇ ${t('exportCSV')}
        </button>
        <button class="pairwise__btn pairwise__btn--outline" type="button" data-action="export-json">
          ⬇ ${t('exportJSON')}
        </button>
        <button class="pairwise__btn pairwise__btn--outline" type="button" data-action="copy-results">
          ⎘ ${t('copyResults')}
        </button>
        <button class="pairwise__btn pairwise__btn--danger" type="button" data-action="reset">
          ↺ ${t('resetAll')}
        </button>
      </div>
    `;
  },

  // ─── Event binding ─────────────────────────────────────────

  _bindEvents() {
    const el = this._container;

    // Tabs (only allow clicks back to earlier completed phases)
    el.querySelectorAll('.pairwise__tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        if (target === 'input') {
          this._viewPhase = 'input';
          this._save();
          this._render();
        } else if (target === 'compare' && this._pairs.length > 0) {
          this._viewPhase = 'compare';
          this._save();
          this._render();
        } else if (target === 'results' && this._currentPair >= Math.max(1, this._pairs.length)) {
          this._viewPhase = 'results';
          this._save();
          this._render();
        }
      });
    });

    // Delegated click handler for action buttons
    el.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => this._handleAction(e, btn));
    });

    // Criterion input enter-to-add
    const input = el.querySelector('[data-ref="criterionInput"]');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this._addCriterion();
        }
      });
      input.focus();
    }

    // Document-level keyboard shortcuts for the comparison phase
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    if (this._viewPhase === 'compare') {
      this._keyHandler = (e) => this._handleCompareKey(e);
      document.addEventListener('keydown', this._keyHandler);
    }
  },

  _handleAction(e, btn) {
    const action = btn.dataset.action;
    if (action === 'add') this._addCriterion();
    else if (action === 'remove') this._removeCriterion(parseInt(btn.dataset.idx, 10));
    else if (action === 'start') this._startComparison();
    else if (action === 'choose') {
      const w = parseInt(btn.dataset.winner, 10);
      const l = parseInt(btn.dataset.loser, 10);
      this._choose(w, l);
    } else if (action === 'tie') {
      const a = parseInt(btn.dataset.a, 10);
      const b = parseInt(btn.dataset.b, 10);
      this._chooseTie(a, b);
    } else if (action === 'back-to-input') this._backToInput();
    else if (action === 'cycle-cell') {
      const i = parseInt(btn.dataset.i, 10);
      const j = parseInt(btn.dataset.j, 10);
      this._cycleCell(i, j);
    } else if (action === 'export-csv') this._exportCSV();
    else if (action === 'export-json') this._exportJSON();
    else if (action === 'copy-results') this._copyResults();
    else if (action === 'reset') this._resetAll();
  },

  _handleCompareKey(e) {
    // Ignore when a button, input, textarea or select has focus — native
    // button activation (Space/Enter) would otherwise fire alongside this
    // shortcut and cause a double action.
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;

    const total = this._pairs.length;
    if (this._currentPair >= total) return;
    const [a, b] = this._pairs[this._currentPair];

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this._choose(a, b);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this._choose(b, a);
    } else if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      this._chooseTie(a, b);
    }
  },

  // ─── Criteria management ───────────────────────────────────

  _addCriterion() {
    const input = this._container.querySelector('[data-ref="criterionInput"]');
    if (!input) return;
    const value = input.value.trim();
    input.value = '';
    if (!value) return;
    if (this._criteria.includes(value)) {
      this._context.notify(this._t('duplicateWarning'));
      input.focus();
      return;
    }
    if (this._criteria.length >= MAX_CRITERIA) return;
    this._criteria.push(value);
    // Invalidate any prior comparison
    this._matrix = [];
    this._pairs = [];
    this._currentPair = 0;
    this._save();
    this._render();
  },

  _removeCriterion(idx) {
    if (idx < 0 || idx >= this._criteria.length) return;
    this._criteria.splice(idx, 1);
    this._matrix = [];
    this._pairs = [];
    this._currentPair = 0;
    this._save();
    this._render();
  },

  // ─── Comparison flow ───────────────────────────────────────

  _startComparison() {
    const n = this._criteria.length;
    if (n < MIN_CRITERIA) return;
    this._matrix = makeMatrix(n);
    this._pairs = makePairs(n);
    this._currentPair = 0;
    this._viewPhase = 'compare';
    this._save();
    this._render();
  },

  _choose(winnerIdx, loserIdx) {
    if (this._currentPair >= this._pairs.length) return;
    this._matrix[winnerIdx][loserIdx] = 1;
    this._matrix[loserIdx][winnerIdx] = 0;
    this._advancePair();
  },

  _chooseTie(a, b) {
    if (this._currentPair >= this._pairs.length) return;
    this._matrix[a][b] = 0.5;
    this._matrix[b][a] = 0.5;
    this._advancePair();
  },

  _advancePair() {
    this._currentPair++;
    if (this._currentPair >= this._pairs.length) {
      this._viewPhase = 'results';
    }
    this._save();
    this._render();
  },

  _backToInput() {
    this._viewPhase = 'input';
    this._save();
    this._render();
  },

  _cycleCell(i, j) {
    const cur = this._matrix[i][j];
    let next;
    if (cur === 0) next = 0.5;
    else if (cur === 0.5) next = 1;
    else next = 0;

    this._matrix[i][j] = next;
    this._matrix[j][i] = next === 0.5 ? 0.5 : 1 - next;
    this._save();
    this._renderContent();
  },

  _resetAll() {
    const msg = this._t('resetConfirm');
    Promise.resolve(this._context.confirmPopout(msg, { danger: true })).then((confirmed) => {
      if (!confirmed) return;
      this._criteria = [];
      this._matrix = [];
      this._pairs = [];
      this._currentPair = 0;
      this._viewPhase = 'input';
      this._save();
      this._render();
      this._context.notify(this._t('resetDone'));
    });
  },

  // ─── Export ────────────────────────────────────────────────

  _exportCSV() {
    const n = this._criteria.length;
    if (n === 0) return;
    const scores = computeScores(this._matrix);
    const esc = (s) => /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    let csv = 'sep=;\n';
    csv += ';' + this._criteria.map(esc).join(';') + ';' + this._t('sum') + '\n';
    for (let i = 0; i < n; i++) {
      csv += esc(this._criteria[i]) + ';';
      for (let j = 0; j < n; j++) csv += (i === j ? '-' : this._matrix[i][j]) + ';';
      csv += scores[i].toFixed(1) + '\n';
    }
    this._downloadFile(csv, 'pairwise-comparison.csv', 'text/csv');
    this._context.notify(this._t('exportedCSV'));
  },

  _exportJSON() {
    const n = this._criteria.length;
    if (n === 0) return;
    const scores = computeScores(this._matrix);
    const ranked = this._criteria
      .map((name, i) => ({ name, score: scores[i], rank: 0 }))
      .sort((a, b) => b.score - a.score)
      .map((r, i) => ({ ...r, rank: i + 1 }));
    const out = {
      tool: 'pairwise-comparison',
      timestamp: new Date().toISOString(),
      criteria: this._criteria,
      matrix: this._matrix,
      scores,
      ranking: ranked,
    };
    this._downloadFile(JSON.stringify(out, null, 2), 'pairwise-comparison.json', 'application/json');
    this._context.notify(this._t('exportedJSON'));
  },

  _copyResults() {
    const n = this._criteria.length;
    if (n === 0) return;
    const scores = computeScores(this._matrix);
    const ranked = this._criteria
      .map((name, i) => ({ name, score: scores[i] }))
      .sort((a, b) => b.score - a.score);
    const header = this._t('copyHeader');
    const pointsLabel = this._t('points');
    const text = header + '\n' + ranked
      .map((r, i) => `${i + 1}. ${r.name} (${r.score.toFixed(1)} ${pointsLabel})`)
      .join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => this._context.notify(this._t('copied')),
        () => this._context.notify(this._t('copyFailed')),
      );
    } else {
      this._context.notify(this._t('copyFailed'));
    }
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

  // ─── Helpers ────────────────────────────────────────────────

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
