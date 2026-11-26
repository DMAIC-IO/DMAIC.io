/**
 * D.Mike — Einheitenumrechner: Model.
 *
 * Größenart, beide Einheiten und der eingegebene Wert als Text; dazu
 * Ausgangs- und Zielzeitzone (Position in der Zeitzonenliste), Uhrzeit und
 * Datum der Zeitzonenumrechnung. Ergebnisse sind abgeleitet (Zahlen, keine
 * Anzeigetexte). Ohne DOM, ohne i18n.
 *
 * Gespeichert: `{ _schema, activeCat, fromUnit, toUnit, inputVal, tzFrom,
 * tzTo, tzTime, tzDate }`. Dass die Einheiten zur Größenart und zueinander
 * passen, sichert die Invariante `unitsValid` (beim Laden repariert wie das
 * alte `fromJSON`, beim Schreiben abgelehnt).
 */
import { defineModel, command, text, number, oneOf } from '../../../core/model.js';
import { requireForm } from '../../../core/validate.js';
import { decimalOr } from '../../../core/number-format.js';
import { isIsoDate, todayISO } from '../../../core/local-date.js';
import { from0 } from './migrations.js';
import { TIMEZONES } from './units.js';
import {
  DEFAULT_CAT, TIME_RE, groupMembers, unitKeysOf, defaultUnits, compatibleTo,
  convert, factor, convertTimezone, zonedParts,
} from './convert.js';

/** Die Schlüssel der Größenarten (gleich `Object.keys(CATEGORIES)`, Unit-Test). */
export const CATEGORY_KEYS = [
  'laenge', 'flaeche', 'volumen', 'masse', 'druck', 'temperatur', 'kraft', 'drehmoment', 'energie',
  'leistung', 'durchfluss', 'geschwindigkeit', 'zeit', 'winkel', 'drehzahl', 'ph', 'konzentration',
  'schall', 'laborwerte',
];

/**
 * Das Ergebnis der Einheitenumrechnung.
 *
 * @typedef {object} ConversionResult
 * @property {number|null} value  das umgerechnete Ergebnis, ungerundet
 * @property {number|null} factor  der Wert einer Ausgangseinheit in der Zieleinheit; leer bei logarithmischen Größen
 */

/**
 * Das Ergebnis der Zeitzonenumrechnung.
 *
 * @typedef {object} TimezoneResult
 * @property {string|null} time  die Uhrzeit in der Zielzeitzone als HH:MM
 * @property {string|null} date  das Datum in der Zielzeitzone als YYYY-MM-DD
 * @property {number|null} diffHours  Zielzeitzone minus Ausgangszeitzone in Stunden
 */

/**
 * Passen die Einheiten zur Größenart und zueinander?
 * @param {{ activeCat: string, fromUnit: string, toUnit: string }} m
 * @returns {boolean}
 */
const unitsFit = (m) => unitKeysOf(m.activeCat).includes(m.fromUnit)
  && groupMembers(m.activeCat, m.fromUnit).includes(m.toUnit);

