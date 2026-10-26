/**
 * D.Mike — Unit Converter Model (unit-converter-model.js)
 * Pure state + business logic (no DOM, no i18n, no view concerns).
 */

import { CATEGORIES } from './unit-data.js';
import { decimalOr } from '../../core/parse-decimal.js';

// ── Pure helpers ─────────────────────────────────────────────

/**
 * Format a number for display using German conventions.
 * @param {number} n
 * @returns {string}
 */
export function formatNumber(n) {
  if (!isFinite(n) || isNaN(n)) return '—';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e12 || (abs < 1e-6 && abs > 0)) return n.toExponential(6);
  if (abs >= 1e6) return n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  if (abs >= 1) return parseFloat(n.toPrecision(10)).toLocaleString('de-DE', { maximumFractionDigits: 6 });
  return parseFloat(n.toPrecision(8)).toString().replace('.', ',');
}

/**
 * Return all unit keys compatible with the given unit (same group, or all units
 * if the category has no groups).
 * @param {string} catKey
 * @param {string} unitKey
 * @returns {string[]}
 */
export function groupMembers(catKey, unitKey) {
  const cat = CATEGORIES[catKey];
  if (!cat) return [];
  if (!cat.groups) return Object.keys(cat.units);
  for (const members of Object.values(cat.groups)) {
    if (members.includes(unitKey)) return members;
  }
  return Object.keys(cat.units);
}

const DEFAULT_CAT = 'laenge';

/** First two distinct unit keys of a category (respecting groups). */
function defaultUnits(catKey) {
  const cat = CATEGORIES[catKey];
  const keys = cat ? Object.keys(cat.units) : [];
  const from = keys[0] || '';
  const to = groupMembers(catKey, from).find(k => k !== from) || keys[1] || from;
  return { from, to };
}

// ── State ────────────────────────────────────────────────────

export class State {
  static VERSION = '1.0';
  static ID = 'unit-converter';

  _schema = { name: State.ID, version: State.VERSION };

  /** @type {string} der Schlüssel der aktiven Größenart, z. B. laenge oder masse */
  activeCat = DEFAULT_CAT;
  /** @type {string} der Schlüssel der Einheit, aus der umgerechnet wird */
  fromUnit = '';
  /** @type {string} der Schlüssel der Einheit, in die umgerechnet wird */
  toUnit = '';
  /** @type {string} der eingegebene Wert als Text; ein Komma gilt als Dezimaltrennzeichen */
  inputVal = '';

  /** @type {number} die Position der Ausgangszeitzone in der Zeitzonenliste */
  tzFrom = 1; // Berlin
  /** @type {number} die Position der Zielzeitzone in der Zeitzonenliste */
  tzTo = 0;   // UTC
  /** @type {string} die Uhrzeit der Umrechnung als HH:MM; leer heißt nicht gesetzt */
  tzTime = '12:00';
  /** @type {string} das Datum der Umrechnung als YYYY-MM-DD; leer heißt nicht gesetzt */
  tzDate = '';

  constructor() {
    const d = defaultUnits(this.activeCat);
    this.fromUnit = d.from;
    this.toUnit = d.to;
  }

  // ── Unit selection helpers (raw data) ──────────────────────

  /** Active category definition from unit-data. */
  get cat() {
    return CATEGORIES[this.activeCat] || CATEGORIES[DEFAULT_CAT];
  }

  /** Map of all unit keys → unit def for the active category. */
  unitKeys() {
    return this.cat.units;
  }

  /** Compatible "to" unit keys for the current from-unit. */
  toUnitKeys() {
    return groupMembers(this.activeCat, this.fromUnit);
  }

  /** Switch category and reset the unit selection to defaults. */
  selectCategory(catKey) {
    if (!CATEGORIES[catKey]) return;
    this.activeCat = catKey;
    const d = defaultUnits(catKey);
    this.fromUnit = d.from;
    this.toUnit = d.to;
  }

  /** Ensure the to-unit is compatible with the from-unit; pick a fallback if not. */
  ensureToCompatible(preferred) {
    const compatible = this.toUnitKeys();
    if (preferred && compatible.includes(preferred) && preferred !== this.fromUnit) {
      this.toUnit = preferred;
      return;
    }
    if (compatible.includes(this.toUnit) && this.toUnit !== this.fromUnit) return;
    this.toUnit = compatible.find(k => k !== this.fromUnit) || compatible[0] || this.fromUnit;
  }

  // ── Conversion (raw numbers, no formatting) ────────────────

  /**
   * Parse the input value (decimal comma and German thousands grouping
   * allowed, see {@link decimalOr}).
   * @returns {number} NaN when empty or invalid
   */
  parsedInput() {
    return decimalOr(this.inputVal, NaN);
  }

