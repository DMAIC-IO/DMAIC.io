/**
 * D.Mike — DMAIC Calendar Module (dmaic-calendar.js)
 * Project calendar with month / week views, DMAIC phase tagging,
 * drag & drop, resize, and configurable time axis.
 * Migrated to createModule + Alpine.js CSP.
 * DMAIC phase: Define
 */

import { createModule } from '../../core/template-module.js';
import { getPhaseIds, DEFAULT_CYCLE } from '../../core/cycles/cycles.js';
import {
  State, MIN_DUR,
  fmt2, dkd, isoDow, getMonday, snp, mtt, ttm, fmtEnd, fmtDur,
} from './dmaic-calendar-model.js';

const DAYS_SHORT_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DAYS_SHORT_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ALL_DAYS_DE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const ALL_DAYS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Phase color from CSS variable. */
function phaseColor(phase) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--color-phase-${phase}`).trim() || '#888';
}

export default createModule({
  config: {
    id: 'dmaic-calendar',
    engine: 'alpine',
    phase: 'define',
    icon: 'calendar',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  /**
   * Resolve relative `dayOffset` example values (days from the Monday of the
   * current week) into absolute `date` strings, so the snapshot stays centered
   * on today regardless of when it is loaded. Storage path (fromJSON) keeps
   * absolute dates and never sees `dayOffset`.
   */
  beforeLoadExample(data) {
    const anchor = getMonday(new Date());
    const out = { axisFrom: data.axisFrom, axisTo: data.axisTo, dayFrom: data.dayFrom, dayTo: data.dayTo, events: [] };
    const raw = Array.isArray(data.events) ? data.events : [];
    out.events = raw.map(ev => {
      const offset = typeof ev.dayOffset === 'number' ? ev.dayOffset : 0;
      const d = new Date(anchor);
      d.setDate(d.getDate() + offset);
      return {
        title: ev.title || '',
        date: dkd(d),
        time: ev.time || '09:00',
        duration: typeof ev.duration === 'number' ? ev.duration : 60,
        desc: ev.desc || '',
        phase: ev.phase || 'define',
      };
    });
    return out;
  },

  afterMount(module) {
    // Subscribe to the cross-module todo→calendar sync. Payload is an array of
    // { id, title, date, status }. The handler mutates the reactive Alpine model
    // so persistence + re-render happen automatically.
    const handler = (items) => {
      try {
        const cmp = module._alpineData?.();
        if (cmp) cmp.applyTodoSync(items);
      } catch { /* component not ready */ }
    };
    module._todoSyncHandler = handler;
    module._context.eventBus.on('todo:calendar-sync', handler);
  },

  data(module, _t) {
    const lang = () => module._context?.language || module._context?.i18n?.getLanguage?.() || 'de';
    const daysShort = () => (lang() === 'en' ? DAYS_SHORT_EN : DAYS_SHORT_DE);
    const allDays = () => (lang() === 'en' ? ALL_DAYS_EN : ALL_DAYS_DE);
    const months = () => (lang() === 'en' ? MONTHS_EN : MONTHS_DE);
    const phaseIds = () => {
      const cycleId = module._context?.stateManager?.get('projectMeta.cycle') || DEFAULT_CYCLE;
      return getPhaseIds(cycleId);
    };

    const today = new Date();

    return {
      // ─── Transient UI state (never persisted) ─────────────
      viewMode: 'month',
      phaseFilter: null,
      editingId: null,
      viewYear: today.getFullYear(),
      viewMonth: today.getMonth(),
      weekStartMs: getMonday(today).getTime(),
      form: { title: '', date: '', time: '09:00', duration: 60, desc: '', phase: 'define' },

      // ─── Static option ranges ─────────────────────────────
      hours24: Array.from({ length: 24 }, (_, h) => h),

      // ─── Lifecycle ────────────────────────────────────────
      init() {
        // Expose a live-data accessor so the event-bus handler (registered in
        // afterMount) can mutate the reactive model.
        const self = this;
        module._alpineData = () => self;
      },
      destroy() {
        if (module._todoSyncHandler) {
          module._context.eventBus.off('todo:calendar-sync', module._todoSyncHandler);
          module._todoSyncHandler = null;
        }
        module._alpineData = null;
      },

      // Called by the cross-module sync handler.
      applyTodoSync(items) {
        this.model.applyTodoSync(items);
      },

      // ─── i18n / localized data ────────────────────────────
      phaseIds: phaseIds(),
      phaseName: (p) => module._context.i18n.t(`phases.${  p}`),
      allDayNames: () => allDays(),
      dayHeads: () => daysShort(),

      // ─── Phase legend / filter ────────────────────────────
      phaseDotStyle: (p) => `background:${phaseColor(p)}`,
      phaseTagClass(p) {
        return this.phaseFilter === p ? 'module-calendar__phase-tag--active' : '';
      },
      togglePhaseFilter(p) {
        this.phaseFilter = this.phaseFilter === p ? null : p;
      },

      // ─── Axis selects ─────────────────────────────────────
      hourLabel: (h) => `${fmt2(h)  }:00`,
      axisFromChanged(e) {
        const v = Number(e.target.value);
        if (v >= this.model.axisTo) { e.target.value = this.model.axisFrom; return; }
        this.model.axisFrom = v;
      },
      axisToChanged(e) {
        const v = Number(e.target.value);
        if (v <= this.model.axisFrom) { e.target.value = this.model.axisTo; return; }
        this.model.axisTo = v;
      },
      dayFromChanged(e) {
        const v = Number(e.target.value);
        if (v > this.model.dayTo) { e.target.value = this.model.dayFrom; return; }
        this.model.dayFrom = v;
      },
      dayToChanged(e) {
        const v = Number(e.target.value);
        if (v < this.model.dayFrom) { e.target.value = this.model.dayTo; return; }
        this.model.dayTo = v;
      },

      // ─── Upcoming ─────────────────────────────────────────
      upcomingList() {
        return this.model.upcomingEvents(dkd(new Date()));
      },
      upcomingStyle: (ev) => `border-left-color:${phaseColor(ev.phase)}`,
      upcomingDateLabel(ev) {
        const locale = lang() === 'en' ? 'en-GB' : 'de-DE';
        const d = new Date(`${ev.date  }T00:00`);
        return `${d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} · ${ev.time}`;
      },
      newEventBtnLabel: () => `+ ${  _t('newEvent')}`,

      // ─── Controls / navigation ────────────────────────────
      viewBtnClass(v) { return this.viewMode === v ? 'active' : ''; },
      setView(v) {
        this.viewMode = v;
        if (v === 'week') {
          this.weekStartMs = getMonday(new Date(this.viewYear, this.viewMonth, 15)).getTime();
        }
      },
      prevPeriod() {
        if (this.viewMode === 'month') {
          this.viewMonth--;
          if (this.viewMonth < 0) { this.viewMonth = 11; this.viewYear--; }
        } else {
          const d = new Date(this.weekStartMs); d.setDate(d.getDate() - 7); this.weekStartMs = d.getTime();
        }
      },
      nextPeriod() {
        if (this.viewMode === 'month') {
          this.viewMonth++;
          if (this.viewMonth > 11) { this.viewMonth = 0; this.viewYear++; }
        } else {
          const d = new Date(this.weekStartMs); d.setDate(d.getDate() + 7); this.weekStartMs = d.getTime();
        }
      },
      goToday() {
        const t = new Date();
        this.viewYear = t.getFullYear();
        this.viewMonth = t.getMonth();
        this.weekStartMs = getMonday(t).getTime();
      },

      // ─── Title ────────────────────────────────────────────
      calTitleMain() {
        if (this.viewMode === 'month') return months()[this.viewMonth];
        const wd = this.weekDates();
        if (!wd.length) return '';
        const first = wd[0], last = wd[wd.length - 1];
        const m = months();
        if (first.getMonth() === last.getMonth()) {
          return `${first.getDate()}. – ${last.getDate()}. ${m[first.getMonth()]}`;
        }
        return `${first.getDate()}. ${m[first.getMonth()]} – ${last.getDate()}. ${m[last.getMonth()]}`;
      },
      calTitleYear() {
        if (this.viewMode === 'month') return String(this.viewYear);
        const wd = this.weekDates();
        if (!wd.length) return '';
        return String(wd[wd.length - 1].getFullYear());
      },

      // ─── Month view ───────────────────────────────────────
      monthGridStyle: () => 'grid-template-columns:repeat(7, 1fr)',
      monthCells() {
        return this.model.monthCells(this.viewYear, this.viewMonth, this.phaseFilter);
      },
      headClass(i) {
        const vis = this.model.visibleDayIndices();
        return `module-calendar__head${  vis.includes(i) ? '' : ' module-calendar__head--outside'}`;
      },
      dayClass(cell) {
        let cls = 'module-calendar__day';
        if (cell.other) cls += ' module-calendar__day--other';
        if (!cell.other && cell.key === dkd(new Date())) cls += ' module-calendar__day--today';
        if (!this.model.visibleDayIndices().includes(isoDow(cell.date))) cls += ' module-calendar__day--outside';
        return cls;
      },
      monthEvStyle(ev) {
        const c = phaseColor(ev.phase);
        return `background:${c}22;color:${c}`;
      },
      firstEvents: (cell) => cell.events.slice(0, 3),
      moreText(n) { return `+${n} ${  lang() === 'en' ? 'more' : 'mehr'}`; },
      onDayClick(cell) {
        if (!cell.other && cell.key) this.openNew(cell.key);
      },
      onMonthEventClick(ev, e) {
        e.stopPropagation();
        this.openEdit(ev.id);
      },

      // ─── Week view ────────────────────────────────────────
      dkd,
      weekShowClass() { return this.viewMode === 'week' ? 'module-calendar__week--show' : ''; },
      hoursList() { return this.model.hoursArr(); },
      weekDates() {
        return this.model.weekDates(this.weekStartMs, this.model.dayFrom, this.model.dayTo);
      },
      weekColStyle() {
        return `grid-template-columns:56px repeat(${this.weekDates().length}, 1fr)`;
      },
      weekHdayClass(d) {
        return `module-calendar__week-hday${  dkd(d) === dkd(new Date()) ? ' module-calendar__week-hday--today' : ''}`;
      },
      weekHdayName(d) { return daysShort()[isoDow(d)]; },
      weekTimeLabel: (h) => `${fmt2(h)}:00`,
      weekEventsForDay(d) {
        const key = dkd(d);
        return this.model.eventsForPhase(this.phaseFilter).filter(e => e.date === key);
      },
      weekEvStyle(ev) {
        const sMin = ttm(ev.time);
        const dur = ev.duration || 60;
        const c = phaseColor(ev.phase);
        return `top:${this.model.minToPx(sMin)}px;height:${Math.max(dur, 16)}px;background:${c}1a;color:${c};border-left-color:${c};`;
      },
      weekEvTimeText(ev) {
        const dur = ev.duration || 60;
        return `${ev.time} – ${fmtEnd(ev.time, dur)}`;
      },
      // Minutes-of-day → pixel offset from the top of the time grid, via the
      // model's axis→pixel primitive (single source of truth for the mapping).
      nowOffsetPx() {
        const now = new Date();
        return this.model.minToPx(now.getHours() * 60 + now.getMinutes());
      },
      showNowLine(d) {
        if (dkd(d) !== dkd(new Date())) return false;
        const off = this.nowOffsetPx();
        return off >= 0 && off <= this.model.hoursArr().length * 60;
      },
      nowLineStyle() {
        return `top:${this.nowOffsetPx()}px`;
      },
      onSlotClick(d, h) {
        this.openNew(dkd(d), `${fmt2(h)}:00`);
      },

      // ─── Week drag & resize ───────────────────────────────
      _didDrag: false,
      // Transient live-duration label shown on the event block while it is being
      // resized (e.g. "1h 30min"). null → no resize in progress (label hidden).
      resizeEvId: null,
      resizeDurMin: 0,
      resizeDurText() { return fmtDur(this.resizeDurMin); },
      showResizeDur(ev) { return this.resizeEvId === ev.id; },
      weekEvClick(ev, e) {
        if (this._didDrag) { this._didDrag = false; return; }
        e.stopPropagation();
        this.openEdit(ev.id);
      },
      weekEvMouseDown(ev, e) {
        if (e.target.closest('.module-calendar__ev-handle')) return;
        this.startDrag(ev, e);
      },
      startDrag(ev, e) {
        e.preventDefault();
        e.stopPropagation();
        this._didDrag = false;
        const block = e.currentTarget;
        const body = block.closest('.module-calendar__week-body');
        const cols = Array.from(this.$el.querySelectorAll('.module-calendar__week-day-col'));
        const col = block.parentElement;
        const colRect = col.getBoundingClientRect();
        const evTopPx = this.model.minToPx(ttm(ev.time));
        const evH = Math.max(ev.duration || 60, 16);
        const grabOff = e.clientY - colRect.top + body.scrollTop - evTopPx;
        let curCol = parseInt(col.dataset.colIdx);
        let curTop = evTopPx;
        block.classList.add('module-calendar__week-ev--dragging');
        const dates = this.weekDates();
        const totalH = this.model.totalH();

        const colFromX = (mx) => {
          for (let i = 0; i < cols.length; i++) {
            const r = cols[i].getBoundingClientRect();
            if (mx >= r.left && mx < r.right) return i;
          }
          return curCol;
        };
        const snapPx = (px) => this.model.minToPx(snp(this.model.pxToMin(px)));

        const onMove = (e2) => {
          this._didDrag = true;
          let raw = e2.clientY - colRect.top + body.scrollTop - grabOff;
          raw = snapPx(Math.max(0, Math.min(totalH - evH, raw)));
          curTop = raw;
          curCol = colFromX(e2.clientX);
          block.style.top = `${curTop  }px`;
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          block.classList.remove('module-calendar__week-ev--dragging');
          if (!this._didDrag) return;
          const target = this.model.events.find(x => x.id === ev.id);
          if (target) {
            target.time = mtt(snp(this.model.pxToMin(curTop)));
            target.date = dkd(dates[curCol]);
          }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      },
      startResize(ev, edge, e) {
        e.preventDefault();
        e.stopPropagation();
        this._didDrag = true;
        const block = e.currentTarget.closest('.module-calendar__week-ev');
        const body = block.closest('.module-calendar__week-body');
        const col = block.parentElement;
        const colRect = col.getBoundingClientRect();
        const startMin = ttm(ev.time);
        const dur = ev.duration || 60;
        const endMin = startMin + dur;
        let curStartPx = this.model.minToPx(startMin), curH = dur;
        // Show the live duration label on this block for the duration of the drag.
        this.resizeEvId = ev.id;
        this.resizeDurMin = snp(curH);

        const onMove = (e2) => {
          const mm = snp(this.model.pxToMin(e2.clientY - colRect.top + body.scrollTop));
          if (edge === 'top') {
            const ns = Math.max(this.model.gStart(), Math.min(mm, endMin - MIN_DUR));
            curStartPx = this.model.minToPx(ns);
            curH = endMin - ns;
          } else {
            const ne = Math.min(this.model.gEnd(), Math.max(mm, startMin + MIN_DUR));
            curH = ne - startMin;
          }
          block.style.top = `${curStartPx  }px`;
          block.style.height = `${Math.max(curH, 16)  }px`;
          // Update the bound transient label so it reflects the live duration.
          this.resizeDurMin = snp(curH);
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          this.resizeEvId = null;
          const target = this.model.events.find(x => x.id === ev.id);
          if (target) {
            target.time = mtt(snp(this.model.pxToMin(curStartPx)));
            target.duration = Math.max(MIN_DUR, snp(curH));
          }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      },

      // ─── Modal ────────────────────────────────────────────
      modalOpen: false,
      overlayClass() { return this.modalOpen ? 'module-calendar__overlay--show' : ''; },
      modalTitle() { return this.editingId ? _t('editEvent') : _t('newEvent'); },
      deleteBtnStyle() { return this.editingId ? 'display:block' : 'display:none'; },
      phaseChipStyle: (p) => `color:${phaseColor(p)}`,
      phaseChipClass(p) {
        return this.form.phase === p ? 'module-calendar__phase-chip--selected' : '';
      },
      openModal() {
        this.modalOpen = true;
        this.$nextTick(() => {
          setTimeout(() => this.$el.querySelector('[data-ref="evTitle"]')?.focus(), 100);
        });
      },
      closeModal() {
        this.modalOpen = false;
        this.editingId = null;
      },
      openNew(ds, t) {
        this.editingId = null;
        this.form = { title: '', date: ds || '', time: t || '09:00', duration: 60, desc: '', phase: 'define' };
        this.openModal();
      },
      openEdit(id) {
        const ev = this.model.events.find(e => e.id === id);
        if (!ev) return;
        this.editingId = id;
        this.form = {
          title: ev.title, date: ev.date, time: ev.time,
          duration: ev.duration || 60, desc: ev.desc || '', phase: ev.phase || 'define',
        };
        this.openModal();
      },
      handleSave() {
        const title = (this.form.title || '').trim();
        const date = this.form.date;
        const time = this.form.time;
        const duration = parseInt(this.form.duration) || 60;
        const desc = (this.form.desc || '').trim();
        const phase = this.form.phase || 'define';
        if (!title || !date) {
          module._context.notify(_t('requiredFields'), 'warning');
          return;
        }
        this.model.upsertEvent({ title, date, time, duration, desc, phase }, this.editingId);
        this.closeModal();
      },
      handleDelete() {
        if (!this.editingId) return;
        this.model.removeEvent(this.editingId);
        this.closeModal();
      },
    };
  },
});
