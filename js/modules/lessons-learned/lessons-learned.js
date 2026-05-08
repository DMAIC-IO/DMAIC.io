/**
 * DMAIC.io — Lessons Learned Module (lessons-learned.js)
 * Structured documentation of project insights in the Control phase.
 * Categories: Success, Problem, Improvement.
 * DMAIC phase: Control
 */

import { escHtml, escAttr } from '../../core/html-utils.js';

/** @type {number} Auto-incrementing lesson ID counter */
let lessonIdCounter = 0;

/**
 * Generate a unique ID for a lesson.
 * @returns {string}
 */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Compute stats from the lessons array.
 * @param {object[]} lessons
 * @returns {{ total: number, success: number, problem: number, improve: number, openActions: number }}
 */
function computeStats(lessons) {
  let success = 0, problem = 0, improve = 0, openActions = 0;
  for (const l of lessons) {
    if (l.category === 'success') success++;
    else if (l.category === 'problem') problem++;
    else if (l.category === 'improve') improve++;
    openActions += (l.actions || []).filter(a => !a.done).length;
  }
  return { total: lessons.length, success, problem, improve, openActions };
}

// Phase taxonomy is cycle-aware — see js/core/cycles/cycles.js. The dropdown
// renders the methodology phases of the active project's cycle.
import { getPhaseIds, DEFAULT_CYCLE } from '../../core/cycles/cycles.js';
const CATEGORY_KEYS = ['success', 'problem', 'improve'];
const IMPACT_KEYS = ['high', 'medium', 'low'];

