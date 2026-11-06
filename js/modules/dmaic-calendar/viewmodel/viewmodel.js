/**
 * D.Mike — Projektkalender: Viewmodel.
 *
 * Termine und Kommandos liegen im Model (domain/model.js); die Agentenfläche
 * entsteht aus dessen Schema. Ansicht, Tagesachse und Wochentage sind
 * Ansichtsfelder des Models und im Template gebunden (x-set, x-field).
 * Angezeigter Zeitraum, Phasenfilter und Vorschau der Gesten sind UI-State
 * (viewmodel/state.js). Neu, Bearbeiten und Löschen laufen im Template über
 * x-dialog und EventForm (viewmodel/forms.js).
 * Hier bleiben: Anzeige, Blättern, Phasenfilter, Ende der Geste draw und das
 * Abonnement des Aufgaben-Spiegels.
 */
import { createModule } from '../../../core/template-module.js';
import { activeContext } from '../../../core/model.js';
import { CYCLES, getPhaseIds } from '../../../core/cycles/cycles.js';
import { addDaysISO, todayISO } from '../../../core/local-date.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { applyTodoSync } from '../domain/todo-sync.js';
import {
  MIN_DUR, isoOf, dateOf, isoDow, mondayOf, mtt, ttm, fmtDur, fmt2, byPhase, nextEvents, monthCells,
  dayRange, hourList, slotList, weekDates, shiftWeek, minToPx,
} from '../domain/layout.js';
import { draw } from '../interaction/draw.js';
import { move } from '../interaction/move.js';
import { resize } from '../interaction/resize.js';
import { UiState } from './state.js';
import * as forms from './forms.js';

