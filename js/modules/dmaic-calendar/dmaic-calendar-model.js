/**
 * D.Mike — DMAIC Calendar Model (dmaic-calendar-model.js)
 * Pure state + business logic for the project calendar: events, axis/day
 * configuration, month/week layout math. No DOM, no i18n, no CSS.
 */

export const SNAP = 5;
export const MIN_DUR = 5;
export const HOUR_H = 60;

// ─── Pure date / time helpers ────────────────────────────

/** Zero-pad a number to two digits. */
export function fmt2(n) { return String(n).padStart(2, '0'); }

/** Build an ISO date key. `m` is 0-based (matches Date.getMonth()). */
export function dateKey(y, m, d) { return `${y}-${fmt2(m + 1)}-${fmt2(d)}`; }

/** Date → ISO date key. */
export function dkd(d) { return dateKey(d.getFullYear(), d.getMonth(), d.getDate()); }

/** ISO weekday index: Monday → 0 … Sunday → 6. */
export function isoDow(d) { return (d.getDay() + 6) % 7; }

/** Monday (00:00) of the week containing `d`. */
export function getMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  dt.setDate(dt.getDate() - day + (day === 0 ? -6 : 1));
  dt.setHours(0, 0, 0, 0);
  return dt;
}

/** Snap minutes to the SNAP grid. */
export function snp(m) { return Math.round(m / SNAP) * SNAP; }

/** Minutes-of-day → "HH:MM" (clamped to 00:00–23:59). */
export function mtt(m) { const mm = Math.max(0, Math.min(1439, m)); return `${fmt2(Math.floor(mm / 60))  }:${  fmt2(mm % 60)}`; }

/** "HH:MM" → minutes-of-day (defaults to 09:00). */
export function ttm(t) { const [h, m] = (t || '09:00').split(':').map(Number); return h * 60 + m; }

/** End time of a start time + duration in minutes. */
export function fmtEnd(t, dur) { return mtt(ttm(t) + dur); }

/** Human-readable duration ("30min", "1h", "1h 30min"). */
export function fmtDur(m) {
  if (m < 60) return `${m  }min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}min` : `${h}h`;
}

/** Unique id for a new event. */
export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

const DEFAULTS = { axisFrom: 6, axisTo: 22, dayFrom: 0, dayTo: 6 };

function sanitizeEvent(e) {
  if (!e || typeof e !== 'object') return null;
  const ev = {
    id: typeof e.id === 'string' ? e.id : uid(),
    title: typeof e.title === 'string' ? e.title : '',
    date: typeof e.date === 'string' ? e.date : '',
    time: typeof e.time === 'string' ? e.time : '09:00',
    duration: typeof e.duration === 'number' ? e.duration : 60,
    desc: typeof e.desc === 'string' ? e.desc : '',
    phase: typeof e.phase === 'string' ? e.phase : 'define',
  };
  if (typeof e.source === 'string') ev.source = e.source;
  return ev;
}

export class State {
  events = [];
  axisFrom = DEFAULTS.axisFrom;
  axisTo = DEFAULTS.axisTo;
  dayFrom = DEFAULTS.dayFrom;
  dayTo = DEFAULTS.dayTo;
  // Active calendar view ('month' | 'week'). Persisted so a chosen view
  // survives a reload instead of snapping back to the month default.
  viewMode = 'month';

  // ─── Persistence ───────────────────────────────────────