  /**
   * Converted result as a raw number, or null when input/units are invalid.
   * @returns {number|null}
   */
  result() {
    const num = this.parsedInput();
    if (isNaN(num)) return null;
    const cat = this.cat;
    const from = cat.units[this.fromUnit];
    const to = cat.units[this.toUnit];
    if (!from || !to) return null;
    const res = to.fromBase(from.toBase(num));
    if (!isFinite(res) || isNaN(res)) return null;
    return res;
  }

  /** Conversion factor for 1 from-unit, or null for logarithmic conversions. */
  formulaValue() {
    const cat = this.cat;
    const from = cat.units[this.fromUnit];
    const to = cat.units[this.toUnit];
    if (!from || !to) return null;
    const v = to.fromBase(from.toBase(1));
    return isFinite(v) ? v : null;
  }

  /**
   * Quick-reference rows with raw computed results.
   * @returns {Array<{val:number, from:string, to:string, result:number|null}>}
   */
  refRows() {
    const cat = this.cat;
    return (cat.refs || []).map(([val, from, to]) => {
      const uf = cat.units[from];
      const ut = cat.units[to];
      let result = null;
      if (uf && ut) {
        const r = ut.fromBase(uf.toBase(val));
        result = isFinite(r) ? r : null;
      }
      return { val, from, to, result };
    });
  }

  // ── Persistence ────────────────────────────────────────────

  hasContent() {
    if (this.inputVal) return true;
    if (this.activeCat !== DEFAULT_CAT) return true;
    const d = defaultUnits(DEFAULT_CAT);
    if (this.fromUnit !== d.from || this.toUnit !== d.to) return true;
    if (this.tzFrom !== 1 || this.tzTo !== 0) return true;
    if (this.tzTime !== '12:00') return true;
    return false;
  }

  toJSON() {
    return {
      _schema: { ...this._schema },
      activeCat: this.activeCat,
      fromUnit: this.fromUnit,
      toUnit: this.toUnit,
      inputVal: this.inputVal,
      tzFrom: this.tzFrom,
      tzTo: this.tzTo,
      tzTime: this.tzTime,
      tzDate: this.tzDate,
    };
  }

  static fromJSON(d) {
    const s = new State();
    if (!d) return s;

    s.activeCat = CATEGORIES[d.activeCat] ? d.activeCat : DEFAULT_CAT;

    // Recompute defaults for the (possibly changed) category, then validate selection.
    const def = defaultUnits(s.activeCat);
    const units = s.cat.units;
    s.fromUnit = (typeof d.fromUnit === 'string' && units[d.fromUnit]) ? d.fromUnit : def.from;
    if (typeof d.toUnit === 'string' && units[d.toUnit] && groupMembers(s.activeCat, s.fromUnit).includes(d.toUnit)) {
      s.toUnit = d.toUnit;
    } else {
      s.ensureToCompatible();
    }

    s.inputVal = typeof d.inputVal === 'string' ? d.inputVal : '';
    s.tzFrom = Number.isInteger(d.tzFrom) ? d.tzFrom : 1;
    s.tzTo = Number.isInteger(d.tzTo) ? d.tzTo : 0;
    s.tzTime = typeof d.tzTime === 'string' ? d.tzTime : '12:00';
    s.tzDate = typeof d.tzDate === 'string' ? d.tzDate : '';
    return s;
  }
}

/**
 * Format a time-zone difference in minutes as hours and minutes, e.g.
 * `+5h 30min`, `+0h`, `-1h`, `-0h 30min`. The sign is taken from the
 * difference itself, not from the whole-hour part, so that differences
 * below one hour keep their minus sign. Uses the ASCII minus.
 * @param {number} diffMinutes difference in minutes (target − source)
 * @returns {string}
 */
export function formatTzDiff(diffMinutes) {
  const sign = diffMinutes < 0 ? '-' : '+';
  const abs = Math.abs(diffMinutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return `${sign}${hours}h${mins ? ` ${mins}min` : ''}`;
}

/**
 * Parse a `shortOffset` time-zone name as produced by `Intl.DateTimeFormat`
 * (`GMT`, `GMT+1`, `GMT+5:30`, `GMT-0:30`) into an offset in minutes. The
 * sign is read from the text, not from the parsed hours, so `GMT-0:30`
 * yields −30 rather than +30.
 * @param {string} str the offset text
 * @returns {number} offset from UTC in minutes; 0 if the text is unparseable
 */
export function parseGmtOffset(str) {
  const m = String(str).match(/GMT(?:([+-]?)(\d+))?(?::(\d+))?/);
  if (!m) return 0;
  const total = parseInt(m[2] || '0', 10) * 60 + parseInt(m[3] || '0', 10);
  return m[1] === '-' ? -total : total;
}
