/**
 * D.Mike — DMAIC Calendar Module (dmaic-calendar.js)
 * Project calendar with month / week views, DMAIC phase tagging,
 * drag & drop, resize, and configurable time axis.
 * Migrated to createModule + Alpine.js CSP.
 * DMAIC phase: Define
 *
 * @agent  Vollständig über das Viewmodel steuerbar: Termine anlegen, ändern
 *   und entfernen — Titel, Datum, Startzeit, Dauer, Beschreibung und Phase —,
 *   die Tagesachse und die angezeigten Wochentage sowie die Wahl zwischen
 *   Monats- und Wochenansicht. Der Oberfläche bleiben der Terminvordruck samt
 *   seinem Dialog, die Maus-Gestik des Verschiebens und Größenziehens, der
 *   angezeigte Zeitraum und der Phasenfilter der Anzeige.
 */

import { createModule } from '../../core/template-module.js';
import { getPhaseIds, DEFAULT_CYCLE } from '../../core/cycles/cycles.js';
import { isIsoDate } from '../../core/local-date.js';
import { agentReadMixin } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId, requireText } from '../../core/agent/agent-argcheck.js';
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

/** Die Felder, die `addEvent` und `updateEvent` entgegennehmen. */
const EVENT_FIELDS = ['title', 'date', 'time', 'duration', 'desc', 'phase'];

/** Die Wochentage als Wertemenge: 0 für Montag bis 6 für Sonntag. */
const DAY_INDICES = [0, 1, 2, 3, 4, 5, 6];

// Die Stunden der Tagesachse. `requireIndex` passt nicht: `axisTo` reicht bis
// 24 (Tagesende) und `axisFrom` nur bis 23, die Bereiche sind also nicht
// gleich und keiner ist eine Einfügeposition.
const AXIS_FROM_HOURS = Array.from({ length: 24 }, (_, h) => h);
const AXIS_TO_HOURS = Array.from({ length: 24 }, (_, h) => h + 1);

/** "HH:MM" mit Stunde 0..23 und Minute 0..59. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Den Feldsatz eines Termins prüfen und auf die gespeicherte Form bringen.
 *
 * Ein fehlendes oder leeres Objekt wirft: `agent-ops.js` übergibt
 * `action.args ?? []` ohne Arity-Prüfung, ein fehlendes Argument kommt also
 * als `undefined` an (Ruling 55). Beim Ändern verspricht die Hilfe „mindestens
 * ein Feld" — ein durchgelassenes `{}` wäre ein stiller Nicht-Aufruf.
 *
 * @param {any} fields der übergebene Feldsatz
 * @param {readonly string[]} phases die Phasen des aktiven Zyklus
 * @param {boolean} complete true verlangt Titel und Datum (neuer Termin),
 *   false lässt einen Teilsatz zu (Änderung)
 * @returns {object} die geprüften Felder, nur die übergebenen Schlüssel
 * @throws {Error} wenn ein Schlüssel unbekannt oder ein Wert ungültig ist
 */