/** @param {string} p @returns {string} Farbe der Phase als CSS-Ausdruck */
const phaseVar = (p) => `var(--color-phase-${p})`;
/** @param {string} p @param {number} pct @returns {string} getönter Hintergrund */
const tint = (p, pct) => `color-mix(in srgb, ${phaseVar(p)} ${pct}%, transparent)`;

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  forms,
  gestures: [draw, move, resize],

  /**
   * Beispiele tragen `dayOffset` (Tage ab dem Montag der laufenden Woche)
   * statt eines Datums, damit sie immer um heute liegen.
   * @param {any} data
   * @returns {object}
   */
  beforeLoadExample(data) {
    const anchor = isoOf(mondayOf(new Date()));
    const first = getPhaseIds(activeContext(this._context?.stateManager).cycle)[0];
    const raw = Array.isArray(data?.events) ? data.events : [];
    return {
      axisFrom: data?.axisFrom, axisTo: data?.axisTo, dayFrom: data?.dayFrom, dayTo: data?.dayTo,
      events: raw.map((ev) => ({
        title: ev.title || '',
        date: addDaysISO(anchor, typeof ev.dayOffset === 'number' ? ev.dayOffset : 0),
        time: ev.time || '09:00',
        duration: typeof ev.duration === 'number' ? ev.duration : 60,
        desc: ev.desc || '',
        phase: ev.phase || first,
      })),
    };
  },

  /** @type {import('./state.types.js').DmaicCalendarViewFn} */
  view(ctx) {
    const locale = () => (ctx.i18n.getLanguage() === 'en' ? 'en-GB' : 'de-DE');
    /** @type {((items: unknown) => void)|null} */
    let onSync = null;
    return {
      init() {
        const now = new Date();
        this.state.viewYear = now.getFullYear();
        this.state.viewMonth = now.getMonth();
        this.state.weekStart = isoOf(mondayOf(now));
        onSync = (items) => applyTodoSync(this.model, items);
        ctx.eventBus.on('todo:calendar-sync', onSync);
        this.$watch(() => this.model.viewMode, (mode) => {
          if (mode === 'week') this.state.weekStart = isoOf(mondayOf(new Date(this.state.viewYear, this.state.viewMonth, 15)));
        });
      },
      destroy() {
        if (onSync) ctx.eventBus.off('todo:calendar-sync', onSync);
        onSync = null;
      },

      // ─── Phasen ────────────────────────────────────────
      /** Phasen des aktiven Zyklus. @returns {string[]} */
      get phaseIds() { return getPhaseIds(this.model.context.cycle); },
      /** @param {string} p @returns {string} */
      phaseName(p) { return ctx.i18n.t(`phases.${p}`); },
      /** Gehört `p` zu keinem Zyklus-Schritt des aktiven Zyklus? @param {string} p @returns {boolean} */
      isForeignPhase(p) { return typeof p === 'string' && p !== '' && !this.phaseIds.includes(p); },
      /** „Phase (Zyklus)“ für eine Phase aus einem anderen Zyklus. @param {string} p @returns {string} */
      foreignPhaseLabel(p) {
        const cycle = Object.keys(CYCLES).find((c) => getPhaseIds(c).includes(p));
        return cycle ? `${this.phaseName(p)} (${ctx.i18n.t(`cycles.${cycle}.name`)})` : this.phaseName(p);
      },
      /** @param {string} p @returns {string} */
      phaseDotStyle(p) { return `background:${phaseVar(p)}`; },
      /** @param {string} p @returns {string} */
      phaseChipStyle(p) { return `color:${phaseVar(p)}`; },
      /** @param {string} p @returns {string} */
      phaseTagClass(p) { return this.state.phaseFilter === p ? 'module-calendar__phase-tag--active' : ''; },
      /** Anzeigefilter umschalten (ein zweiter Klick hebt ihn auf). @param {string} p */
      togglePhaseFilter(p) { this.state.phaseFilter = this.state.phaseFilter === p ? null : p; },

      // ─── Achse, Wochentage, Beschriftungen ─────────────
      /** @returns {number[]} */
      get axisFromHours() { return hourList(0, 24); },
      /** @returns {number[]} */
      get axisToHours() { return dayRange(1, 24); },
      /** @param {number} h @returns {string} */
      hourLabel(h) { return `${fmt2(h)}:00`; },
      /** @returns {number[]} */
      get dayIndices() { return dayRange(0, 6); },
      /** @returns {number[]} */
      get dayHeads() { return dayRange(0, 6); },
      /** @param {number} i @returns {string} */
      dayName(i) { return this.t(`dayName.${i}`); },
      /** @param {number} i @returns {string} */
      dayAbbr(i) { return this.t(`dayAbbr.${i}`); },
      /** @param {number} m @returns {string} */
      mtt(m) { return mtt(m); },

      // ─── Seitenleiste ──────────────────────────────────
      /** @returns {string} */
      get today() { return todayISO(); },
      /** Die nächsten fünf Termine ab heute. */
      get upcoming() { return nextEvents(this.model.events, todayISO(), 5); },
      /** @param {{ phase: string }} ev @returns {string} */
      upcomingStyle(ev) { return `border-left-color:${phaseVar(ev.phase)}`; },
      /** @param {{ date: string, time: string }} ev @returns {string} */
      upcomingDateLabel(ev) {
        return `${dateOf(ev.date).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })} · ${ev.time}`;
      },
      /** @returns {string} */
      get newEventLabel() { return `+ ${this.t('newEvent')}`; },
      /** Bereich der Geste draw → Termindialog mit Startwerten. @param {string} date @param {number} lo @param {number} hi */
      newEventInRange(date, lo, hi) {
        ctx.openDialog('eventForm', { defaults: { date, time: mtt(lo), duration: hi - lo }, title: this.t('newEvent') });
      },

      // ─── Navigation ────────────────────────────────────
      get isMonth() { return this.model.viewMode === 'month'; },
      get isWeek() { return this.model.viewMode === 'week'; },
      prevPeriod() {
        if (this.isMonth) {
          const d = new Date(this.state.viewYear, this.state.viewMonth - 1, 1);
          this.state.viewYear = d.getFullYear();
          this.state.viewMonth = d.getMonth();
        } else {
          this.state.weekStart = shiftWeek(this.state.weekStart, -1);
        }
      },
      nextPeriod() {
        if (this.isMonth) {
          const d = new Date(this.state.viewYear, this.state.viewMonth + 1, 1);
          this.state.viewYear = d.getFullYear();
          this.state.viewMonth = d.getMonth();
        } else {
          this.state.weekStart = shiftWeek(this.state.weekStart, 1);
        }
      },
      goToday() {
        const now = new Date();
        this.state.viewYear = now.getFullYear();
        this.state.viewMonth = now.getMonth();
        this.state.weekStart = isoOf(mondayOf(now));
      },
      /** @returns {string} */
      get calTitleMain() {
        if (this.isMonth) return this.t(`monthName.${this.state.viewMonth}`);
        const days = this.weekDates;
        if (!days.length) return '';
        const first = dateOf(days[0]);
        const last = dateOf(days[days.length - 1]);
        const m = (d) => this.t(`monthName.${d.getMonth()}`);
        return first.getMonth() === last.getMonth()
          ? `${first.getDate()}. – ${last.getDate()}. ${m(first)}`
          : `${first.getDate()}. ${m(first)} – ${last.getDate()}. ${m(last)}`;
      },
      /** @returns {string} */
      get calTitleYear() {
        if (this.isMonth) return String(this.state.viewYear);
        const days = this.weekDates;
        return days.length ? days[days.length - 1].slice(0, 4) : '';
      },

      // ─── Monat ─────────────────────────────────────────
      get monthGridStyle() { return 'grid-template-columns:repeat(7, 1fr)'; },
      get monthCells() { return monthCells(this.model.events, this.state.viewYear, this.state.viewMonth, this.state.phaseFilter); },
      /** @param {number} i @returns {string} */
      headClass(i) {
        const visible = dayRange(this.model.dayFrom, this.model.dayTo).includes(i);
        return `module-calendar__head${visible ? '' : ' module-calendar__head--outside'}`;
      },
      /** @param {{ other: boolean, iso: string, dow: number }} cell @returns {string} */
      dayClass(cell) {
        let cls = 'module-calendar__day';
        if (cell.other) cls += ' module-calendar__day--other';
        if (!cell.other && cell.iso === todayISO()) cls += ' module-calendar__day--today';
        if (!dayRange(this.model.dayFrom, this.model.dayTo).includes(cell.dow)) cls += ' module-calendar__day--outside';
        return cls;
      },
      /** @param {{ phase: string }} ev @returns {string} */
      monthEvStyle(ev) { return `background:${tint(ev.phase, 13)};color:${phaseVar(ev.phase)}`; },
      /** @param {{ events: object[] }} cell @returns {object[]} */
      firstEvents(cell) { return cell.events.slice(0, 3); },
      /** @param {{ events: object[] }} cell @returns {boolean} */
      hasMore(cell) { return cell.events.length > 3; },
      /** @param {{ events: object[] }} cell @returns {string} */
      moreText(cell) { return this.t('more', { n: cell.events.length - 3 }); },

      // ─── Woche ─────────────────────────────────────────
      get weekShowClass() { return this.isWeek ? 'module-calendar__week--show' : ''; },
      /** Sichtbare Tage der angezeigten Woche (ISO). @returns {string[]} */
      get weekDates() { return weekDates(this.state.weekStart, this.model.dayFrom, this.model.dayTo); },
      get weekColStyle() { return `grid-template-columns:56px repeat(${this.weekDates.length}, 1fr)`; },
      /** Zieltag der Geste move hervorheben. @param {string} iso @returns {string} */
      weekColClass(iso) {
        const p = this.state.movePreview;
        return p && p.date === iso ? 'module-calendar__week-day-col--drop-target' : '';
      },
      /** @param {string} iso @returns {string} */
      weekHdayClass(iso) { return `module-calendar__week-hday${iso === todayISO() ? ' module-calendar__week-hday--today' : ''}`; },
      /** @param {string} iso @returns {string} */
      weekHdayName(iso) { return this.dayAbbr(isoDow(dateOf(iso))); },
      /** @param {string} iso @returns {number} */
      dayNum(iso) { return Number(iso.slice(8, 10)); },
      get hoursList() { return hourList(this.model.axisFrom, this.model.axisTo); },
      get slotsList() { return slotList(this.model.axisFrom, this.model.axisTo); },
      /** Halbe Stunden mit gestrichelter Linie; aufgezogener Bereich markiert. @param {string} iso @param {number} m @returns {string} */
      slotClass(iso, m) {
        const cls = m % 60 === 30 ? ['module-calendar__week-slot--hour'] : [];
        const p = this.state.drawPreview;
        if (p && p.date === iso && m >= Math.min(p.from, p.to) && m <= Math.max(p.from, p.to)) cls.push('module-calendar__week-slot--selecting');
        return cls.join(' ');
      },
      /** Termine eines Tages (der verschobene bleibt bis zum Ablegen in seiner Spalte). @param {string} iso */
      weekEventsForDay(iso) { return byPhase(this.model.events, this.state.phaseFilter).filter((e) => e.date === iso); },
      /** Beginn und Dauer eines Termins, mit Vorschau der Gesten. @param {{ id: string, time: string, duration: number }} ev */
      span(ev) {
        const r = this.state.resizePreview;
        if (r && r.id === ev.id) return { start: r.start, duration: r.end - r.start };
        const mv = this.state.movePreview;
        return { start: mv && mv.id === ev.id ? mv.min : ttm(ev.time), duration: ev.duration };
      },
      /** @param {{ id: string, time: string, duration: number, phase: string }} ev @returns {string} */
      weekEvStyle(ev) {
        const { start, duration } = this.span(ev);
        return `top:${minToPx(start, this.model.axisFrom)}px;height:${Math.max(duration, 16)}px;`
          + `background:${tint(ev.phase, 10)};color:${phaseVar(ev.phase)};border-left-color:${phaseVar(ev.phase)};`;
      },
      /** @param {{ id: string, time: string, duration: number }} ev @returns {string} */
      weekEvTimeText(ev) {
        const { start, duration } = this.span(ev);
        return `${mtt(start)} – ${mtt(start + duration)}`;
      },
      /** @param {{ id: string }} ev @returns {boolean} */
      showResizeDur(ev) { return this.state.resizePreview?.id === ev.id; },
      get resizeDurText() {
        const r = this.state.resizePreview;
        return r ? fmtDur(r.end - r.start) : '';
      },
      get nowOffsetPx() {
        const now = new Date();
        return minToPx(now.getHours() * 60 + now.getMinutes(), this.model.axisFrom);
      },
      /** @param {string} iso @returns {boolean} */
      showNowLine(iso) {
        if (iso !== todayISO()) return false;
        const off = this.nowOffsetPx;
        return off >= 0 && off <= (this.model.axisTo - this.model.axisFrom) * 60;
      },
      get nowLineStyle() { return `top:${this.nowOffsetPx}px`; },

      // ─── Dialog ────────────────────────────────────────
      /** Dauer aus Beginn und Ende des Formulars. @param {string} start @param {string} end @returns {string} */
      durationText(start, end) {
        const d = ttm(end) - ttm(start);
        return d >= MIN_DUR ? fmtDur(d) : '—';
      },
    };
  },
});
