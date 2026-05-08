/**
 * D.Mike — DMAIC Calendar Module (dmaic-calendar.js)
 * Project calendar with month / week views, DMAIC phase tagging,
 * drag & drop, resize, and configurable time axis.
 * DMAIC phase: Define
 */

import { getPhaseIds, DEFAULT_CYCLE } from '../../core/cycles/cycles.js';
const DAYS_SHORT_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DAYS_SHORT_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ALL_DAYS_DE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const ALL_DAYS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const SNAP = 5, MIN_DUR = 5, HOUR_H = 60;

/** Phase color from CSS variable. */
function phaseColor(phase) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--color-phase-${phase}`).trim() || '#888';
}

function fmt2(n) { return String(n).padStart(2, '0'); }
function dateKey(y, m, d) { return `${y}-${fmt2(m + 1)}-${fmt2(d)}`; }
function dkd(d) { return dateKey(d.getFullYear(), d.getMonth(), d.getDate()); }
function isoDow(d) { return (d.getDay() + 6) % 7; }
function getMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  dt.setDate(dt.getDate() - day + (day === 0 ? -6 : 1));
  dt.setHours(0, 0, 0, 0);
  return dt;
}
function snp(m) { return Math.round(m / SNAP) * SNAP; }
function mtt(m) { m = Math.max(0, Math.min(1439, m)); return fmt2(Math.floor(m / 60)) + ':' + fmt2(m % 60); }
function ttm(t) { const [h, m] = (t || '09:00').split(':').map(Number); return h * 60 + m; }
function fmtEnd(t, dur) { return mtt(ttm(t) + dur); }
function fmtDur(m) {
  if (m < 60) return m + 'min';
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}min` : `${h}h`;
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