function checkEventFields(fields, phases, complete) {
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new Error(`invalid fields ${JSON.stringify(fields)}; allowed: an object with `
      + `${EVENT_FIELDS.join(', ')}`);
  }
  const keys = Object.keys(fields);
  const unknown = keys.filter((k) => !EVENT_FIELDS.includes(k));
  if (unknown.length) {
    throw new Error(`invalid fields key ${JSON.stringify(unknown[0])}; `
      + `allowed: ${EVENT_FIELDS.join(', ')}`);
  }
  if (!complete && keys.length === 0) {
    throw new Error('invalid fields {}; allowed: at least one of '
      + `${EVENT_FIELDS.join(', ')}`);
  }
  const out = {};
  if (complete || 'title' in fields) {
    requireText('title', fields.title);
    if (complete && fields.title.trim() === '') {
      throw new Error('invalid title ""; allowed: a non-empty title');
    }
    out.title = fields.title.trim();
  }
  if (complete || 'date' in fields) {
    requireText('date', fields.date);
    if (!isIsoDate(fields.date)) {
      throw new Error(`invalid date ${JSON.stringify(fields.date)}; allowed: YYYY-MM-DD`);
    }
    out.date = fields.date;
  }
  if ('time' in fields) {
    requireText('time', fields.time);
    if (!TIME_RE.test(fields.time)) {
      throw new Error(`invalid time ${JSON.stringify(fields.time)}; allowed: HH:MM from 00:00 to 23:59`);
    }
    out.time = fields.time;
  } else if (complete) out.time = '09:00';
  if ('duration' in fields) {
    if (!Number.isInteger(fields.duration) || fields.duration < MIN_DUR) {
      throw new Error(`invalid duration ${JSON.stringify(fields.duration)}; `
        + `allowed: whole minutes from ${MIN_DUR}`);
    }
    out.duration = fields.duration;
  } else if (complete) out.duration = 60;
  if ('desc' in fields) {
    requireText('desc', fields.desc);
    out.desc = fields.desc.trim();
  } else if (complete) out.desc = '';
  if (complete || 'phase' in fields) {
    // Die Phasen kommen aus dem AKTIVEN Zyklus, nie aus einem Literal: `eightd`
    // kennt kein `define`, ein festes Phasenliteral wäre dort falsch.
    requireEnum('phase', 'phase' in fields ? fields.phase : phases[0], phases);
    out.phase = 'phase' in fields ? fields.phase : phases[0];
  }
  return out;
}

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
    icon: 'module.dmaic-calendar',
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
      ...agentReadMixin(module),
      // ─── Transient UI state (never persisted) ─────────────
      // Note: viewMode lives on the model (persisted); see setView().
      phaseFilter: null,
      editingId: null,
      viewYear: today.getFullYear(),
      viewMonth: today.getMonth(),
      weekStartMs: getMonday(today).getTime(),
      // The form is driven by start (time) + end; duration is derived on save.
      form: { title: '', date: '', time: '09:00', end: '10:00', desc: '', phase: 'define' },

      // ─── Static option ranges ─────────────────────────────
      hours24: Array.from({ length: 24 }, (_, h) => h),

      // ─── Lifecycle ────────────────────────────────────────
      /** @noagent lifecycle, kein Zustandsweg. */
      init() {
        // Expose a live-data accessor so the event-bus handler (registered in
        // afterMount) can mutate the reactive model.
        const self = this;
        module._alpineData = () => self;
      },
      /** @noagent lifecycle, kein Zustandsweg. */
      destroy() {
        if (module._todoSyncHandler) {
          module._context.eventBus.off('todo:calendar-sync', module._todoSyncHandler);
          module._todoSyncHandler = null;
        }
        module._alpineData = null;
      },

      /**
       * @noagent Spiegelweg: wird vom Ereignis einer anderen Modulinstanz
       * gerufen (`todo:calendar-sync`) und ersetzt die aus der Aufgabenliste
       * gespiegelten Termine. Der Wert kommt aus dem gespeicherten Stand
       * jenes Moduls, nicht aus einer Bedienung dieses Moduls, und ein Agent
       * erreicht die Methode nicht — sie steht nicht im Katalog.
       */
      applyTodoSync(items) {
        this.model.applyTodoSync(items);
      },

      // ─── i18n / localized data ────────────────────────────
      phaseIds: phaseIds(),
      /** @noagent view transform: die übersetzte Phasenbezeichnung. */
      phaseName: (p) => module._context.i18n.t(`phases.${  p}`),
      /** @noagent view transform: die vollen Wochentagsnamen. */
      allDayNames: () => allDays(),
      /** @noagent view transform: die Wochentagskürzel der Kopfzeile. */
      dayHeads: () => daysShort(),

      // ─── Phase legend / filter ────────────────────────────
      /** @noagent view transform: die Farbe des Phasenpunkts. */
      phaseDotStyle: (p) => `background:${phaseColor(p)}`,
      /** @noagent view transform: hebt die gewählte Phase in der Legende hervor. */
      phaseTagClass(p) {
        return this.phaseFilter === p ? 'module-calendar__phase-tag--active' : '';
      },
      /**
       * @noagent Anzeigefilter, nicht Zustand — er erscheint nicht in
       * `read()`. Ein Agent, der ihn setzen könnte, bekäme keine Rückmeldung
       * darüber, was er getan hat.
       */
      togglePhaseFilter(p) {
        this.phaseFilter = this.phaseFilter === p ? null : p;
      },

      // ─── Axis selects ─────────────────────────────────────
      /** @noagent view transform: die Stundenbeschriftung der Tagesachse. */
      hourLabel: (h) => `${fmt2(h)  }:00`,
      /**
       * @noagent DOM event handler: packt den Wert des Auswahlfelds aus und
       * stellt es zurück, wenn der Wert die Achse umkehrt. Geschrieben wird
       * über `setAxisFrom`, dieselbe Senke wie die der Agentenfläche.
       */
      axisFromChanged(e) {
        const v = Number(e.target.value);
        if (!this.setAxisFrom(v)) e.target.value = this.model.axisFrom;
      },
      /** @noagent DOM event handler; geschrieben wird über `setAxisTo`. */
      axisToChanged(e) {
        const v = Number(e.target.value);
        if (!this.setAxisTo(v)) e.target.value = this.model.axisTo;
      },
      /** @noagent DOM event handler; geschrieben wird über `setDayFrom`. */
      dayFromChanged(e) {
        const v = Number(e.target.value);
        if (!this.setDayFrom(v)) e.target.value = this.model.dayFrom;
      },
      /** @noagent DOM event handler; geschrieben wird über `setDayTo`. */
      dayToChanged(e) {
        const v = Number(e.target.value);
        if (!this.setDayTo(v)) e.target.value = this.model.dayTo;
      },

      /**
       * Setzt die erste angezeigte Stunde der Tagesachse.
       * @agent
       * @param {number} hour die Stunde, 0 bis 23
       * @returns {boolean} true wenn gesetzt wurde, false wenn die Stunde nicht
       *   vor der letzten angezeigten liegt und die Achse stehen blieb
       * @throws {Error} wenn `hour` keine Stunde von 0 bis 23 ist
       */
      setAxisFrom(hour) {
        requireEnum('hour', hour, AXIS_FROM_HOURS);
        // Eine umgekehrte Achse ist eine fachliche Absage: das Auswahlfeld
        // stellt sich im selben Fall zurück, statt zu scheitern.
        if (hour >= this.model.axisTo) return false;
        this.model.axisFrom = hour;
        return true;
      },

      /**
       * Setzt die letzte angezeigte Stunde der Tagesachse.
       * @agent
       * @param {number} hour die Stunde, 1 bis 24
       * @returns {boolean} true wenn gesetzt wurde, false wenn die Stunde nicht
       *   nach der ersten angezeigten liegt und die Achse stehen blieb
       * @throws {Error} wenn `hour` keine Stunde von 1 bis 24 ist
       */
      setAxisTo(hour) {
        requireEnum('hour', hour, AXIS_TO_HOURS);
        if (hour <= this.model.axisFrom) return false;
        this.model.axisTo = hour;
        return true;
      },

      /**
       * Setzt den ersten angezeigten Wochentag.
       * @agent
       * @param {number} dayIndex der Wochentag, 0 für Montag bis 6 für Sonntag
       * @returns {boolean} true wenn gesetzt wurde, false wenn der Tag nach dem
       *   letzten angezeigten liegt und die Auswahl stehen blieb
       * @throws {Error} wenn `dayIndex` kein Wochentag von 0 bis 6 ist
       */
      setDayFrom(dayIndex) {
        requireEnum('dayIndex', dayIndex, DAY_INDICES);
        if (dayIndex > this.model.dayTo) return false;
        this.model.dayFrom = dayIndex;
        return true;
      },

      /**
       * Setzt den letzten angezeigten Wochentag.
       * @agent
       * @param {number} dayIndex der Wochentag, 0 für Montag bis 6 für Sonntag
       * @returns {boolean} true wenn gesetzt wurde, false wenn der Tag vor dem
       *   ersten angezeigten liegt und die Auswahl stehen blieb
       * @throws {Error} wenn `dayIndex` kein Wochentag von 0 bis 6 ist
       */
      setDayTo(dayIndex) {
        requireEnum('dayIndex', dayIndex, DAY_INDICES);
        if (dayIndex < this.model.dayFrom) return false;
        this.model.dayTo = dayIndex;
        return true;
      },

      // ─── Termine (die Senken, die Dialog und Agentenfläche teilen) ──

      /**
       * Legt einen Termin an.
       * @agent
       * @param {{title: string, date: string, time?: string, duration?: number, desc?: string, phase?: string}} fields
       *   Titel und Datum sind nötig; ohne Startzeit beginnt der Termin
       *   09:00, ohne Dauer läuft er 60 Minuten, ohne Phase fällt er auf die
       *   erste Phase des aktiven Zyklus
       * @returns {string} die id des neuen Termins
       * @throws {Error} wenn `fields` kein Feldsatz ist, ein Schlüssel
       *   unbekannt ist, Titel oder Datum fehlen oder ein Wert nicht in die
       *   Wertemenge seines Feldes passt
       */
      addEvent(fields) {
        const checked = checkEventFields(fields, phaseIds(), true);
        return this.model.upsertEvent(checked, null).id;
      },

      /**
       * Ändert die übergebenen Felder eines Termins; die übrigen bleiben
       * stehen.
       * @agent
       * @param {string} id id des Termins
       * @param {{title?: string, date?: string, time?: string, duration?: number, desc?: string, phase?: string}} fields
       *   mindestens ein Feld
       * @returns {void}
       * @throws {Error} wenn kein Termin diese id trägt, `fields` kein
       *   Feldsatz oder leer ist, ein Schlüssel unbekannt ist oder ein Wert
       *   nicht in die Wertemenge seines Feldes passt
       */
      updateEvent(id, fields) {
        requireKnownId('id', id, this.model.events.map((e) => e.id));
        const checked = checkEventFields(fields, phaseIds(), false);
        this.model.upsertEvent(checked, id);
      },

      /**
       * Entfernt einen Termin.
       * @agent
       * @param {string} id id des Termins
       * @returns {void}
       * @throws {Error} wenn kein Termin diese id trägt
       */
      removeEvent(id) {
        requireKnownId('id', id, this.model.events.map((e) => e.id));
        this.model.removeEvent(id);
      },

      // ─── Upcoming ─────────────────────────────────────────
      /** @noagent view transform: die nächsten fünf anstehenden Termine. */
      upcomingList() {
        return this.model.upcomingEvents(dkd(new Date()));
      },
      /** @noagent view transform: die Phasenfarbe am Rand eines anstehenden Termins. */
      upcomingStyle: (ev) => `border-left-color:${phaseColor(ev.phase)}`,
      /** @noagent view transform: Datum und Zeit eines anstehenden Termins. */
      upcomingDateLabel(ev) {
        const locale = lang() === 'en' ? 'en-GB' : 'de-DE';
        const d = new Date(`${ev.date  }T00:00`);
        return `${d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} · ${ev.time}`;
      },
      /** @noagent view transform: die Beschriftung des Knopfs für einen neuen Termin. */
      newEventBtnLabel: () => `+ ${  _t('newEvent')}`,

      // ─── Controls / navigation ────────────────────────────
      /** @noagent view transform: hebt den aktiven Ansichtsknopf hervor. */
      viewBtnClass(v) { return this.model.viewMode === v ? 'active' : ''; },
      /**
       * Setzt die Kalenderansicht.
       * @agent
       * @param {'month'|'week'} v `month` zeigt den Monat, `week` die Woche
       * @returns {void}
       * @throws {Error} wenn `v` keine der beiden Ansichten ist
       */
      setView(v) {
        requireEnum('v', v, ['month', 'week']);
        // Lives on the model so the choice is persisted (auto-$watch).
        this.model.viewMode = v;
        if (v === 'week') {
          this.weekStartMs = getMonday(new Date(this.viewYear, this.viewMonth, 15)).getTime();
        }
      },
      /**
       * @noagent Anzeigezustand, nicht Zustand — der angezeigte Zeitraum liegt
       * am Viewmodel und erscheint nicht in `read()`.
       */
      prevPeriod() {
        if (this.model.viewMode === 'month') {
          this.viewMonth--;
          if (this.viewMonth < 0) { this.viewMonth = 11; this.viewYear--; }
        } else {
          const d = new Date(this.weekStartMs); d.setDate(d.getDate() - 7); this.weekStartMs = d.getTime();
        }
      },
      /** @noagent Anzeigezustand, nicht Zustand — er erscheint nicht in `read()`. */
      nextPeriod() {
        if (this.model.viewMode === 'month') {
          this.viewMonth++;
          if (this.viewMonth > 11) { this.viewMonth = 0; this.viewYear++; }
        } else {
          const d = new Date(this.weekStartMs); d.setDate(d.getDate() + 7); this.weekStartMs = d.getTime();
        }
      },
      /** @noagent Anzeigezustand, nicht Zustand — er erscheint nicht in `read()`. */
      goToday() {
        const t = new Date();
        this.viewYear = t.getFullYear();
        this.viewMonth = t.getMonth();
        this.weekStartMs = getMonday(t).getTime();
      },

      // ─── Title ────────────────────────────────────────────
      /** @noagent view transform: der Hauptteil der Kalenderüberschrift. */
      calTitleMain() {
        if (this.model.viewMode === 'month') return months()[this.viewMonth];
        const wd = this.weekDates();
        if (!wd.length) return '';
        const first = wd[0], last = wd[wd.length - 1];
        const m = months();
        if (first.getMonth() === last.getMonth()) {
          return `${first.getDate()}. – ${last.getDate()}. ${m[first.getMonth()]}`;
        }
        return `${first.getDate()}. ${m[first.getMonth()]} – ${last.getDate()}. ${m[last.getMonth()]}`;
      },
      /** @noagent view transform: das Jahr der Kalenderüberschrift. */
      calTitleYear() {
        if (this.model.viewMode === 'month') return String(this.viewYear);
        const wd = this.weekDates();
        if (!wd.length) return '';
        return String(wd[wd.length - 1].getFullYear());
      },

      // ─── Month view ───────────────────────────────────────
      /** @noagent view transform: das Spaltenraster der Monatsansicht. */
      monthGridStyle: () => 'grid-template-columns:repeat(7, 1fr)',
      /** @noagent view transform: die Tageszellen des angezeigten Monats. */
      monthCells() {
        return this.model.monthCells(this.viewYear, this.viewMonth, this.phaseFilter);
      },
      /** @noagent view transform: blendet einen Wochentag außerhalb der Auswahl ab. */
      headClass(i) {
        const vis = this.model.visibleDayIndices();
        return `module-calendar__head${  vis.includes(i) ? '' : ' module-calendar__head--outside'}`;
      },
      /** @noagent view transform: markiert Fremdmonat, heute und ausgeblendete Tage. */
      dayClass(cell) {
        let cls = 'module-calendar__day';
        if (cell.other) cls += ' module-calendar__day--other';
        if (!cell.other && cell.key === dkd(new Date())) cls += ' module-calendar__day--today';
        if (!this.model.visibleDayIndices().includes(isoDow(cell.date))) cls += ' module-calendar__day--outside';
        return cls;
      },
      /** @noagent view transform: die Phasenfarbe eines Termins in der Monatsansicht. */
      monthEvStyle(ev) {
        const c = phaseColor(ev.phase);
        return `background:${c}22;color:${c}`;
      },
      /** @noagent view transform: die ersten drei Termine einer Tageszelle. */
      firstEvents: (cell) => cell.events.slice(0, 3),
      /** @noagent view transform: der Hinweis auf weitere Termine einer Tageszelle. */
      moreText(n) { return `+${n} ${  lang() === 'en' ? 'more' : 'mehr'}`; },
      /** @noagent DOM event handler: öffnet den Vordruck für den angeklickten Tag. */
      onDayClick(cell) {
        if (!cell.other && cell.key) this.openNew(cell.key);
      },
      /** @noagent DOM event handler: öffnet den angeklickten Termin zur Bearbeitung. */
      onMonthEventClick(ev, e) {
        e.stopPropagation();
        this.openEdit(ev.id);
      },

      // ─── Week view ────────────────────────────────────────
      dkd,
      /** @noagent view transform: zeigt die Wochenansicht an oder verbirgt sie. */
      weekShowClass() { return this.model.viewMode === 'week' ? 'module-calendar__week--show' : ''; },
      /** @noagent view transform: die angezeigten Stunden der Tagesachse. */
      hoursList() { return this.model.hoursArr(); },
      // Drag-to-create grid: one slot per half hour (30-minute Ziehraster).
      /** @noagent view transform: die Halbstundenfelder des Ziehrasters. */
      slotsList() { return this.model.halfSlotsArr(); },
      /** @noagent view transform: die Tage der angezeigten Woche. */
      weekDates() {
        return this.model.weekDates(this.weekStartMs, this.model.dayFrom, this.model.dayTo);
      },
      /** @noagent view transform: das Spaltenraster der Wochenansicht. */
      weekColStyle() {
        return `grid-template-columns:56px repeat(${this.weekDates().length}, 1fr)`;
      },
      /** @noagent view transform: hebt den heutigen Tag in der Wochenkopfzeile hervor. */
      weekHdayClass(d) {
        return `module-calendar__week-hday${  dkd(d) === dkd(new Date()) ? ' module-calendar__week-hday--today' : ''}`;
      },
      /** @noagent view transform: das Wochentagskürzel der Kopfzeile. */
      weekHdayName(d) { return daysShort()[isoDow(d)]; },
      /** @noagent view transform: die Stundenbeschriftung der Wochenansicht. */
      weekTimeLabel: (h) => `${fmt2(h)}:00`,
      /** @noagent view transform: die Termine eines Tages der Wochenansicht. */
      weekEventsForDay(d) {
        const key = dkd(d);
        return this.model.eventsForPhase(this.phaseFilter).filter(e => e.date === key);
      },
      /** @noagent view transform: Lage, Höhe und Phasenfarbe eines Terminblocks. */
      weekEvStyle(ev) {
        const sMin = ttm(ev.time);
        const dur = ev.duration || 60;
        const c = phaseColor(ev.phase);
        return `top:${this.model.minToPx(sMin)}px;height:${Math.max(dur, 16)}px;background:${c}1a;color:${c};border-left-color:${c};`;
      },
      /** @noagent view transform: Anfang und Ende eines Termins als Text. */
      weekEvTimeText(ev) {
        const dur = ev.duration || 60;
        return `${ev.time} – ${fmtEnd(ev.time, dur)}`;
      },
      // Minutes-of-day → pixel offset from the top of the time grid, via the
      // model's axis→pixel primitive (single source of truth for the mapping).
      /** @noagent view transform: die Lage der Jetzt-Linie in Bildpunkten. */
      nowOffsetPx() {
        const now = new Date();
        return this.model.minToPx(now.getHours() * 60 + now.getMinutes());
      },
      /** @noagent view transform: zeigt die Jetzt-Linie nur am heutigen Tag. */
      showNowLine(d) {
        if (dkd(d) !== dkd(new Date())) return false;
        const off = this.nowOffsetPx();
        return off >= 0 && off <= this.model.hoursArr().length * 60;
      },
      /** @noagent view transform: die Lage der Jetzt-Linie als Stilangabe. */
      nowLineStyle() {
        return `top:${this.nowOffsetPx()}px`;
      },
      /** @noagent DOM event handler: öffnet den Vordruck für das angeklickte Zeitfeld. */
      onSlotClick(d, m) {
        this.openNew(dkd(d), mtt(m));
      },

      // ─── Week slot drag-to-create (Outlook-Stil) ──────────
      // Transient selection while the user drags across half-hour slots to draw
      // a new event span. Slots are addressed by their start minute-of-day
      // (30-minute grid). `null` → not dragging. Never persisted (UI-only).
      slotSel: null,
      // True once the drag has crossed to a different slot, so a plain
      // (non-moving) mousedown/mouseup stays a click and leaves the double-click
      // "single-slot" path (Bug 003) untouched.
      _slotSpanMoved: false,
      /** @noagent view transform: markiert die aufgezogene Auswahl im Ziehraster. */
      slotSelClass(d, m) {
        // Full hours keep a solid divider, half hours a dashed one.
        const cls = m % 60 === 30 ? ['module-calendar__week-slot--hour'] : [];
        const sel = this.slotSel;
        if (sel && dkd(d) === sel.day) {
          const lo = Math.min(sel.startM, sel.endM);
          const hi = Math.max(sel.startM, sel.endM);
          if (m >= lo && m <= hi) cls.push('module-calendar__week-slot--selecting');
        }
        return cls.join(' ');
      },
      /**
       * @noagent DOM event handler: packt ein `MouseEvent` aus und zieht eine
       * Auswahl über die Halbstundenfelder auf; ein Agent kann kein
       * `MouseEvent` erzeugen. Angelegt wird der Termin danach im Vordruck.
       */
      slotDragStart(d, m, e) {
        // Ignore anything but the primary button; never start a span from a
        // click that lands on an existing event block.
        if (e.button !== 0) return;
        e.preventDefault();
        const day = dkd(d);
        this.slotSel = { day, startM: m, endM: m };
        this._slotSpanMoved = false;
        const onUp = () => {
          document.removeEventListener('mouseup', onUp);
          const sel = this.slotSel;
          this.slotSel = null;
          // Plain click (no drag across slots) → leave it to @dblclick.
          if (!sel || !this._slotSpanMoved) return;
          const lo = Math.min(sel.startM, sel.endM);
          const hi = Math.max(sel.startM, sel.endM);
          // Span is inclusive of the last slot → end at (hi + 30) minutes.
          this.openNew(sel.day, mtt(lo), mtt(hi + 30));
        };
        document.addEventListener('mouseup', onUp);
      },
      /** @noagent DOM event handler: zieht die Auswahl im Ziehraster auf. */
      slotDragEnter(d, m) {
        const sel = this.slotSel;
        if (!sel || dkd(d) !== sel.day) return;
        if (m !== sel.endM) this._slotSpanMoved = true;
        sel.endM = m;
      },

      // ─── Week drag & resize ───────────────────────────────
      _didDrag: false,
      // Transient live-duration label shown on the event block while it is being
      // resized (e.g. "1h 30min"). null → no resize in progress (label hidden).
      resizeEvId: null,
      resizeDurMin: 0,
      /** @noagent view transform: die Dauer, während der Termin gezogen wird. */
      resizeDurText() { return fmtDur(this.resizeDurMin); },
      /** @noagent view transform: zeigt die Dauer nur am gezogenen Termin. */
      showResizeDur(ev) { return this.resizeEvId === ev.id; },
      /** @noagent DOM event handler: trennt den Klick vom beendeten Ziehen. */
      weekEvClick(ev, e) {
        if (this._didDrag) { this._didDrag = false; return; }
        e.stopPropagation();
        this.openEdit(ev.id);
      },
      /** @noagent DOM event handler: unterscheidet Verschieben von Größenziehen. */
      weekEvMouseDown(ev, e) {
        if (e.target.closest('.module-calendar__ev-handle')) return;
        this.startDrag(ev, e);
      },
      /**
       * @noagent DOM event handler: verschiebt einen Terminblock mit der Maus.
       * Ein Agent kann kein `MouseEvent` erzeugen; `updateEvent` ist der Weg,
       * über den auch diese Gestik `time` und `date` schreibt.
       */
      startDrag(ev, e) {
        e.preventDefault();
        e.stopPropagation();
        this._didDrag = false;
        const block = e.currentTarget;
        const body = block.closest('.module-calendar__week-body');
        // NICHT `this.$el`: in einer Methode, die aus einem Element-Ausdruck
        // gerufen wird (`@mousedown="weekEvMouseDown(ev, $event)"` am
        // Terminblock), legt der CSP-Build von Alpine das AUSLÖSENDE Element
        // oben auf den Datenstapel (`vendor/alpinejs/csp.js`,
        // `generateDataStack` → `injectMagics(…, el)`). `$el` war damit der
        // Terminblock, die Suche nach den Tagesspalten fand null Treffer, und
        // `colFromX` fiel immer auf die Ausgangsspalte zurück: ein Termin ließ
        // sich per Maus nie auf einen anderen TAG ziehen, nur die Uhrzeit
        // wanderte. Die Modulwurzel wird darum vom Block aus gesucht.
        const root = block.closest('.module-calendar');
        const cols = Array.from(root.querySelectorAll('.module-calendar__week-day-col'));
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
          // Über dieselbe Senke wie die Agentenfläche, damit `time` und `date`
          // je genau eine Zuweisungsstelle haben (Ruling 56).
          if (this.model.events.some(x => x.id === ev.id)) {
            this.updateEvent(ev.id, {
              time: mtt(snp(this.model.pxToMin(curTop))),
              date: dkd(dates[curCol]),
            });
          }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      },
      /**
       * @noagent DOM event handler: zieht einen Terminblock mit der Maus größer
       * oder kleiner. Ein Agent kann kein `MouseEvent` erzeugen; geschrieben
       * wird über `updateEvent`.
       */
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
          // Dieselbe Senke wie die Agentenfläche (Ruling 56).
          if (this.model.events.some(x => x.id === ev.id)) {
            this.updateEvent(ev.id, {
              time: mtt(snp(this.model.pxToMin(curStartPx))),
              duration: Math.max(MIN_DUR, snp(curH)),
            });
          }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      },

      // ─── Modal ────────────────────────────────────────────
      // Uses the shared modal (ui/modal) via context.showModal.form(): the
      // event form lives hidden in the template (x-ref="eventForm") and is
      // borrowed into the dialog. Title + footer buttons are owned by the modal;
      // the delete button only appears when editing (onDelete option).
      /** @noagent view transform: die Überschrift des Termindialogs. */
      modalTitle() { return this.editingId ? _t('editEvent') : _t('newEvent'); },
      /** @noagent view transform: die Farbe eines Phasenchips im Formular. */
      phaseChipStyle: (p) => `color:${phaseColor(p)}`,
      /** @noagent view transform: hebt die gewählte Phase im Vordruck hervor. */
      phaseChipClass(p) {
        return this.form.phase === p ? 'module-calendar__phase-chip--selected' : '';
      },
      /**
       * @noagent öffnet den Termindialog der Oberfläche; ein Agent darf keinen
       * Dialog öffnen — er blockierte den Stapel (E3). Termine legt er über
       * `addEvent`, `updateEvent` und `removeEvent` an und ändert sie dort.
       */
      openModal() {
        const opts = {
          confirmLabel: _t('save'),
          cancelLabel: _t('cancel'),
          onMount: (el) => { el.querySelector('[data-ref="evTitle"]')?.focus(); },
          onConfirm: () => this.handleSave(), // returns false → dialog stays open
        };
        if (this.editingId) {
          opts.deleteLabel = _t('deleteEvent');
          opts.onDelete = () => this.handleDelete();
        }
        module._context.showModal
          .form(this.modalTitle(), this.$refs.eventForm, opts)
          .finally(() => { this.editingId = null; });
      },
      /**
       * @noagent füllt den Terminvordruck und öffnet den Dialog (E3).
       * `addEvent` ist der Weg der Agentenfläche.
       */
      openNew(ds, t, endT) {
        this.editingId = null;
        // Start defaults to 09:00, end to start + 60min (or the dragged span end).
        const start = t || '09:00';
        const end = (endT && ttm(endT) > ttm(start)) ? endT : fmtEnd(start, 60);
        // Die Vorgabephase kommt aus dem AKTIVEN Zyklus: `eightd` kennt kein
        // `define`, ein Literal hätte dort einen Termin erzeugt, dessen Phase
        // es im Projekt nicht gibt.
        this.form = {
          title: '', date: ds || '', time: start, end, desc: '',
          phase: this._draftPhase(null),
        };
        this.openModal();
      },
      /**
       * @noagent füllt den Terminvordruck aus einem Termin und öffnet den
       * Dialog (E3). `updateEvent` ist der Weg der Agentenfläche.
       */
      openEdit(id) {
        const ev = this.model.events.find(e => e.id === id);
        if (!ev) return;
        this.editingId = id;
        const phase = this._draftPhase(ev.phase);
        // Die Umschreibung wird GESAGT, nicht verschwiegen. Die Phasenchips
        // des Vordrucks entstehen aus `phaseIds` des aktiven Zyklus; für eine
        // fremde Phase gibt es keinen Chip. Sie unangetastet zu lassen, wenn
        // der Nutzer sie nicht anfasst, hieße: der hervorgehobene Chip zeigt
        // `prepare`, gespeichert wird `analyze` — der Dialog sagte dann etwas
        // anderes, als er tut. Darum die Normalisierung behalten und einen
        // Hinweis geben, bevor „Speichern" sie festschreibt.
        if (ev.phase && ev.phase !== phase) {
          module._context.notify(_t('phaseAdjusted'), 'warning');
        }
        this.form = {
          title: ev.title, date: ev.date, time: ev.time,
          end: fmtEnd(ev.time, ev.duration || 60),
          desc: ev.desc || '', phase,
        };
        this.openModal();
      },
      // Ein gespeicherter Termin kann eine Phase tragen, die der AKTIVE Zyklus
      // nicht kennt — aus einem Beispiel, einem Import oder einem Zyklus-
      // wechsel. Ungeprüft in den Vordruck kopiert, reichte „Speichern" sie an
      // die jetzt prüfende Senke und bräche die Oberfläche. Darum wird sie beim
      // Öffnen auf die erste Phase des aktiven Zyklus normalisiert.
      _draftPhase(phase) {
        const phases = phaseIds();
        return phases.includes(phase) ? phase : phases[0];
      },
      /** @noagent view transform: die Dauer aus Anfang und Ende des Vordrucks. */
      formDuration() {
        return ttm(this.form.end) - ttm(this.form.time);
      },
      /** @noagent view transform: die Dauer des Vordrucks als Text. */
      durationLabel() {
        const d = this.formDuration();
        return d >= MIN_DUR ? fmtDur(d) : '—';
      },
      /**
       * @noagent Dialogweg: liest den Terminvordruck aus und hält den Dialog
       * bei einer unvollständigen Eingabe offen, statt zu scheitern (E3).
       * Geschrieben wird über `addEvent`/`updateEvent`, dieselben Senken wie
       * die der Agentenfläche.
       */
      handleSave() {
        const title = (this.form.title || '').trim();
        const date = this.form.date;
        const time = this.form.time;
        const duration = this.formDuration();
        const desc = (this.form.desc || '').trim();
        const phase = this.form.phase;
        // Der Vordruck wird vor dem Speichern geprüft, nicht erst in der
        // Senke: ein unvollständiges Formular ist eine Rückfrage an den
        // Nutzer, kein Fehlschlag.
        if (!title || !date || !isIsoDate(date)) {
          module._context.notify(_t('requiredFields'), 'warning');
          return false;
        }
        // Die Startzeit gehört zu den Pflichtangaben. Ein `<input type="time">`
        // lässt sich leeren, und `ttm('')` fällt auf 09:00 zurück — die
        // Dauerschranke unten greift dann NICHT, und die geleerte Zeit lief
        // ungeprüft in die Senke, deren Wurf aus dem Dialog flog.
        if (!TIME_RE.test(time)) {
          module._context.notify(_t('requiredFields'), 'warning');
          return false;
        }
        if (duration < MIN_DUR) {
          module._context.notify(_t('invalidTimeRange'), 'warning');
          return false;
        }
        const fields = { title, date, time, duration, desc, phase };
        if (this.editingId) this.updateEvent(this.editingId, fields);
        else this.addEvent(fields);
        return true;
      },
      /**
       * @noagent Dialogweg: entfernt den Termin, der gerade bearbeitet wird;
       * den Knopf gibt es nur dort. Geschrieben wird über `removeEvent`.
       */
      handleDelete() {
        if (!this.editingId) return false;
        this.removeEvent(this.editingId);
        return true;
      },
    };
  },
});
