/**
 * D.Mike — Stoff-Feld-Analyse (TRIZ): Model.
 *
 * Ein Stoff-Feld-Modell aus zwei Stoffen (S1 wirkt auf S2), der Feldart
 * zwischen ihnen und der Art der Verknüpfung, dazu eine Problemnotiz, je
 * Standardlösung eine Notiz und die vorgemerkten Standardlösungen. Als
 * Ansichtsfelder der Listenfilter und die aufgeklappten Standardklassen. Die
 * Diagnose und die Tabelle der 78 Standardlösungen sind abgeleitet.
 * Gespeichert: `{ _schema, s1, s2, field, link, problemNote, notes, selected,
 * filterMode, expandedClasses }`.
 */
import { defineModel, command, text, oneOf, map, boolean, list, number } from '../../../core/model.js';
import { requireForm, requireKnownId } from '../../../core/validate.js';
import { from0 } from './migrations.js';
import { diagnose } from './diagnosis.js';
import { STANDARDS, STANDARD_IDS } from './standards.js';

/** Die ids der Standardlösungen zum Nachschlagen. */
const KNOWN_IDS = new Set(STANDARD_IDS);

/** @param {Record<string, any>} entries @returns {boolean} jeder Schlüssel ist die id einer Standardlösung */
const allKnown = (entries) => Object.keys(entries).every((k) => KNOWN_IDS.has(k));

/**
 * Nur die Einträge zu bekannten Standardlösungen.
 * @template T
 * @param {Record<string, T>} entries @returns {Record<string, T>}
 */
const onlyKnown = (entries) => Object.fromEntries(Object.entries(entries).filter(([k]) => KNOWN_IDS.has(k)));

/** @param {number} n @returns {boolean} die Nummer einer der fünf Standardklassen */
const isClassNumber = (n) => Number.isInteger(n) && n >= 1 && n <= 5;

/**
 * Die Diagnose des Stoff-Feld-Modells.
 *
 * @typedef {object} Diagnosis
 * @property {'partial'|'incomplete'|'complete-useful'|'complete-insufficient'|'complete-excessive'|'complete-harmful'} situation  partial: a substance is missing; incomplete: no field, no link chosen or the link is missing; complete-<link>: the model is complete with this link
 * @property {number[]} suggestedClasses  the recommended classes of standard solutions, 1 to 5
 */

/**
 * Eine Standardlösung mit Titel und Auslöser in der aktiven Sprache.
 *
 * @typedef {object} StandardEntry
 * @property {string} id  number of the standard solution, class.group.solution
 * @property {number} class  class of standard solutions, 1 to 5
 * @property {string} group  group, class.group
 * @property {string} title  title in the active language
 * @property {string} trigger  when the solution applies, in the active language
 */

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    /** der Stoff S1 — der Stoff, der die Wirkung auslöst */
    s1: text(),
    /** der Stoff S2 — der Stoff, auf den gewirkt wird */
    s2: text(),
    /** die Feldart zwischen den Stoffen; leer, solange keine gewählt ist */
    field: oneOf(['', 'M', 'A', 'T', 'C', 'E', 'Mg']),
    /** die Verknüpfung der Stoffe; leer, solange keine gewählt ist */
    link: oneOf(['', 'useful', 'insufficient', 'excessive', 'harmful', 'missing']),
    /** die Problemnotiz zum Stoff-Feld-Modell */
    problemNote: text(),
    /** je Standardlösung eine Notiz, nach ihrer id */
    notes: map(text(), text()),
    /** die vorgemerkten Standardlösungen, nach ihrer id */
    selected: map(text(), boolean()),
  },
  view: {
    /** der Listenfilter: auto zeigt nur die empfohlenen Klassen, all alle fünf */
    filterMode: oneOf(['auto', 'all']),
    /** die Nummern der aufgeklappten Standardklassen in gespeicherter Reihenfolge */
    expandedClasses: list(number({ integer: true })),
  },
  invariants: {
    knownNotes: {
      fields: ['notes'],
      test(m) { return allKnown(m.notes); },
      repair(m) { m._v.notes = onlyKnown(m._v.notes); },
    },
    knownSelections: {
      fields: ['selected'],
      test(m) { return allKnown(m.selected); },
      repair(m) { m._v.selected = onlyKnown(m._v.selected); },
    },
    validExpandedClasses: {
      fields: ['expandedClasses'],
      test(m) {
        const c = m.expandedClasses;
        return c.every(isClassNumber) && new Set(c).size === c.length;
      },
      repair(m) {
        m._v.expandedClasses = [...new Set(m._v.expandedClasses.filter(isClassNumber))];
      },
    },
  },
  commands: {
    setStandardNote: command({
      params: { stdId: text(), text: text() },
      run({ stdId, text: note }) {
        requireKnownId('stdId', stdId, STANDARD_IDS);
        const { [stdId]: _old, ...rest } = this.notes;
        this.notes = note ? { ...rest, [stdId]: note } : rest;
      },
    }),
    setStandardSelected: command({
      params: { stdId: text(), selected: boolean() },
      run({ stdId, selected }) {
        requireKnownId('stdId', stdId, STANDARD_IDS);
        const { [stdId]: _old, ...rest } = this.selected;
        this.selected = selected ? { ...rest, [stdId]: true } : rest;
      },
    }),
    setExpandedClasses: command({
      params: { classes: list(number({ integer: true, min: 1, max: 5 })) },
      run({ classes }) {
        requireForm('classes', classes, new Set(classes).size === classes.length, 'a list of class numbers without duplicates');
        this.expandedClasses = [...classes];
      },
    }),
  },
  derived: {
    /**
     * Die Diagnose aus den beiden Stoffen, der Feldart und der Verknüpfung.
     *
     * @this {import('./model.types.js').StateModel}
     * @returns {Diagnosis}
     */
    diagnosis() {
      return diagnose(this.s1, this.s2, this.field, this.link);
    },
    /**
     * Die 78 Standardlösungen mit Titel und Auslöser in der aktiven Sprache,
     * unabhängig vom Listenfilter.
     *
     * @param {import('../../../core/source-reader.js').Source} _src
     * @param {any} _d
     * @param {(key: string, params?: object) => string} t Übersetzer des Moduls
     * @returns {StandardEntry[]}
     */
    standards(_src, _d, t) {
      return STANDARDS.map((s) => ({
        id: s.id,
        class: s.class,
        group: s.group,
        title: t(`standards.${s.id}.title`),
        trigger: t(`standards.${s.id}.trigger`),
      }));
    },
  },
  derivedBulk: ['standards'],
});