  toJSON() {
    return {
      events: this.events.map(e => {
        const o = {
          id: e.id, title: e.title, date: e.date, time: e.time,
          duration: e.duration, desc: e.desc, phase: e.phase,
        };
        if (e.source) o.source = e.source;
        return o;
      }),
      axisFrom: this.axisFrom,
      axisTo: this.axisTo,
      dayFrom: this.dayFrom,
      dayTo: this.dayTo,
      viewMode: this.viewMode,
    };
  }

  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;
    if (Array.isArray(d.events)) s.events = d.events.map(sanitizeEvent).filter(Boolean);
    if (typeof d.axisFrom === 'number') s.axisFrom = d.axisFrom;
    if (typeof d.axisTo === 'number') s.axisTo = d.axisTo;
    if (typeof d.dayFrom === 'number') s.dayFrom = d.dayFrom;
    if (typeof d.dayTo === 'number') s.dayTo = d.dayTo;
    if (d.viewMode === 'month' || d.viewMode === 'week') s.viewMode = d.viewMode;
    return s;
  }

  /** True if the calendar holds any events (for loadExample confirm). */
  hasContent() { return this.events.length > 0; }

  // ─── Event business logic ──────────────────────────────

  /**
   * Insert a new event or update an existing one by id.
   * @param {object} fields {title,date,time,duration,desc,phase}
   * @param {string|null} editingId id to update, or null/undefined to insert
   */
  upsertEvent(fields, editingId) {
    if (editingId) {
      const ev = this.events.find(e => e.id === editingId);
      if (ev) Object.assign(ev, fields);
      return ev;
    }
    const ev = { id: uid(), ...fields };
    this.events.push(ev);
    return ev;
  }

  /** Remove an event by id. */
  removeEvent(id) {
    this.events = this.events.filter(e => e.id !== id);
  }

  /**
   * Replace all todo-sourced events with the supplied todo items.
   * Mirrors the legacy `_handleTodoSync` contract exactly.
   * @param {Array<{id:string,title:string,date:string,status?:string}>} items
   */
  applyTodoSync(items) {
    this.events = this.events.filter(e => e.source !== 'todo');
    for (const t of (items || [])) {
      this.events.push({
        id: `todo-${  t.id}`,
        title: t.title,
        date: t.date,
        time: '09:00',
        duration: 30,
        desc: '',
        phase: 'define',
        source: 'todo',
      });
    }
  }

  /** Events filtered by phase (null/empty → all). */
  eventsForPhase(filter) {
    return filter ? this.events.filter(e => e.phase === filter) : this.events.slice();
  }

  /** Events on a given date key, filtered by phase, sorted by start time. */
  eventsForDay(key, filter) {
    return this.eventsForPhase(filter)
      .filter(e => e.date === key)
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  /** Up to 5 upcoming events (date >= todayKey), sorted by date then time. */
  upcomingEvents(todayKey) {
    return this.events
      .filter(e => e.date >= todayKey)
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
      .slice(0, 5);
  }

  // ─── Month / week layout (raw, view-agnostic) ──────────

  /**
   * Month grid cell descriptors, padded to full weeks.
   * Returns `{ num, other, key|null, events[] }`. Today/outside flags are
   * computed by the view (they depend on "today" and visible-day config).
   */
  monthCells(year, month, filter) {
    const cells = [];
    const first = new Date(year, month, 1);
    const sd = isoDow(first);
    const dim = new Date(year, month + 1, 0).getDate();
    const pd = new Date(year, month, 0).getDate();

    // Pad before (trailing days of previous month)
    for (let i = sd - 1; i >= 0; i--) {
      cells.push({ num: pd - i, other: true, key: null, events: [], date: new Date(year, month, -i - 1 + pd) });
    }
    // Current month
    for (let d = 1; d <= dim; d++) {
      const key = dateKey(year, month, d);
      cells.push({
        num: d, other: false, key,
        events: this.eventsForDay(key, filter),
        date: new Date(year, month, d),
      });
    }
    // Pad after to complete the final week
    const rem = (Math.ceil(cells.length / 7) * 7) - cells.length;
    for (let d = 1; d <= rem; d++) {
      cells.push({ num: d, other: true, key: null, events: [], date: new Date(year, month + 1, d) });
    }
    return cells;
  }

  /** Visible weekday indices (dayFrom..dayTo inclusive). */
  visibleDayIndices() {
    const a = [];
    for (let i = this.dayFrom; i <= this.dayTo; i++) a.push(i);
    return a;
  }

  /** Visible hours (axisFrom..axisTo exclusive). */
  hoursArr() {
    const a = [];
    for (let h = this.axisFrom; h < this.axisTo; h++) a.push(h);
    return a;
  }

  /**
   * Visible half-hour slot start minutes (axisFrom..axisTo, step 30).
   * Drives the drag-to-create grid: each slot is a 30-minute block, so a
   * drawn span can start/end on the half hour. Full hours are the even
   * entries (m % 60 === 0), half hours the odd ones (m % 60 === 30).
   */
  halfSlotsArr() {
    const a = [];
    for (let m = this.axisFrom * 60; m < this.axisTo * 60; m += 30) a.push(m);
    return a;
  }

  /**
   * Visible dates of the week starting at `weekStartMs` (a Monday),
   * restricted to the visible weekday range.
   */
  weekDates(weekStartMs, dayFrom, dayTo) {
    const ws = new Date(weekStartMs);
    const all = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws);
      d.setDate(d.getDate() + i);
      all.push(d);
    }
    const out = [];
    for (let i = dayFrom; i <= dayTo; i++) out.push(all[i]);
    return out;
  }

  // ─── Axis pixel math ───────────────────────────────────

  gStart() { return this.axisFrom * 60; }
  gEnd() { return this.axisTo * 60; }
  minToPx(m) { return m - this.gStart(); }
  pxToMin(px) { return this.gStart() + px; }
  totalH() { return this.hoursArr().length * HOUR_H; }
}
