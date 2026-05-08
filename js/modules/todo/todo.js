/**
 * D.Mike — Todo Module (todo.js)
 * Task list with text, due date, owner, status.
 * Inline editing, sorting, filtering.
 * DMAIC phase: Define
 */

const STATUSES = ['open', 'in-progress', 'done', 'blocked'];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default {
  id: 'todo',
  phase: 'define',
  icon: 'check-square',
  i18nKey: 'modules.todo',
  version: '1.0.0',
  help: () => import('./todo-help.js'),

  _container: null,
  _context: null,
  _items: [],
  _filterStatus: 'all',
  _filterOwner: 'all',
  _search: '',
  _sortCol: 'due',
  _sortAsc: true,
  _cssLoaded: '',

  _t(key) { return this._context.i18n.t(`modules.todo.${key}`); },

  _hasCalendar() {
    const phases = this._context.stateManager.get('phases') || {};
    return Object.values(phases).flat().some(m => m.moduleId === 'dmaic-calendar');
  },

  // ─── Lifecycle ─────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;
    this._items = [];
    this._filterStatus = 'all';
    this._filterOwner = 'all';
    this._search = '';
    this._sortCol = 'due';
    this._sortAsc = true;

    if (!this._cssLoaded) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'js/modules/todo/todo.css';
      document.head.appendChild(link);
      this._cssLoaded = link;
    }

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) this._importState(saved);

    this._onModuleChange = () => this._render();
    context.eventBus.on('module:added', this._onModuleChange);
    context.eventBus.on('module:removed', this._onModuleChange);

    this._render();
  },

  async destroy() {
    if (this._onModuleChange) {
      this._context.eventBus.off('module:added', this._onModuleChange);
      this._context.eventBus.off('module:removed', this._onModuleChange);
      this._onModuleChange = null;
    }
    if (this._container) this._container.innerHTML = '';
  },

  onLanguageChange() { this._render(); },
  onThemeChange() {},

  // ─── Data hooks ────────────────────────────────────────

  getState() {
    return {
      items: JSON.parse(JSON.stringify(this._items)),
      filterStatus: this._filterStatus,
      filterOwner: this._filterOwner,
      sortCol: this._sortCol,
      sortAsc: this._sortAsc,
    };
  },

  setState(data) {
    this._importState(data);
    this._render();
  },

  _importState(data) {
    if (!data) return;
    if (Array.isArray(data.items)) this._items = data.items;
    if (data.filterStatus) this._filterStatus = data.filterStatus;
    if (data.filterOwner) this._filterOwner = data.filterOwner;
    if (data.sortCol) this._sortCol = data.sortCol;
    if (typeof data.sortAsc === 'boolean') this._sortAsc = data.sortAsc;
  },

  _save() {
    this._context.stateManager.setModuleState(
      this._context.instanceId,
      this.getState()
    );
    this._syncCalendar();
  },

  _syncCalendar() {
    if (!this._hasCalendar()) return;
    const items = this._items
      .filter(i => i.cal && i.text && i.due)
      .map(i => ({ id: i.id, title: i.text, date: i.due, status: i.status }));
    this._context.eventBus.emit('todo:calendar-sync', items);
  },

  // ─── Filtering & sorting ───────────────────────────────

  _getOwners() {
    const set = new Set();
    this._items.forEach(i => { if (i.owner?.trim()) set.add(i.owner.trim()); });
    return [...set].sort();
  },

  _filtered() {
    const q = this._search.toLowerCase();
    return this._items.filter(i => {
      if (this._filterStatus !== 'all' && i.status !== this._filterStatus) return false;
      if (this._filterOwner !== 'all' && (i.owner || '').trim() !== this._filterOwner) return false;
      if (q && !i.text.toLowerCase().includes(q) && !(i.owner || '').toLowerCase().includes(q)) return false;
      return true;
    });
  },

  _sorted(list) {
    const dir = this._sortAsc ? 1 : -1;
    return [...list].sort((a, b) => {
      let va, vb;
      switch (this._sortCol) {
        case 'text':   va = a.text.toLowerCase(); vb = b.text.toLowerCase(); break;
        case 'owner':  va = (a.owner || '').toLowerCase(); vb = (b.owner || '').toLowerCase(); break;
        case 'due':    va = a.due || '9999'; vb = b.due || '9999'; break;
        case 'status': va = STATUSES.indexOf(a.status); vb = STATUSES.indexOf(b.status); break;
        default:       return 0;
      }
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return 0;
    });
  },

  // ─── Render ────────────────────────────────────────────

  _render() {
    const t = (k) => this._t(k);
    const owners = this._getOwners();
    const filtered = this._sorted(this._filtered());
    const today = todayISO();

    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const sortArrow = (col) => {
      if (this._sortCol !== col) return '<span class="todo__sort-arrow">\u2195</span>';
      return `<span class="todo__sort-arrow todo__sort-arrow--active">${this._sortAsc ? '\u25b2' : '\u25bc'}</span>`;
    };

    const statusOpts = (current) => STATUSES.map(s =>
      `<option value="${s}" ${s === current ? 'selected' : ''}>${t('status_' + s)}</option>`
    ).join('');

    const ownerFilterOpts = `<option value="all">${t('allOwners')}</option>` +
      owners.map(o => `<option value="${esc(o)}" ${this._filterOwner === o ? 'selected' : ''}>${esc(o)}</option>`).join('');

    const statusFilterOpts = `<option value="all">${t('allStatuses')}</option>` +
      STATUSES.map(s => `<option value="${s}" ${this._filterStatus === s ? 'selected' : ''}>${t('status_' + s)}</option>`).join('');

    const hasCal = this._hasCalendar();

    this._container.innerHTML = `
      <div class="module-todo">
        <div class="todo__toolbar">
          <button class="dmike-btn-run todo__add-btn" data-action="add">+ ${t('addTodo')}</button>
          <span class="todo__counter">${filtered.length} / ${this._items.length}</span>
          <div class="todo__filter-group">
            <span class="todo__filter-label">${t('filter')}:</span>
            <select class="field todo__filter-select" data-filter="status">${statusFilterOpts}</select>
            <select class="field todo__filter-select" data-filter="owner">${ownerFilterOpts}</select>
            <input type="text" class="field todo__search" data-filter="search"
                   value="${esc(this._search)}" placeholder="${t('searchPlaceholder')}" />
          </div>
        </div>
        <div class="todo__table-wrap">
          ${filtered.length === 0
            ? `<div class="todo__empty">${this._items.length === 0 ? t('emptyState') : t('noMatch')}</div>`
            : `<table class="todo__table">
              <thead><tr>
                <th class="todo__col-check"></th>
                <th class="todo__col-text" data-sort="text">${t('colText')} ${sortArrow('text')}</th>
                <th class="todo__col-owner" data-sort="owner">${t('colOwner')} ${sortArrow('owner')}</th>
                <th class="todo__col-due" data-sort="due">${t('colDue')} ${sortArrow('due')}</th>
                <th class="todo__col-status" data-sort="status">${t('colStatus')} ${sortArrow('status')}</th>
                ${hasCal ? `<th class="todo__col-cal" title="${t('showInCalendar')}">&#x1F4C5;</th>` : ''}
                <th class="todo__col-actions"></th>
              </tr></thead>
              <tbody>
                ${filtered.map(item => {
                  const isDone = item.status === 'done';
                  const isOverdue = !isDone && item.due && item.due < today;
                  const rowCls = [
                    isDone ? 'todo__row--done' : '',
                    isOverdue ? 'todo__row--overdue' : '',
                  ].filter(Boolean).join(' ');
                  return `<tr class="${rowCls}" data-id="${item.id}">
                    <td class="todo__col-check">
                      <input type="checkbox" class="todo__check" data-action="toggle" ${isDone ? 'checked' : ''} />
                    </td>
                    <td class="todo__cell-text">
                      <input type="text" class="todo__inline-input" data-field="text"
                             value="${esc(item.text)}" placeholder="${t('textPlaceholder')}" />
                    </td>
                    <td>
                      <input type="text" class="todo__inline-input" data-field="owner"
                             value="${esc(item.owner)}" placeholder="${t('ownerPlaceholder')}" />
                    </td>
                    <td class="todo__cell-due">
                      <input type="date" class="todo__inline-date" data-field="due"
                             value="${item.due || ''}" />
                    </td>
                    <td>
                      <select class="todo__inline-select" data-field="status">${statusOpts(item.status)}</select>
                    </td>
                    ${hasCal ? `<td class="todo__col-cal">
                      <button class="todo__cal-btn ${item.cal ? 'todo__cal-btn--active' : ''}"
                              data-action="cal" title="${t('showInCalendar')}">&#x1F4C5;</button>
                    </td>` : ''}
                    <td>
                      <button class="todo__delete-btn" data-action="delete" title="${t('delete')}">\u2715</button>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>`
          }
        </div>
      </div>
    `;

    this._bindEvents();
  },

  // ─── Events ────────────────────────────────────────────

  _bindEvents() {
    const el = this._container;

    // Add
    el.querySelector('[data-action="add"]')?.addEventListener('click', () => {
      this._items.push({ id: uid(), text: '', owner: '', due: '', status: 'open', cal: false });
      this._save();
      this._render();
      // Focus the new row's text input
      const inputs = el.querySelectorAll('.todo__inline-input[data-field="text"]');
      inputs[inputs.length - 1]?.focus();
    });

    // Sort
    el.querySelectorAll('[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (this._sortCol === col) {
          this._sortAsc = !this._sortAsc;
        } else {
          this._sortCol = col;
          this._sortAsc = true;
        }
        this._save();
        this._render();
      });
    });

    // Filters
    el.querySelector('[data-filter="status"]')?.addEventListener('change', (e) => {
      this._filterStatus = e.target.value;
      this._save();
      this._render();
    });
    el.querySelector('[data-filter="owner"]')?.addEventListener('change', (e) => {
      this._filterOwner = e.target.value;
      this._save();
      this._render();
    });
    el.querySelector('[data-filter="search"]')?.addEventListener('input', (e) => {
      this._search = e.target.value;
      this._render();
    });

    // Inline edits
    el.querySelectorAll('.todo__inline-input, .todo__inline-date, .todo__inline-select').forEach(input => {
      const row = input.closest('tr');
      if (!row) return;
      const id = row.dataset.id;
      const field = input.dataset.field;
      input.addEventListener('change', () => {
        const item = this._items.find(i => i.id === id);
        if (!item) return;
        item[field] = input.value;
        this._save();
        if (field === 'status' || field === 'owner') this._render();
      });
    });

    // Toggle done
    el.querySelectorAll('[data-action="toggle"]').forEach(cb => {
      const row = cb.closest('tr');
      if (!row) return;
      cb.addEventListener('change', () => {
        const item = this._items.find(i => i.id === row.dataset.id);
        if (!item) return;
        item.status = cb.checked ? 'done' : 'open';
        this._save();
        this._render();
      });
    });

    // Calendar toggle
    el.querySelectorAll('[data-action="cal"]').forEach(btn => {
      const row = btn.closest('tr');
      if (!row) return;
      btn.addEventListener('click', () => {
        const item = this._items.find(i => i.id === row.dataset.id);
        if (!item) return;
        item.cal = !item.cal;
        this._save();
        this._render();
      });
    });

    // Delete
    el.querySelectorAll('[data-action="delete"]').forEach(btn => {
      const row = btn.closest('tr');
      if (!row) return;
      btn.addEventListener('click', () => {
        this._items = this._items.filter(i => i.id !== row.dataset.id);
        this._save();
        this._render();
      });
    });
  },
};