export class State extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    /** der Schlüssel der aktiven Größenart, z. B. laenge oder masse */
    activeCat: oneOf(CATEGORY_KEYS, { default: 'laenge' }),
    /** der Schlüssel der Einheit, aus der umgerechnet wird */
    fromUnit: text({ default: 'nm' }),
    /** der Schlüssel der Einheit, in die umgerechnet wird */
    toUnit: text({ default: 'um' }),
    /** der eingegebene Wert als Text; ein Komma gilt als Dezimaltrennzeichen */
    inputVal: text(),
    /** die Position der Ausgangszeitzone in der Zeitzonenliste */
    tzFrom: number({ integer: true, min: 0, max: 22, default: 1 }),
    /** die Position der Zielzeitzone in der Zeitzonenliste */
    tzTo: number({ integer: true, min: 0, max: 22, default: 0 }),
    /** die Uhrzeit der Umrechnung als HH:MM; leer heißt nicht gesetzt */
    tzTime: text({ default: '12:00' }),
    /** das Datum der Umrechnung als YYYY-MM-DD; leer heißt nicht gesetzt */
    tzDate: text({ default: () => todayISO() }),
  },
  view: {},
  invariants: {
    unitsValid: {
      fields: ['fromUnit', 'toUnit', 'activeCat'],
      test(m) { return unitsFit(m); },
      repair(m) {
        if (!unitKeysOf(m._v.activeCat).includes(m._v.fromUnit)) m._v.fromUnit = defaultUnits(m._v.activeCat).from;
        if (!groupMembers(m._v.activeCat, m._v.fromUnit).includes(m._v.toUnit)) {
          m._v.toUnit = compatibleTo(m._v.activeCat, m._v.fromUnit, m._v.toUnit);
        }
      },
    },
    timeForm: {
      fields: ['tzTime'],
      test(m) { return m.tzTime === '' || TIME_RE.test(m.tzTime); },
      repair(m) { m._v.tzTime = ''; },
    },
    dateForm: {
      fields: ['tzDate'],
      test(m) { return m.tzDate === '' || isIsoDate(m.tzDate); },
      repair(m) { m._v.tzDate = ''; },
    },
  },
  commands: {
    selectCategory: command({
      params: { catKey: oneOf(CATEGORY_KEYS) },
      run({ catKey }) {
        const d = defaultUnits(catKey);
        this.activeCat = catKey;
        this.fromUnit = d.from;
        this.toUnit = d.to;
      },
    }),
    setFromUnit: command({
      params: { unitKey: text() },
      run({ unitKey }) {
        const keys = unitKeysOf(this.activeCat);
        requireForm('unitKey', unitKey, keys.includes(unitKey), keys.join(', '));
        this.toUnit = compatibleTo(this.activeCat, unitKey, this.toUnit, this.toUnit);
        this.fromUnit = unitKey;
      },
    }),
    swapUnits: command({
      run() {
        const from = this.fromUnit;
        const to = this.toUnit;
        this.toUnit = compatibleTo(this.activeCat, to, to, from);
        this.fromUnit = to;
      },
    }),
    swapTimezones: command({
      run() {
        const from = this.tzFrom;
        this.tzFrom = this.tzTo;
        this.tzTo = from;
      },
    }),
    tzSetNow: command({
      run() {
        const now = zonedParts(TIMEZONES[this.tzFrom].tz, new Date());
        this.tzTime = now.time;
        this.tzDate = now.date;
      },
    }),
  },
  derived: {
    /**
     * Die Einheitenschlüssel der aktiven Größenart.
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    unitKeys() {
      return unitKeysOf(this.activeCat);
    },
    /**
     * Die Einheitenschlüssel, die zur Ausgangseinheit passen.
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    toUnitKeys() {
      return groupMembers(this.activeCat, this.fromUnit);
    },
    /**
     * Das umgerechnete Ergebnis und der Umrechnungsfaktor.
     * @this {import('./model.types.js').StateModel}
     * @returns {ConversionResult}
     */
    result() {
      return {
        value: convert(this.activeCat, this.fromUnit, this.toUnit, decimalOr(this.inputVal, NaN)),
        factor: factor(this.activeCat, this.fromUnit, this.toUnit),
      };
    },
    /**
     * Uhrzeit und Datum in der Zielzeitzone und der Zeitunterschied.
     * @this {import('./model.types.js').StateModel}
     * @returns {TimezoneResult}
     */
    timezone() {
      return convertTimezone(this.tzFrom, this.tzTo, this.tzTime, this.tzDate);
    },
  },
}) {
  /**
   * Inhalt hat die Umrechnung, sobald etwas von der Vorgabe abweicht; das
   * Datum zählt nicht (es ist anfangs der heutige Tag).
   * @returns {boolean}
   */
  hasContent() {
    const d = defaultUnits(DEFAULT_CAT);
    return Boolean(this.inputVal) || this.activeCat !== DEFAULT_CAT
      || this.fromUnit !== d.from || this.toUnit !== d.to
      || this.tzFrom !== 1 || this.tzTo !== 0 || this.tzTime !== '12:00';
  }
}

