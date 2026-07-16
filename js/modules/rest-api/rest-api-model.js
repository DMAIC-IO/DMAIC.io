/**
 * D.Mike — REST API Manager Model (rest-api-model.js)
 * State + business logic only — no DOM, no i18n, no CSS classes, no view getters.
 *
 * An Endpoint stores a single REST GET configuration (name, URL, headers,
 * column mappings, write mode, schedule). State holds the list of endpoints
 * plus the currently active endpoint id.
 */

import { refToKey } from '../../ui/column-picker.js';

const SCHEDULE_UNITS = ['minutes', 'hours'];
const WRITE_MODES = ['replace', 'append', 'prepend'];

/** Generate a short unique id. */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Build a default schedule config. */
function defaultSchedule() {
  return { enabled: false, intervalValue: 5, intervalUnit: 'minutes' };
}

/** Sanitize a schedule object, migrating the legacy `intervalMinutes` field. */
function sanitizeSchedule(s) {
  const sched = defaultSchedule();
  if (s && typeof s === 'object') {
    sched.enabled = Boolean(s.enabled);
    // Legacy migration: intervalMinutes → intervalValue (minutes)
    if (s.intervalMinutes != null && s.intervalValue == null) {
      sched.intervalValue = Number(s.intervalMinutes) || 5;
      sched.intervalUnit = 'minutes';
    } else {
      sched.intervalValue = Number(s.intervalValue);
      if (!Number.isFinite(sched.intervalValue) || sched.intervalValue < 1) sched.intervalValue = 5;
      sched.intervalUnit = SCHEDULE_UNITS.includes(s.intervalUnit) ? s.intervalUnit : 'minutes';
    }
  }
  return sched;
}

export class Endpoint {
  constructor() {
    this.id = uid();
    this.name = '';
    this.url = '';
    /** @type {Array<{key:string,value:string}>} */
    this.headers = [];
    /** @type {Array<{jsonPath:string, columnRef:object|null}>} */
    this.mappings = [];
    this.writeMode = 'replace';
    this.schedule = defaultSchedule();
  }

  /** Convert the schedule interval to milliseconds. */
  scheduleToMs() {
    const val = this.schedule.intervalValue || 5;
    return this.schedule.intervalUnit === 'hours' ? val * 3600000 : val * 60000;
  }

  /**
   * Collect refKeys already assigned in other mappings (excluding `excludeIdx`).
   * @param {number} excludeIdx — mapping index to skip (-1 to include all)
   * @returns {Set<string>}
   */
  usedColumnKeys(excludeIdx) {
    const keys = new Set();
    for (let j = 0; j < this.mappings.length; j++) {
      if (j === excludeIdx) continue;
      const ref = this.mappings[j].columnRef;
      if (ref) keys.add(refToKey(ref));
    }
    return keys;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      url: this.url,
      headers: this.headers.map(h => ({ key: h.key, value: h.value })),
      mappings: this.mappings.map(m => ({ jsonPath: m.jsonPath, columnRef: m.columnRef })),
      writeMode: this.writeMode,
      schedule: { ...this.schedule },
    };
  }

  static fromJSON(d) {
    const ep = new Endpoint();
    if (!d || typeof d !== 'object') return ep;
    if (typeof d.id === 'string' && d.id) ep.id = d.id;
    ep.name = typeof d.name === 'string' ? d.name : '';
    ep.url = typeof d.url === 'string' ? d.url : '';
    ep.headers = Array.isArray(d.headers)
      ? d.headers.map(h => ({
          key: typeof h?.key === 'string' ? h.key : '',
          value: typeof h?.value === 'string' ? h.value : '',
        }))
      : [];
    ep.mappings = Array.isArray(d.mappings)
      ? d.mappings.map(m => ({
          jsonPath: typeof m?.jsonPath === 'string' ? m.jsonPath : '',
          columnRef: m?.columnRef ?? null,
        }))
      : [];
    ep.writeMode = WRITE_MODES.includes(d.writeMode) ? d.writeMode : 'replace';
    ep.schedule = sanitizeSchedule(d.schedule);
    return ep;
  }
}

export class State {
  static VERSION = '1.0';
  static ID = 'rest-api';

  constructor() {
    /** @type {Endpoint[]} */
    this.endpoints = [];
    /** @type {string|null} */
    this.activeId = null;
  }

  /** Return the currently active endpoint, or null. */
  activeEndpoint() {
    return this.endpoints.find(e => e.id === this.activeId) || null;
  }

  hasContent() {
    return this.endpoints.length > 0;
  }

  toJSON() {
    return {
      endpoints: this.endpoints.map(e => e.toJSON()),
      activeId: this.activeId,
    };
  }

  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;
    s.endpoints = Array.isArray(d.endpoints) ? d.endpoints.map(Endpoint.fromJSON) : [];
    s.activeId = typeof d.activeId === 'string' ? d.activeId : null;
    return s;
  }
}