export default {
  id: 'dmaic-calendar',
  phase: 'define',
  icon: 'calendar',
  i18nKey: 'modules.dmaic-calendar',
  version: '1.0.0',
  help: () => import('./dmaic-calendar-help.js'),

  /** @type {object|null} */ _context: null,
  /** @type {HTMLElement|null} */ _container: null,
  /** @type {object[]} */ _events: [],
  /** @type {number} */ _currentYear: 0,
  /** @type {number} */ _currentMonth: 0,
  /** @type {Date} */ _currentWeekStart: null,
  /** @type {string|null} */ _editingId: null,
  /** @type {string|null} */ _activePhaseFilter: null,
  /** @type {string} */ _viewMode: 'month',
  /** @type {number} */ _axisFrom: 6,
  /** @type {number} */ _axisTo: 22,
  /** @type {number} */ _dayFrom: 0,
  /** @type {number} */ _dayTo: 6,
  /** @type {HTMLElement[]} */ _weekColEls: [],
  /** @type {Date[]} */ _weekDates: [],
  /** @type {HTMLElement|null} */ _weekBodyEl: null,
  /** @type {Function|null} */ _escHandler: null,
  /** @type {string} */ _cssLoaded: '',

  // ─── Helpers (axis) ────────────────────────────────────
  _visibleDayIndices() { const a = []; for (let i = this._dayFrom; i <= this._dayTo; i++) a.push(i); return a; },
  _getHoursArr() { const a = []; for (let h = this._axisFrom; h < this._axisTo; h++) a.push(h); return a; },
  _gStart() { return this._axisFrom * 60; },
  _gEnd() { return this._axisTo * 60; },
  _minToPx(m) { return m - this._gStart(); },
  _pxToMin(px) { return this._gStart() + px; },

  // ─── i18n helpers ──────────────────────────────────────
  _t(key) { return this._context.i18n.t(`modules.dmaic-calendar.${key}`); },
  _lang() { return this._context.language || 'de'; },
  _daysShort() { return this._lang() === 'en' ? DAYS_SHORT_EN : DAYS_SHORT_DE; },
  _allDays() { return this._lang() === 'en' ? ALL_DAYS_EN : ALL_DAYS_DE; },
  _months() { return this._lang() === 'en' ? MONTHS_EN : MONTHS_DE; },

  // ─── Lifecycle ─────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;
    this._events = [];
    this._editingId = null;
    this._activePhaseFilter = null;
    this._viewMode = 'month';
    this._axisFrom = 6;
    this._axisTo = 22;
    this._dayFrom = 0;
    this._dayTo = 6;

    // Load CSS
    if (!this._cssLoaded) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'js/modules/dmaic-calendar/dmaic-calendar.css';
      document.head.appendChild(link);
      this._cssLoaded = link;
    }

    const today = new Date();
    this._currentYear = today.getFullYear();
    this._currentMonth = today.getMonth();
    this._currentWeekStart = getMonday(today);

    // Restore state
    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) this._importState(saved);

    this._onTodoSync = (items) => this._handleTodoSync(items);
    context.eventBus.on('todo:calendar-sync', this._onTodoSync);

    this._buildHTML();
    this._bindEvents();
    this._render();
  },

  async destroy() {
    if (this._onTodoSync) {
      this._context.eventBus.off('todo:calendar-sync', this._onTodoSync);
      this._onTodoSync = null;
    }
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
    if (this._container) this._container.innerHTML = '';
  },

  onLanguageChange() { this._render(); this._populateSelects(); },
  onThemeChange() { /* CSS custom properties handle theme */ },

  // ─── Data hooks ────────────────────────────────────────

  getState() {
    return {
      events: JSON.parse(JSON.stringify(this._events)),
      axisFrom: this._axisFrom,
      axisTo: this._axisTo,
      dayFrom: this._dayFrom,
      dayTo: this._dayTo,
    };
  },

  setState(data) { this._importState(data); this._render(); },

  _importState(data) {
    if (!data) return;
    this._events = Array.isArray(data.events) ? data.events : [];
    if (typeof data.axisFrom === 'number') this._axisFrom = data.axisFrom;
    if (typeof data.axisTo === 'number') this._axisTo = data.axisTo;
    if (typeof data.dayFrom === 'number') this._dayFrom = data.dayFrom;
    if (typeof data.dayTo === 'number') this._dayTo = data.dayTo;
  },

  _saveState() {
    if (this._context && this._context.stateManager) {
      this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
    }
  },

  // ─── HTML scaffold ─────────────────────────────────────

  _buildHTML() {
    const t = (k) => this._t(k);
    this._container.innerHTML = `
      <div class="module-calendar dmike-split" style="flex:1;min-height:0">
        <div class="dmike-split__input">
          <div class="module-calendar__input-body">
            <div>
              <div class="dmike-split__section-title">${t('phases')}</div>
              <div class="module-calendar__phase-legend" data-ref="phaseLegend"></div>
            </div>
            <div>
              <div class="dmike-split__section-title">${t('timeAxis')}</div>
              <div class="module-calendar__axis">
                <div class="module-calendar__axis-label">${t('time')}</div>
                <div class="module-calendar__axis-pair">
                  <div class="module-calendar__axis-col">
                    <label>${t('from')}</label>
                    <select class="field" data-ref="axisFrom"></select>
                  </div>
                  <div class="module-calendar__axis-col">
                    <label>${t('to')}</label>
                    <select class="field" data-ref="axisTo"></select>
                  </div>
                </div>
                <div class="module-calendar__axis-label">${t('weekdays')}</div>
                <div class="module-calendar__axis-pair">
                  <div class="module-calendar__axis-col">
                    <label>${t('from')}</label>
                    <select class="field" data-ref="dayFrom"></select>
                  </div>
                  <div class="module-calendar__axis-col">
                    <label>${t('to')}</label>
                    <select class="field" data-ref="dayTo"></select>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <div class="dmike-split__section-title">${t('upcoming')}</div>
              <div class="module-calendar__upcoming" data-ref="upcoming"></div>
            </div>
            <button class="dmike-btn-run module-calendar__btn-new" data-ref="btnNew">+ ${t('newEvent')}</button>
          </div>
        </div>
        <div class="dmike-split__output">
          <div class="module-calendar__controls">
            <button class="module-calendar__nav-btn" data-ref="prevPeriod">&#9664;</button>
            <div class="module-calendar__title" data-ref="calTitle"></div>
            <button class="module-calendar__nav-btn" data-ref="nextPeriod">&#9654;</button>
            <div class="module-calendar__right">
              <div class="module-calendar__view-toggle" data-ref="viewToggle">
                <button class="active" data-view="month">${t('month')}</button>
                <button data-view="week">${t('week')}</button>
              </div>
              <button class="module-calendar__today-btn" data-ref="todayBtn">${t('today')}</button>
            </div>
          </div>
          <div class="module-calendar__grid" data-ref="calGrid"></div>
          <div class="module-calendar__week" data-ref="weekView"></div>
        </div>
      </div>
      <div class="module-calendar__overlay" data-ref="overlay">
        <div class="module-calendar__modal">
          <div class="module-calendar__modal-header">
            <h2 data-ref="modalTitle">${t('newEvent')}</h2>
            <button class="module-calendar__modal-close" data-ref="modalClose">&times;</button>
          </div>
          <div class="module-calendar__modal-body">
            <div class="field-group">
              <label>${t('title')}</label>
              <input type="text" class="field" data-ref="evTitle" placeholder="${t('titlePlaceholder')}">
            </div>
            <div class="module-calendar__row-3">
              <div class="field-group">
                <label>${t('date')}</label>
                <input type="date" class="field" data-ref="evDate">
              </div>
              <div class="field-group">
                <label>${t('time')}</label>
                <input type="time" class="field" data-ref="evTime" value="09:00" step="300">
              </div>
              <div class="field-group">
                <label>${t('duration')}</label>
                <input type="number" class="field field--num" data-ref="evDuration" value="60" min="5">
              </div>
            </div>
            <div class="field-group">
              <label>${t('phase')}</label>
              <div class="module-calendar__phase-select" data-ref="phaseSelect"></div>
            </div>
            <div class="field-group">
              <label>${t('description')}</label>
              <textarea class="field" data-ref="evDesc" placeholder="${t('descPlaceholder')}"></textarea>
            </div>
            <button class="module-calendar__btn-delete" data-ref="btnDelete">${t('deleteEvent')}</button>
            <div class="module-calendar__modal-actions">
              <button class="module-calendar__btn-cancel" data-ref="btnCancel">${t('cancel')}</button>
              <button class="module-calendar__btn-save" data-ref="btnSave">${t('save')}</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this._populateSelects();
    this._buildPhaseLegend();
    this._buildPhaseChips();
  },

  /** @param {string} ref */
  _ref(ref) {
    return this._container.querySelector(`[data-ref="${ref}"]`);
  },

  _populateSelects() {
    const sf = this._ref('axisFrom');
    const st = this._ref('axisTo');
    sf.innerHTML = '';
    st.innerHTML = '';
    for (let h = 0; h <= 23; h++) {
      const l = fmt2(h) + ':00';
      sf.innerHTML += `<option value="${h}"${h === this._axisFrom ? ' selected' : ''}>${l}</option>`;
      st.innerHTML += `<option value="${h}"${h === this._axisTo ? ' selected' : ''}>${l}</option>`;
    }

    const df = this._ref('dayFrom');
    const dt = this._ref('dayTo');
    const allDays = this._allDays();
    df.innerHTML = '';
    dt.innerHTML = '';
    allDays.forEach((d, i) => {
      df.innerHTML += `<option value="${i}"${i === this._dayFrom ? ' selected' : ''}>${d}</option>`;
      dt.innerHTML += `<option value="${i}"${i === this._dayTo ? ' selected' : ''}>${d}</option>`;
    });
  },

  _buildPhaseLegend() {
    const el = this._ref('phaseLegend');
    el.innerHTML = '';
    const i18n = this._context.i18n;
    const cycleId = this._context?.stateManager?.get('projectMeta.cycle') || DEFAULT_CYCLE;
    getPhaseIds(cycleId).forEach(p => {
      const tag = document.createElement('div');
      tag.className = 'module-calendar__phase-tag';
      tag.innerHTML = `<span class="module-calendar__phase-dot" style="background:${phaseColor(p)}"></span>${i18n.t('phases.' + p)}`;
      tag.addEventListener('click', () => {
        if (this._activePhaseFilter === p) {
          this._activePhaseFilter = null;
          tag.classList.remove('module-calendar__phase-tag--active');
        } else {
          el.querySelectorAll('.module-calendar__phase-tag').forEach(x => x.classList.remove('module-calendar__phase-tag--active'));
          this._activePhaseFilter = p;
          tag.classList.add('module-calendar__phase-tag--active');
        }
        this._render();
      });
      el.appendChild(tag);
    });
  },

  _buildPhaseChips() {
    const el = this._ref('phaseSelect');
    el.innerHTML = '';
    const i18n = this._context.i18n;
    const cycleId = this._context?.stateManager?.get('projectMeta.cycle') || DEFAULT_CYCLE;
    getPhaseIds(cycleId).forEach(p => {
      const c = document.createElement('span');
      c.className = 'module-calendar__phase-chip';
      c.dataset.phase = p;
      c.textContent = i18n.t('phases.' + p);
      c.style.color = phaseColor(p);
      c.addEventListener('click', () => {
        el.querySelectorAll('.module-calendar__phase-chip').forEach(x => x.classList.remove('module-calendar__phase-chip--selected'));
        c.classList.add('module-calendar__phase-chip--selected');
      });
      el.appendChild(c);
    });
  },

  // ─── Event binding ─────────────────────────────────────

  _bindEvents() {
    this._ref('axisFrom').addEventListener('change', (e) => {
      const v = +e.target.value;
      if (v >= this._axisTo) { e.target.value = this._axisFrom; return; }
      this._axisFrom = v;
      this._saveState();
      this._render();
    });
    this._ref('axisTo').addEventListener('change', (e) => {
      const v = +e.target.value;
      if (v <= this._axisFrom) { e.target.value = this._axisTo; return; }
      this._axisTo = v;
      this._saveState();
      this._render();
    });
    this._ref('dayFrom').addEventListener('change', (e) => {
      const v = +e.target.value;
      if (v > this._dayTo) { e.target.value = this._dayFrom; return; }
      this._dayFrom = v;
      this._saveState();
      this._render();
    });
    this._ref('dayTo').addEventListener('change', (e) => {
      const v = +e.target.value;
      if (v < this._dayFrom) { e.target.value = this._dayTo; return; }
      this._dayTo = v;
      this._saveState();
      this._render();
    });

    this._ref('viewToggle').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-view]');
      if (!b) return;
      this._viewMode = b.dataset.view;
      this._ref('viewToggle').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      if (this._viewMode === 'week') {
        this._currentWeekStart = getMonday(new Date(this._currentYear, this._currentMonth, 15));
      }
      this._render();
    });

    this._ref('prevPeriod').addEventListener('click', () => {
      if (this._viewMode === 'month') {
        this._currentMonth--;
        if (this._currentMonth < 0) { this._currentMonth = 11; this._currentYear--; }
      } else {
        this._currentWeekStart = new Date(this._currentWeekStart);
        this._currentWeekStart.setDate(this._currentWeekStart.getDate() - 7);
      }
      this._render();
    });

    this._ref('nextPeriod').addEventListener('click', () => {
      if (this._viewMode === 'month') {
        this._currentMonth++;
        if (this._currentMonth > 11) { this._currentMonth = 0; this._currentYear++; }
      } else {
        this._currentWeekStart = new Date(this._currentWeekStart);
        this._currentWeekStart.setDate(this._currentWeekStart.getDate() + 7);
      }
      this._render();
    });

    this._ref('todayBtn').addEventListener('click', () => {
      const today = new Date();
      this._currentYear = today.getFullYear();
      this._currentMonth = today.getMonth();
      this._currentWeekStart = getMonday(today);
      this._render();
    });

    this._ref('btnNew').addEventListener('click', () => this._openNew(''));

    // Modal
    this._ref('btnSave').addEventListener('click', () => this._handleSave());
    this._ref('btnDelete').addEventListener('click', () => this._handleDelete());
    this._ref('btnCancel').addEventListener('click', () => this._closeModal());
    this._ref('modalClose').addEventListener('click', () => this._closeModal());
    this._ref('overlay').addEventListener('click', (e) => {
      if (e.target === this._ref('overlay')) this._closeModal();
    });

    this._escHandler = (e) => { if (e.key === 'Escape') this._closeModal(); };
    document.addEventListener('keydown', this._escHandler);
  },

  // ─── Render dispatcher ─────────────────────────────────

  _render() {
    const g = this._ref('calGrid');
    const w = this._ref('weekView');
    if (this._viewMode === 'month') {
      g.style.display = 'grid';
      w.classList.remove('module-calendar__week--show');
      this._renderMonth();
    } else {
      g.style.display = 'none';
      w.classList.add('module-calendar__week--show');
      this._renderWeek();
    }
    this._renderUpcoming();
  },

  _filteredEvents() {
    return this._activePhaseFilter
      ? this._events.filter(e => e.phase === this._activePhaseFilter)
      : this._events;
  },

  // ─── Month view ────────────────────────────────────────

  _renderMonth() {
    const g = this._ref('calGrid');
    g.innerHTML = '';
    g.style.gridTemplateColumns = 'repeat(7, 1fr)';
    this._ref('calTitle').innerHTML = `${this._months()[this._currentMonth]} <span>${this._currentYear}</span>`;

    const visDays = this._visibleDayIndices();
    const daysShort = this._daysShort();
    daysShort.forEach((d, i) => {
      const h = document.createElement('div');
      h.className = 'module-calendar__head' + (visDays.includes(i) ? '' : ' module-calendar__head--outside');
      h.textContent = d;
      g.appendChild(h);
    });

    const first = new Date(this._currentYear, this._currentMonth, 1);
    const sd = isoDow(first);
    const dim = new Date(this._currentYear, this._currentMonth + 1, 0).getDate();
    const pd = new Date(this._currentYear, this._currentMonth, 0).getDate();
    const today = new Date();
    const tk = dkd(today);
    const f = this._filteredEvents();

    // Pad before
    for (let i = sd - 1; i >= 0; i--) {
      const dd = pd - i;
      const dt = new Date(this._currentYear, this._currentMonth, -i - 1 + pd);
      g.appendChild(this._mkDay(dd, true, null, false, null, !visDays.includes(isoDow(dt))));
    }
    // Current month
    for (let d = 1; d <= dim; d++) {
      const k = dateKey(this._currentYear, this._currentMonth, d);
      const dt = new Date(this._currentYear, this._currentMonth, d);
      const outside = !visDays.includes(isoDow(dt));
      g.appendChild(this._mkDay(d, false, k, k === tk, f.filter(e => e.date === k).sort((a, b) => a.time.localeCompare(b.time)), outside));
    }
    // Pad after
    const rem = (Math.ceil(g.children.length / 7) * 7) - g.children.length;
    for (let d = 1; d <= rem; d++) {
      const dt = new Date(this._currentYear, this._currentMonth + 1, d);
      g.appendChild(this._mkDay(d, true, null, false, null, !visDays.includes(isoDow(dt))));
    }
  },

  _mkDay(num, other, key, isToday, evts, outside) {
    const c = document.createElement('div');
    let cls = 'module-calendar__day';
    if (other) cls += ' module-calendar__day--other';
    if (isToday) cls += ' module-calendar__day--today';
    if (outside) cls += ' module-calendar__day--outside';
    c.className = cls;

    const n = document.createElement('div');
    n.className = 'module-calendar__day-num';
    n.textContent = num;
    c.appendChild(n);

    if (evts && evts.length) {
      const box = document.createElement('div');
      box.className = 'module-calendar__day-events';
      const moreText = this._lang() === 'en' ? 'more' : 'mehr';
      evts.slice(0, 3).forEach(ev => {
        const t = document.createElement('div');
        t.className = 'module-calendar__day-ev';
        const color = phaseColor(ev.phase);
        t.style.background = color + '22';
        t.style.color = color;
        t.textContent = ev.title;
        t.addEventListener('click', (e) => { e.stopPropagation(); this._openEdit(ev.id); });
        box.appendChild(t);
      });
      if (evts.length > 3) {
        const m = document.createElement('div');
        m.className = 'module-calendar__day-more';
        m.textContent = `+${evts.length - 3} ${moreText}`;
        box.appendChild(m);
      }
      c.appendChild(box);
    }

    if (!other && key) c.addEventListener('click', () => this._openNew(key));
    return c;
  },

  // ─── Week view ─────────────────────────────────────────

  _renderWeek() {
    const HA = this._getHoursArr();
    const VD = this._visibleDayIndices();
    const nCols = VD.length;
    const container = this._ref('weekView');
    container.innerHTML = '';

    const ws = new Date(this._currentWeekStart);
    const allDates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws);
      d.setDate(d.getDate() + i);
      allDates.push(d);
    }
    this._weekDates = VD.map(i => allDates[i]);
    const first = this._weekDates[0];
    const last = this._weekDates[this._weekDates.length - 1];
    const today = new Date();
    const tk = dkd(today);
    const f = this._filteredEvents();
    const months = this._months();
    const daysShort = this._daysShort();

    const colTpl = `56px repeat(${nCols}, 1fr)`;

    if (first.getMonth() === last.getMonth()) {
      this._ref('calTitle').innerHTML = `${first.getDate()}. – ${last.getDate()}. ${months[first.getMonth()]} <span>${first.getFullYear()}</span>`;
    } else {
      this._ref('calTitle').innerHTML = `${first.getDate()}. ${months[first.getMonth()]} – ${last.getDate()}. ${months[last.getMonth()]} <span>${last.getFullYear()}</span>`;
    }

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'module-calendar__week-header';
    hdr.style.gridTemplateColumns = colTpl;
    hdr.innerHTML = '<div class="module-calendar__week-hcorner"></div>';
    this._weekDates.forEach(d => {
      const di = isoDow(d);
      const todayCls = dkd(d) === tk ? ' module-calendar__week-hday--today' : '';
      hdr.innerHTML += `<div class="module-calendar__week-hday${todayCls}">${daysShort[di]}<div class="module-calendar__week-hday-num">${d.getDate()}</div></div>`;
    });
    container.appendChild(hdr);

    // Body
    const body = document.createElement('div');
    body.className = 'module-calendar__week-body';
    body.style.gridTemplateColumns = colTpl;
    this._weekBodyEl = body;

    const tcol = document.createElement('div');
    tcol.className = 'module-calendar__week-time-col';
    HA.forEach(h => {
      const l = document.createElement('div');
      l.className = 'module-calendar__week-time-label';
      l.textContent = `${fmt2(h)}:00`;
      tcol.appendChild(l);
    });
    body.appendChild(tcol);

    this._weekColEls = [];
    this._weekDates.forEach((d, ci) => {
      const col = document.createElement('div');
      col.className = 'module-calendar__week-day-col';
      col.dataset.colIdx = ci;
      const key = dkd(d);

      HA.forEach(h => {
        const s = document.createElement('div');
        s.className = 'module-calendar__week-slot';
        s.addEventListener('click', () => this._openNew(key, `${fmt2(h)}:00`));
        col.appendChild(s);
      });

      // Now line
      if (key === tk) {
        const nh = today.getHours(), nm = today.getMinutes();
        const off = (nh - this._axisFrom) * 60 + nm;
        if (off >= 0 && off <= HA.length * 60) {
          const nl = document.createElement('div');
          nl.className = 'module-calendar__now-line';
          nl.style.top = off + 'px';
          nl.innerHTML = '<div class="module-calendar__now-dot"></div>';
          col.appendChild(nl);
        }
      }

      f.filter(e => e.date === key).forEach(ev => col.appendChild(this._makeWeekEvent(ev)));
      body.appendChild(col);
      this._weekColEls.push(col);
    });

    container.appendChild(body);
  },

  _makeWeekEvent(ev) {
    const sMin = ttm(ev.time);
    const dur = ev.duration || 60;
    const c = phaseColor(ev.phase);
    const block = document.createElement('div');
    block.className = 'module-calendar__week-ev';
    block.dataset.evId = ev.id;
    block.style.cssText = `top:${this._minToPx(sMin)}px;height:${Math.max(dur, 16)}px;background:${c}1a;color:${c};border-left-color:${c};`;

    const content = document.createElement('div');
    content.className = 'module-calendar__week-ev-content';
    content.innerHTML = `<div class="module-calendar__we-time">${ev.time} – ${fmtEnd(ev.time, dur)}</div><div class="module-calendar__we-title">${ev.title}</div>`;
    block.appendChild(content);

    // Resize handles
    const ht = document.createElement('div');
    ht.className = 'module-calendar__ev-handle module-calendar__ev-handle--top';
    ht.innerHTML = '<div class="module-calendar__ev-handle-pip"></div>';
    ht.addEventListener('mousedown', (e) => this._startResize(e, ev, block, 'top'));
    block.appendChild(ht);

    const hb = document.createElement('div');
    hb.className = 'module-calendar__ev-handle module-calendar__ev-handle--bot';
    hb.innerHTML = '<div class="module-calendar__ev-handle-pip"></div>';
    hb.addEventListener('mousedown', (e) => this._startResize(e, ev, block, 'bottom'));
    block.appendChild(hb);

    block.addEventListener('mousedown', (e) => {
      if (e.target.closest('.module-calendar__ev-handle')) return;
      this._startDrag(e, ev, block);
    });
    block.addEventListener('click', (e) => {
      if (block._didDrag) return;
      e.stopPropagation();
      this._openEdit(ev.id);
    });
    return block;
  },

  // ─── Drag & drop ───────────────────────────────────────

  _createGhost(col) {
    const g = document.createElement('div');
    g.className = 'module-calendar__drag-ghost';
    g.innerHTML = '<div class="module-calendar__ghost-dur"></div>';
    col.appendChild(g);
    return g;
  },

  _updateGhost(ghost, topPx, heightPx) {
    ghost.style.top = topPx + 'px';
    ghost.style.height = heightPx + 'px';
    const s = snp(this._pxToMin(topPx));
    const e = snp(this._pxToMin(topPx + heightPx));
    ghost.children[0].textContent = fmtDur(e - s);
  },

  _colFromX(mx) {
    for (let i = 0; i < this._weekColEls.length; i++) {
      const r = this._weekColEls[i].getBoundingClientRect();
      if (mx >= r.left && mx < r.right) return i;
    }
    return 0;
  },

  _snapPx(px) { return this._minToPx(snp(this._pxToMin(px))); },
  _totalH() { return this._getHoursArr().length * HOUR_H; },

  _startDrag(e, ev, block) {
    e.preventDefault();
    e.stopPropagation();
    block._didDrag = false;
    const col = block.parentElement;
    const colRect = col.getBoundingClientRect();
    const evTopPx = parseFloat(block.style.top);
    const evH = parseFloat(block.style.height);
    const grabOff = e.clientY - colRect.top + this._weekBodyEl.scrollTop - evTopPx;
    const startCol = parseInt(col.dataset.colIdx);
    let curCol = startCol, curTop = evTopPx;
    const ghost = this._createGhost(col);
    this._updateGhost(ghost, evTopPx, evH);
    block.classList.add('module-calendar__week-ev--dragging');
    const timeEl = block.querySelector('.module-calendar__we-time');

    const onMove = (e2) => {
      block._didDrag = true;
      let raw = e2.clientY - colRect.top + this._weekBodyEl.scrollTop - grabOff;
      raw = this._snapPx(Math.max(0, Math.min(this._totalH() - evH, raw)));
      curTop = raw;
      const nc = this._colFromX(e2.clientX);
      if (nc !== curCol) { ghost.remove(); this._weekColEls[nc].appendChild(ghost); curCol = nc; }
      this._updateGhost(ghost, curTop, evH);
      block.style.top = curTop + 'px';
      const sMin = snp(this._pxToMin(curTop));
      timeEl.textContent = `${mtt(sMin)} – ${mtt(sMin + (ev.duration || 60))}`;
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      block.classList.remove('module-calendar__week-ev--dragging');
      ghost.remove();
      if (!block._didDrag) return;
      ev.time = mtt(snp(this._pxToMin(curTop)));
      ev.date = dkd(this._weekDates[curCol]);
      this._saveState();
      this._render();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  },

  _startResize(e, ev, block, edge) {
    e.preventDefault();
    e.stopPropagation();
    block._didDrag = true;
    const col = block.parentElement;
    const colRect = col.getBoundingClientRect();
    const startMin = ttm(ev.time);
    const dur = ev.duration || 60;
    const endMin = startMin + dur;
    let curStartPx = this._minToPx(startMin), curH = dur;
    const ghost = this._createGhost(col);
    this._updateGhost(ghost, curStartPx, curH);
    block.classList.add('module-calendar__week-ev--dragging');
    const timeEl = block.querySelector('.module-calendar__we-time');

    const onMove = (e2) => {
      const mm = snp(this._pxToMin(e2.clientY - colRect.top + this._weekBodyEl.scrollTop));
      if (edge === 'top') {
        const ns = Math.max(this._gStart(), Math.min(mm, endMin - MIN_DUR));
        curStartPx = this._minToPx(ns);
        curH = endMin - ns;
      } else {
        const ne = Math.min(this._gEnd(), Math.max(mm, startMin + MIN_DUR));
        curH = ne - startMin;
      }
      this._updateGhost(ghost, curStartPx, curH);
      block.style.top = curStartPx + 'px';
      block.style.height = Math.max(curH, 16) + 'px';
      const s = snp(this._pxToMin(curStartPx));
      timeEl.textContent = `${mtt(s)} – ${mtt(s + curH)}`;
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      block.classList.remove('module-calendar__week-ev--dragging');
      ghost.remove();
      ev.time = mtt(snp(this._pxToMin(curStartPx)));
      ev.duration = Math.max(MIN_DUR, snp(curH));
      this._saveState();
      this._render();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  },

  // ─── Upcoming ──────────────────────────────────────────

  _renderUpcoming() {
    const el = this._ref('upcoming');
    el.innerHTML = '';
    const today = new Date();
    const tk = dkd(today);
    const locale = this._lang() === 'en' ? 'en-GB' : 'de-DE';
    const up = this._events
      .filter(e => e.date >= tk)
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
      .slice(0, 5);

    if (!up.length) {
      el.innerHTML = `<div class="module-calendar__upcoming-empty">${this._t('noEvents')}</div>`;
      return;
    }
    up.forEach(ev => {
      const item = document.createElement('div');
      item.className = 'module-calendar__upcoming-item';
      item.style.borderLeftColor = phaseColor(ev.phase);
      const d = new Date(ev.date + 'T00:00');
      item.innerHTML = `<div class="module-calendar__upcoming-date">${d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} · ${ev.time}</div><div class="module-calendar__upcoming-title">${ev.title}</div>`;
      item.addEventListener('click', () => this._openEdit(ev.id));
      el.appendChild(item);
    });
  },

  // ─── Modal ─────────────────────────────────────────────

  _openModal() {
    this._ref('overlay').classList.add('module-calendar__overlay--show');
    setTimeout(() => this._ref('evTitle').focus(), 100);
  },

  _closeModal() {
    this._ref('overlay').classList.remove('module-calendar__overlay--show');
    this._editingId = null;
  },

  _openNew(ds, t) {
    this._editingId = null;
    this._ref('modalTitle').textContent = this._t('newEvent');
    this._ref('evTitle').value = '';
    this._ref('evDate').value = ds || '';
    this._ref('evTime').value = t || '09:00';
    this._ref('evDuration').value = '60';
    this._ref('evDesc').value = '';
    this._ref('phaseSelect').querySelectorAll('.module-calendar__phase-chip').forEach(c => c.classList.remove('module-calendar__phase-chip--selected'));
    const defChip = this._ref('phaseSelect').querySelector('[data-phase="define"]');
    if (defChip) defChip.classList.add('module-calendar__phase-chip--selected');
    this._ref('btnDelete').style.display = 'none';
    this._openModal();
  },

  _openEdit(id) {
    const ev = this._events.find(e => e.id === id);
    if (!ev) return;
    this._editingId = id;
    this._ref('modalTitle').textContent = this._t('editEvent');
    this._ref('evTitle').value = ev.title;
    this._ref('evDate').value = ev.date;
    this._ref('evTime').value = ev.time;
    this._ref('evDuration').value = ev.duration || 60;
    this._ref('evDesc').value = ev.desc || '';
    this._ref('phaseSelect').querySelectorAll('.module-calendar__phase-chip').forEach(c => {
      c.classList.toggle('module-calendar__phase-chip--selected', c.dataset.phase === ev.phase);
    });
    this._ref('btnDelete').style.display = 'block';
    this._openModal();
  },

  _handleSave() {
    const title = this._ref('evTitle').value.trim();
    const date = this._ref('evDate').value;
    const time = this._ref('evTime').value;
    const duration = parseInt(this._ref('evDuration').value) || 60;
    const desc = this._ref('evDesc').value.trim();
    const chip = this._ref('phaseSelect').querySelector('.module-calendar__phase-chip--selected');
    const phase = chip ? chip.dataset.phase : 'define';

    if (!title || !date) {
      this._context.notify(this._t('requiredFields'), 'warning');
      return;
    }

    if (this._editingId) {
      const ev = this._events.find(e => e.id === this._editingId);
      if (ev) Object.assign(ev, { title, date, time, duration, desc, phase });
    } else {
      this._events.push({ id: uid(), title, date, time, duration, desc, phase });
    }
    this._saveState();
    this._closeModal();
    this._render();
  },

  _handleTodoSync(items) {
    this._events = this._events.filter(e => e.source !== 'todo');
    for (const t of items) {
      this._events.push({
        id: 'todo-' + t.id,
        title: t.title,
        date: t.date,
        time: '09:00',
        duration: 30,
        desc: '',
        phase: 'define',
        source: 'todo',
      });
    }
    this._saveState();
    this._render();
  },

  _handleDelete() {
    if (!this._editingId) return;
    this._events = this._events.filter(e => e.id !== this._editingId);
    this._saveState();
    this._closeModal();
    this._render();
  },
};