export default {
  id: 'lessons-learned',
  phase: 'control',
  icon: 'book-open',
  i18nKey: 'modules.lessons-learned',
  version: '1.0.0',

  /** @type {object|null} */
  _context: null,
  /** @type {HTMLElement|null} */
  _container: null,
  /** @type {object[]} */
  _lessons: [],
  /** @type {string} */
  _filter: 'all',
  /** @type {string} */
  _search: '',
  /** @type {Set<string>} */
  _openCards: new Set(),
  /** @type {object[]|null} */
  _tempActions: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;
    this._lessons = [];
    this._filter = 'all';
    this._search = '';
    this._openCards = new Set();
    this._tempActions = null;

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
    return { lessons: JSON.parse(JSON.stringify(this._lessons)) };
  },

  setState(data) {
    this._importState(data);
    this._render();
  },

  // ─── Help ───────────────────────────────────────────────────

  help: () => import('./lessons-learned-help.js'),

  // ─── Internal: state import ─────────────────────────────────

  _importState(saved) {
    if (!saved) return;
    if (Array.isArray(saved.lessons)) {
      this._lessons = saved.lessons;
    }
  },

  // ─── Filtering ──────────────────────────────────────────────

  _getFiltered() {
    let list = [...this._lessons];
    if (this._filter !== 'all') {
      list = list.filter(l => l.category === this._filter);
    }
    const q = this._search.toLowerCase().trim();
    if (q) {
      list = list.filter(l =>
        (l.title || '').toLowerCase().includes(q) ||
        (l.description || '').toLowerCase().includes(q) ||
        (l.owner || '').toLowerCase().includes(q) ||
        (l.recommendation || '').toLowerCase().includes(q) ||
        (l.rootCause || '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const t = (key, params) => this._context.i18n.t(`modules.lessons-learned.${key}`, params);
    const stats = computeStats(this._lessons);
    const filtered = this._getFiltered();

    this._container.innerHTML = `
      <div class="module-container lessons-learned">
        <div class="module-container__header">
          <h2 class="module-container__title">${t('name')}</h2>
          <div class="module-container__actions">
            <button class="btn btn--sm" data-action="export-json" type="button">${t('exportJSON')}</button>
            <button class="btn btn--sm" data-action="import-json" type="button">${t('importJSON')}</button>
            <button class="btn btn--primary btn--sm" data-action="add" type="button">+ ${t('addLesson')}</button>
          </div>
        </div>

        <div class="module-container__body">
          ${this._renderStats(stats, t)}
          ${this._renderToolbar(t)}
          <div class="ll__list" data-ref="list">
            ${filtered.length === 0
              ? this._renderEmpty(t)
              : filtered.map(l => this._renderCard(l, t)).join('')}
          </div>
        </div>
      </div>
      <input type="file" data-ref="fileImport" accept=".json" style="display:none">
    `;

    this._bindEvents(t);
  },

  /**
   * Render stats bar.
   */
  _renderStats(stats, t) {
    return `
      <div class="ll__stats-bar">
        <div class="ll__stat">
          <span class="ll__stat-icon ll__stat-icon--total">&Sigma;</span>
          <div>
            <div class="ll__stat-label">${t('statTotal')}</div>
            <div class="ll__stat-value">${stats.total}</div>
          </div>
        </div>
        <div class="ll__stat">
          <span class="ll__stat-icon ll__stat-icon--success">&check;</span>
          <div>
            <div class="ll__stat-label">${t('statSuccess')}</div>
            <div class="ll__stat-value">${stats.success}</div>
          </div>
        </div>
        <div class="ll__stat">
          <span class="ll__stat-icon ll__stat-icon--problem">&times;</span>
          <div>
            <div class="ll__stat-label">${t('statProblem')}</div>
            <div class="ll__stat-value">${stats.problem}</div>
          </div>
        </div>
        <div class="ll__stat">
          <span class="ll__stat-icon ll__stat-icon--improve">&uarr;</span>
          <div>
            <div class="ll__stat-label">${t('statImprove')}</div>
            <div class="ll__stat-value">${stats.improve}</div>
          </div>
        </div>
        <div class="ll__stat">
          <span class="ll__stat-icon ll__stat-icon--actions">&#9673;</span>
          <div>
            <div class="ll__stat-label">${t('statOpenActions')}</div>
            <div class="ll__stat-value">${stats.openActions}</div>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Render search + filter toolbar.
   */
  _renderToolbar(t) {
    const chips = [
      { key: 'all', label: t('filterAll') },
      { key: 'success', label: t('filterSuccess') },
      { key: 'problem', label: t('filterProblem') },
      { key: 'improve', label: t('filterImprove') },
    ];
    return `
      <div class="ll__toolbar">
        <div class="ll__search">
          <input type="text" class="field ll__search-input" data-ref="search"
            placeholder="${escAttr(t('searchPlaceholder'))}"
            value="${escAttr(this._search)}">
        </div>
        <div class="ll__filters">
          ${chips.map(c => `
            <button class="ll__filter-chip${this._filter === c.key ? ' ll__filter-chip--active' : ''}"
              data-filter="${c.key}" type="button">${c.label}</button>
          `).join('')}
        </div>
      </div>
    `;
  },

  /**
   * Render empty state.
   */
  _renderEmpty(t) {
    return `<div class="ll__empty">${this._lessons.length === 0 ? '' : t('noResults')}</div>`;
  },

  /**
   * Render a single lesson card.
   */
  _renderCard(lesson, t) {
    const isOpen = this._openCards.has(lesson.id);
    const phaseLabel = this._context.i18n.t(`phases.${lesson.phase}`);
    const catLabel = t(`cat_${lesson.category}`);
    const impactLabel = t(`impact_${lesson.impact}`);
    const dateStr = lesson.createdAt ? new Date(lesson.createdAt).toLocaleDateString(
      this._context.language === 'de' ? 'de-DE' : 'en-US'
    ) : '';
    const actionsDone = (lesson.actions || []).filter(a => a.done).length;
    const actionsTotal = (lesson.actions || []).length;

    return `
      <div class="ll__card${isOpen ? ' ll__card--open' : ''}" data-lesson-id="${lesson.id}">
        <div class="ll__card-head" data-action="toggle-card" data-id="${lesson.id}">
          <span class="ll__cat-dot ll__cat-dot--${lesson.category}"></span>
          <div class="ll__card-content">
            <div class="ll__card-title-row">
              <span class="ll__card-title">${escHtml(lesson.title)}</span>
              <span class="ll__phase-tag ll__phase-tag--${lesson.phase}">${phaseLabel}</span>
              <span class="ll__impact-badge ll__impact-badge--${lesson.impact}">${impactLabel}</span>
            </div>
            <div class="ll__card-meta">
              <span>${catLabel}</span>
              ${lesson.owner ? `<span>${escHtml(lesson.owner)}</span>` : ''}
              <span>${dateStr}</span>
              ${actionsTotal > 0 ? `<span>${actionsDone}/${actionsTotal} Actions</span>` : ''}
            </div>
          </div>
          <span class="ll__chevron">${isOpen ? '&#9662;' : '&#9656;'}</span>
        </div>
        ${isOpen ? this._renderCardBody(lesson, t) : ''}
      </div>
    `;
  },

  /**
   * Render the expanded body of a lesson card.
   */
  _renderCardBody(lesson, t) {
    const sections = [];

    if (lesson.description) {
      sections.push(`
        <div class="ll__section">
          <div class="ll__section-label">${t('labelDescription')}</div>
          <p class="ll__section-text">${escHtml(lesson.description)}</p>
        </div>
      `);
    }
    if (lesson.rootCause) {
      sections.push(`
        <div class="ll__section">
          <div class="ll__section-label">${t('labelRootCause')}</div>
          <p class="ll__section-text">${escHtml(lesson.rootCause)}</p>
        </div>
      `);
    }
    if (lesson.recommendation) {
      sections.push(`
        <div class="ll__section">
          <div class="ll__section-label">${t('labelRecommendation')}</div>
          <p class="ll__section-text">${escHtml(lesson.recommendation)}</p>
        </div>
      `);
    }
    if (lesson.actions && lesson.actions.length > 0) {
      sections.push(`
        <div class="ll__section">
          <div class="ll__section-label">${t('labelActions')}</div>
          <ul class="ll__action-list">
            ${lesson.actions.map((a, i) => `
              <li class="ll__action-item">
                <button class="ll__action-check${a.done ? ' ll__action-check--done' : ''}"
                  data-action="toggle-action" data-lesson="${lesson.id}" data-idx="${i}"
                  type="button">
                  ${a.done ? '&#10003;' : ''}
                </button>
                <span class="ll__action-text${a.done ? ' ll__action-text--done' : ''}">${escHtml(a.text)}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      `);
    }

    return `
      <div class="ll__card-body">
        ${sections.join('')}
        <div class="ll__card-actions">
          <button class="btn btn--sm btn--ghost" data-action="edit" data-id="${lesson.id}" type="button">${t('edit')}</button>
          <button class="btn btn--sm btn--ghost btn--danger" data-action="delete" data-id="${lesson.id}" type="button">${t('delete')}</button>
        </div>
      </div>
    `;
  },

  // ─── Modal ──────────────────────────────────────────────────

  /**
   * Open the add/edit modal using the shared modal system.
   * @param {object|null} lesson - Existing lesson for editing, or null for new
   */
  _openModal(lesson) {
    const t = (key, params) => this._context.i18n.t(`modules.lessons-learned.${key}`, params);
    this._tempActions = lesson ? lesson.actions.map(a => ({ ...a })) : [];

    const cycleId = this._context.stateManager?.get('projectMeta.cycle') || DEFAULT_CYCLE;
    const cyclePhases = getPhaseIds(cycleId);
    const defaultPhase = lesson?.phase || cyclePhases[cyclePhases.length - 1];
    const phaseOptions = cyclePhases.map(k =>
      `<option value="${k}"${defaultPhase === k ? ' selected' : ''}>${this._context.i18n.t(`phases.${k}`)}</option>`
    ).join('');
    const catOptions = CATEGORY_KEYS.map(k =>
      `<option value="${k}"${(lesson?.category || 'success') === k ? ' selected' : ''}>${t(`cat_${k}`)}</option>`
    ).join('');
    const impactOptions = IMPACT_KEYS.map(k =>
      `<option value="${k}"${(lesson?.impact || 'medium') === k ? ' selected' : ''}>${t(`impact_${k}`)}</option>`
    ).join('');

    const body = `
      <div class="ll__form">
        <div class="ll__form-group">
          <label class="ll__form-label">${t('fieldTitle')}</label>
          <input class="field ll__form-input" data-field="title" value="${escAttr(lesson?.title || '')}"
            placeholder="${escAttr(t('fieldTitlePlaceholder'))}">
        </div>
        <div class="ll__form-row">
          <div class="ll__form-group">
            <label class="ll__form-label">${t('fieldCategory')}</label>
            <select class="field ll__form-select" data-field="category">${catOptions}</select>
          </div>
          <div class="ll__form-group">
            <label class="ll__form-label">${t('fieldPhase')}</label>
            <select class="field ll__form-select" data-field="phase">${phaseOptions}</select>
          </div>
        </div>
        <div class="ll__form-row">
          <div class="ll__form-group">
            <label class="ll__form-label">${t('fieldImpact')}</label>
            <select class="field ll__form-select" data-field="impact">${impactOptions}</select>
          </div>
          <div class="ll__form-group">
            <label class="ll__form-label">${t('fieldOwner')}</label>
            <input class="field ll__form-input" data-field="owner" value="${escAttr(lesson?.owner || '')}"
              placeholder="${escAttr(t('fieldOwnerPlaceholder'))}">
          </div>
        </div>
        <div class="ll__form-group">
          <label class="ll__form-label">${t('fieldDescription')}</label>
          <textarea class="field ll__form-textarea" data-field="description"
            placeholder="${escAttr(t('fieldDescriptionPlaceholder'))}">${escHtml(lesson?.description || '')}</textarea>
        </div>
        <div class="ll__form-group">
          <label class="ll__form-label">${t('fieldRootCause')}</label>
          <textarea class="ll__form-textarea ll__form-textarea--sm" data-field="rootCause"
            placeholder="${escAttr(t('fieldRootCausePlaceholder'))}">${escHtml(lesson?.rootCause || '')}</textarea>
        </div>
        <div class="ll__form-group">
          <label class="ll__form-label">${t('fieldRecommendation')}</label>
          <textarea class="field ll__form-textarea" data-field="recommendation"
            placeholder="${escAttr(t('fieldRecommendationPlaceholder'))}">${escHtml(lesson?.recommendation || '')}</textarea>
        </div>
        <div class="ll__form-group">
          <label class="ll__form-label">${t('fieldActions')}</label>
          <div class="ll__action-input-row">
            <input class="field ll__form-input" data-ref="actionInput"
              placeholder="${escAttr(t('fieldActionPlaceholder'))}">
            <button class="btn btn--sm" data-ref="addActionBtn" type="button">+</button>
          </div>
          <div class="ll__action-tags" data-ref="actionTags"></div>
        </div>
      </div>
    `;

    this._context.showModal.form(
      lesson ? t('editTitle') : t('addTitle'),
      body,
      {
        confirmLabel: this._context.i18n.t('common.save'),
        cancelLabel: this._context.i18n.t('common.cancel'),
        onMount: (modalEl) => {
          this._bindModalEvents(modalEl);
          this._renderModalActionTags(modalEl);
          const titleInput = modalEl.querySelector('[data-field="title"]');
          if (titleInput) setTimeout(() => titleInput.focus(), 100);
        },
        onConfirm: (modalEl) => {
          const title = modalEl.querySelector('[data-field="title"]')?.value?.trim();
          if (!title) {
            modalEl.querySelector('[data-field="title"]')?.focus();
            return false; // prevent close
          }
          const data = {
            title,
            category: modalEl.querySelector('[data-field="category"]')?.value || 'success',
            phase: modalEl.querySelector('[data-field="phase"]')?.value || 'control',
            impact: modalEl.querySelector('[data-field="impact"]')?.value || 'medium',
            owner: modalEl.querySelector('[data-field="owner"]')?.value?.trim() || '',
            description: modalEl.querySelector('[data-field="description"]')?.value?.trim() || '',
            rootCause: modalEl.querySelector('[data-field="rootCause"]')?.value?.trim() || '',
            recommendation: modalEl.querySelector('[data-field="recommendation"]')?.value?.trim() || '',
            actions: [...this._tempActions],
          };
          if (lesson) {
            const idx = this._lessons.findIndex(l => l.id === lesson.id);
            if (idx !== -1) {
              this._lessons[idx] = { ...this._lessons[idx], ...data, updatedAt: Date.now() };
            }
          } else {
            this._lessons.push({ id: uid(), ...data, createdAt: Date.now(), updatedAt: Date.now() });
          }
          this._save();
          this._render();
        },
      }
    );
  },

  /**
   * Bind events inside the modal.
   */
  _bindModalEvents(modalEl) {
    const addBtn = modalEl.querySelector('[data-ref="addActionBtn"]');
    const actionInput = modalEl.querySelector('[data-ref="actionInput"]');

    const addAction = () => {
      const val = actionInput?.value?.trim();
      if (!val) return;
      this._tempActions.push({ text: val, done: false });
      actionInput.value = '';
      this._renderModalActionTags(modalEl);
      actionInput.focus();
    };

    addBtn?.addEventListener('click', addAction);
    actionInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addAction(); }
    });
  },

  /**
   * Render action tags inside the modal.
   */
  _renderModalActionTags(modalEl) {
    const container = modalEl.querySelector('[data-ref="actionTags"]');
    if (!container) return;
    container.innerHTML = this._tempActions.map((a, i) =>
      `<span class="ll__action-tag">${escHtml(a.text)}
        <button class="ll__action-tag-remove" data-remove-idx="${i}" type="button">&times;</button>
      </span>`
    ).join('');
    container.querySelectorAll('.ll__action-tag-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        this._tempActions.splice(parseInt(btn.dataset.removeIdx, 10), 1);
        this._renderModalActionTags(modalEl);
      });
    });
  },

  // ─── Events ─────────────────────────────────────────────────

  _bindEvents(t) {
    const el = this._container;

    // Search input
    const searchInput = el.querySelector('[data-ref="search"]');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this._search = searchInput.value;
        this._renderList(t);
      });
    }

    // Filter chips
    el.querySelectorAll('.ll__filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this._filter = chip.dataset.filter;
        el.querySelectorAll('.ll__filter-chip').forEach(c => c.classList.remove('ll__filter-chip--active'));
        chip.classList.add('ll__filter-chip--active');
        this._renderList(t);
      });
    });

    // Add button
    el.querySelector('[data-action="add"]')?.addEventListener('click', () => {
      this._openModal(null);
    });

    // Export
    el.querySelector('[data-action="export-json"]')?.addEventListener('click', () => this._exportJSON());

    // Import
    el.querySelector('[data-action="import-json"]')?.addEventListener('click', () => {
      el.querySelector('[data-ref="fileImport"]')?.click();
    });
    el.querySelector('[data-ref="fileImport"]')?.addEventListener('change', (e) => this._handleImport(e, t));

    // Card interactions (delegated)
    this._bindCardEvents(el, t);
  },

  /**
   * Bind delegated events for card interactions (once per render).
   */
  _bindCardEvents(el, t) {
    const list = el.querySelector('[data-ref="list"]');
    if (!list) return;

    // Remove previous listener if any
    if (this._cardClickHandler) {
      list.removeEventListener('click', this._cardClickHandler);
    }

    this._cardClickHandler = (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;

      const action = target.dataset.action;
      const id = target.dataset.id;
      const lessonId = target.dataset.lesson;

      if (action === 'toggle-card' && id) {
        if (this._openCards.has(id)) {
          this._openCards.delete(id);
        } else {
          this._openCards.add(id);
        }
        this._renderList(t);
      } else if (action === 'edit' && id) {
        const lesson = this._lessons.find(l => l.id === id);
        if (lesson) this._openModal(lesson);
      } else if (action === 'delete' && id) {
        this._context.showModal.confirm(t('deleteConfirm')).then(confirmed => {
          if (!confirmed) return;
          this._lessons = this._lessons.filter(l => l.id !== id);
          this._openCards.delete(id);
          this._save();
          this._render();
        });
      } else if (action === 'toggle-action' && lessonId) {
        const idx = parseInt(target.dataset.idx, 10);
        const lesson = this._lessons.find(l => l.id === lessonId);
        if (lesson && lesson.actions[idx] !== undefined) {
          lesson.actions[idx].done = !lesson.actions[idx].done;
          this._save();
          this._renderList(t);
          this._updateStats(t);
        }
      }
    };

    list.addEventListener('click', this._cardClickHandler);
  },

  /**
   * Re-render just the list area (for search/filter without full re-render).
   */
  _renderList(t) {
    const list = this._container.querySelector('[data-ref="list"]');
    if (!list) return;
    const filtered = this._getFiltered();
    list.innerHTML = filtered.length === 0
      ? this._renderEmpty(t)
      : filtered.map(l => this._renderCard(l, t)).join('');
    // Re-bind card events
    this._bindCardEvents(this._container, t);
    this._updateStats(t);
  },

  /**
   * Update stats bar without full re-render.
   */
  _updateStats(t) {
    const stats = computeStats(this._lessons);
    const statEls = this._container.querySelectorAll('.ll__stat-value');
    if (statEls.length >= 5) {
      statEls[0].textContent = stats.total;
      statEls[1].textContent = stats.success;
      statEls[2].textContent = stats.problem;
      statEls[3].textContent = stats.improve;
      statEls[4].textContent = stats.openActions;
    }
  },

  // ─── Persistence ────────────────────────────────────────────

  _save() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  // ─── Export / Import ────────────────────────────────────────

  _exportJSON() {
    const blob = new Blob([JSON.stringify(this._lessons, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lessons-learned_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  _handleImport(event, t) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (Array.isArray(data)) {
          const count = data.length;
          for (const l of data) {
            if (!l.id) l.id = uid();
            this._lessons.push(l);
          }
          this._save();
          this._render();
          this._context.notify(
            this._context.i18n.t('modules.lessons-learned.importSuccess', { count })
          );
        }
      } catch (_err) {
        this._context.notify(
          this._context.i18n.t('modules.lessons-learned.importError')
        );
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  },
};
